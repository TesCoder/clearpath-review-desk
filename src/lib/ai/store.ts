import "server-only";
import { db } from "../db";
import type { AssetView } from "../data";
import { finalizeReview, reviewWithModel } from "./review";
import { getClaimModel, isAiConfigured } from "./select";
import { PROMPT_VERSION, type AiFinding, type AiReview } from "./types";

// Spend limits for a public demo with no sign-in.
const MAX_CALLS_PER_WORKSPACE_PER_DAY = 40;
const MAX_CALLS_PER_DAY = 1500;
/** How long one in-flight call for a given text blocks another for the same text. */
const IN_FLIGHT_SECONDS = 30;

/** Results are kept per prompt version and per model route, so the two routes never mix. */
const cacheVersion = () => `${PROMPT_VERSION}|${getClaimModel().name}`;

/**
 * A stored result holds what the model said that survived the quote check.
 * Whether the review is complete is worked out again on every read, against
 * the code checks as they are now.
 */
export async function getStoredReview(asset: AssetView): Promise<AiReview | null> {
  if (!asset.terms) return null;
  const rows = await db()`
    select findings, dropped, model, addresses_reviewer from ai_reviews
    where fingerprint = ${asset.latest.fingerprint} and offer_revision_id = ${asset.terms.revisionId}
      and placement = ${asset.placement} and prompt_version = ${cacheVersion()}
  `;
  if (!rows.length) return null;
  return finalizeReview(
    asset.latest.body,
    rows[0].findings as AiFinding[],
    rows[0].dropped,
    rows[0].model,
    rows[0].addresses_reviewer === true,
  );
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
    if (row) {
      out.set(a.id, finalizeReview(a.latest.body, row.findings as AiFinding[], row.dropped, row.model, row.addresses_reviewer === true));
    }
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
  const stored = await getStoredReview(asset);
  if (stored) return stored;
  if (!asset.terms) return unavailable("No offer terms apply on the planned date, so there is nothing to compare with.");
  if (!isAiConfigured()) return unavailable("The AI claim finder is not set up on this deployment.");

  const sql = db();
  const terms = asset.terms;
  const key = [asset.latest.fingerprint, terms.revisionId, asset.placement, cacheVersion()].join("|");

  // Reserve the call before making it. The lock makes the count and the
  // reservation one step, so parallel requests cannot each see room under the
  // cap, and two requests for the same text cannot both call the model.
  const reservation = await sql.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(774411)`;
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
    review = await reviewWithModel(asset.latest.body, terms, asset.placement, getClaimModel());
    // Store only what the model actually answered. A failed call (a decline, a
    // cut-off or malformed answer, an outage) is not kept, so one bad moment
    // does not mark this ad incomplete for every later visitor.
    if (review.answered) {
      await sql`
        insert into ai_reviews
          (fingerprint, offer_revision_id, placement, prompt_version, status, findings, dropped, missed, reason, model, addresses_reviewer)
        values (${asset.latest.fingerprint}, ${terms.revisionId}, ${asset.placement}, ${cacheVersion()},
                ${review.status}, ${sql.json(review.findings)}, ${review.dropped}, ${sql.json(review.missedByModel)},
                ${review.reason}, ${review.model}, ${review.addressesReviewer})
        on conflict do nothing
      `;
    }
  } finally {
    await sql`delete from ai_pending where cache_key = ${key}`;
  }
  return review;
}
