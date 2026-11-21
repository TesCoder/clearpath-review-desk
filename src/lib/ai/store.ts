import "server-only";
import { db } from "../db";
import type { OfferTerms } from "../checks";
import type { AssetView } from "../data";
import { finalizeReview, reviewWithModel } from "./review";
import { getClaimModel, isAiConfigured } from "./select";
import { PROMPT_VERSION, type AiFinding, type AiReview } from "./types";

// Spend limits for a public demo with no sign-in.
const MAX_CALLS_PER_WORKSPACE_PER_DAY = 40;
const MAX_CALLS_PER_DAY = 1500;
/** How long one in-flight call for a given text blocks another for the same text. */
const IN_FLIGHT_SECONDS = 30;
/** An arbitrary fixed number naming the one lock every reservation takes. Any value works as long as nothing else uses it. */
const RESERVATION_LOCK = 774411;

/** Results are kept per prompt version and per model route, so the two routes never mix. */
const cacheVersion = () => `${PROMPT_VERSION}|${getClaimModel().name}`;

/**
 * A stored result holds what the model said that survived the quote check.
 * Whether the review is complete is worked out again on every read, against
 * the code checks as they are now.
 */
export async function getStoredReview(asset: AssetView): Promise<AiReview | null> {
  const target = targetOf(asset);
  return target ? getStoredFor(target) : null;
}

/** What the claim finder reads: one exact text, the offer terms it is compared with, and where it will run. */
export type ReviewTarget = { body: string; fingerprint: string; terms: OfferTerms; placement: string };

/** What to read for an ad's latest version, or null when no offer terms apply on its date. */
function targetOf(asset: AssetView): ReviewTarget | null {
  if (!asset.terms) return null;
  return { body: asset.latest.body, fingerprint: asset.latest.fingerprint, terms: asset.terms, placement: asset.placement };
}

type StoredRow = { findings: unknown; dropped: number; model: string; addresses_reviewer: unknown };

/** A stored row back as a review. Completeness is worked out again here, against the code checks as they are now. */
function fromRow(body: string, row: StoredRow): AiReview {
  return finalizeReview(body, row.findings as AiFinding[], row.dropped, row.model, row.addresses_reviewer === true);
}

async function getStoredFor(target: ReviewTarget): Promise<AiReview | null> {
  const rows = await db()`
    select findings, dropped, model, addresses_reviewer from ai_reviews
    where fingerprint = ${target.fingerprint} and offer_revision_id = ${target.terms.revisionId}
      and placement = ${target.placement} and prompt_version = ${cacheVersion()}
  `;
  return rows.length ? fromRow(target.body, rows[0] as unknown as StoredRow) : null;
}

/** Stored results for many ads at once, for the queue. Keyed by ad id. */
export async function getStoredReviews(assets: AssetView[]): Promise<Map<string, AiReview>> {
  const out = new Map<string, AiReview>();
  const withTerms = assets.filter((a) => a.terms);
  if (!withTerms.length) return out;
  const rows = await db()`
    select fingerprint, offer_revision_id, placement, findings, dropped, model, addresses_reviewer from ai_reviews
    where prompt_version = ${cacheVersion()} and fingerprint in ${db()(withTerms.map((a) => a.latest.fingerprint))}
  `;
  for (const a of withTerms) {
    const row = rows.find(
      (r) => r.fingerprint === a.latest.fingerprint && r.offer_revision_id === a.terms!.revisionId && r.placement === a.placement,
    );
    if (row) out.set(a.id, fromRow(a.latest.body, row as unknown as StoredRow));
  }
  return out;
}

const unavailable = (reason: string): AiReview => ({
  status: "unavailable",
  findings: [],
  dropped: 0,
  missedByModel: [],
  reason,
  model: getClaimModel().name,
  addressesReviewer: false,
  answered: false,
});

/** Runs the claim finder on the ad's latest version, unless a result is already stored. */
export async function runReview(workspaceId: string, asset: AssetView): Promise<AiReview> {
  const target = targetOf(asset);
  if (!target) return unavailable("No offer terms apply on the planned date, so there is nothing to compare with.");
  return runReviewFor(workspaceId, target);
}

/**
 * Runs the claim finder on one text, unless a result is already stored. The
 * reviewer's screen and the marketer's wording check both come through here,
 * so they share the same stored results, the same spend limits and the same
 * quote checks. A draft the marketer checked and then submitted unchanged
 * costs no second call when the reviewer opens it.
 */
export async function runReviewFor(workspaceId: string, target: ReviewTarget): Promise<AiReview> {
  const stored = await getStoredFor(target);
  if (stored) return stored;
  if (!isAiConfigured()) return unavailable("The AI claim finder is not set up on this deployment.");

  const sql = db();
  const terms = target.terms;
  const key = [target.fingerprint, terms.revisionId, target.placement, cacheVersion()].join("|");

  // Reserve the call before making it. The lock makes the count and the
  // reservation one step, so parallel requests cannot each see room under the
  // cap, and two requests for the same text cannot both call the model.
  const reservation = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(${RESERVATION_LOCK})`;
    const [used] = await tx`
      select count(*) filter (where workspace_id = ${workspaceId})::int as mine, count(*)::int as everyone
      from ai_calls where created_at > now() - interval '24 hours'
    `;
    if (used.mine >= MAX_CALLS_PER_WORKSPACE_PER_DAY || used.everyone >= MAX_CALLS_PER_DAY) return "cap";
    const claimed = await tx`
      insert into ai_pending (cache_key) values (${key})
      on conflict (cache_key) do update set started_at = now()
        where ai_pending.started_at < now() - make_interval(secs => ${IN_FLIGHT_SECONDS})
      returning cache_key
    `;
    if (!claimed.length) return "busy";
    await tx`insert into ai_calls (workspace_id, outcome) values (${workspaceId}, 'started')`;
    return "ok";
  });
  if (reservation === "cap") {
    return unavailable("The demo's daily limit for AI calls has been reached. The code checks still apply.");
  }
  if (reservation === "busy") {
    return unavailable("The AI is already reading this ad. Try again in a few seconds.");
  }

  let review: AiReview;
  try {
    review = await reviewWithModel(target.body, terms, target.placement, getClaimModel());
    // Store only what the model actually answered. A failed call (a decline, a
    // cut-off or malformed answer, an outage) is not kept, so one bad moment
    // does not mark this ad incomplete for every later visitor.
    if (review.answered) {
      try {
        await sql`
        insert into ai_reviews
          (fingerprint, offer_revision_id, placement, prompt_version, status, findings, dropped, missed, reason, model, addresses_reviewer)
        values (${target.fingerprint}, ${terms.revisionId}, ${target.placement}, ${cacheVersion()},
                ${review.status}, ${sql.json(review.findings)}, ${review.dropped}, ${sql.json(review.missedByModel)},
                ${review.reason}, ${review.model}, ${review.addressesReviewer})
        on conflict do nothing
      `;
      } catch (e) {
        // The offer revision was removed while the model was answering (Reset
        // demo on a revision added in that demo). There is nothing to store
        // the result under, and the answer is still returned to the caller.
        if ((e as { code?: string }).code !== "23503") throw e;
      }
    }
  } finally {
    await sql`delete from ai_pending where cache_key = ${key}`;
  }
  return review;
}
