import "server-only";
import { db } from "../db";
import type { AssetView } from "../data";
import { anthropicModel, isAiConfigured } from "./anthropic";
import { reviewWithModel } from "./review";
import { PROMPT_VERSION, type AiFinding, type AiReview } from "./types";

// Spend limits for a public demo with no sign-in.
const MAX_CALLS_PER_WORKSPACE_PER_DAY = 40;
const MAX_CALLS_PER_DAY = 1500;

export async function getStoredReview(asset: AssetView): Promise<AiReview | null> {
  if (!asset.terms) return null;
  const rows = await db()`
    select status, findings, dropped, missed, reason, model from ai_reviews
    where fingerprint = ${asset.latest.fingerprint} and offer_revision_id = ${asset.terms.revisionId}
      and placement = ${asset.placement} and prompt_version = ${PROMPT_VERSION}
  `;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    status: r.status,
    findings: r.findings as AiFinding[],
    dropped: r.dropped,
    missedByModel: r.missed as string[],
    reason: r.reason,
    model: r.model,
  };
}

const unavailable = (reason: string): AiReview => ({
  status: "unavailable",
  findings: [],
  dropped: 0,
  missedByModel: [],
  reason,
  model: anthropicModel.name,
});

/** Runs the claim finder on the ad's latest version, unless a result is already stored. */
export async function runReview(workspaceId: string, asset: AssetView): Promise<AiReview> {
  const stored = await getStoredReview(asset);
  if (stored) return stored;
  if (!asset.terms) return unavailable("No offer terms apply on the planned date, so there is nothing to compare with.");
  if (!isAiConfigured()) return unavailable("The AI claim finder is not set up on this deployment.");

  const sql = db();
  const [used] = await sql`
    select count(*) filter (where workspace_id = ${workspaceId})::int as mine, count(*)::int as everyone
    from ai_calls where created_at > now() - interval '24 hours'
  `;
  if (used.mine >= MAX_CALLS_PER_WORKSPACE_PER_DAY || used.everyone >= MAX_CALLS_PER_DAY) {
    return unavailable("The demo's daily limit for AI calls has been reached. The code checks still apply.");
  }

  const review = await reviewWithModel(asset.latest.body, asset.terms, asset.placement, anthropicModel);
  await sql`insert into ai_calls (workspace_id, outcome) values (${workspaceId}, ${review.status})`;
  if (review.status !== "unavailable") {
    await sql`
      insert into ai_reviews (fingerprint, offer_revision_id, placement, prompt_version, status, findings, dropped, missed, reason, model)
      values (${asset.latest.fingerprint}, ${asset.terms.revisionId}, ${asset.placement}, ${PROMPT_VERSION},
              ${review.status}, ${sql.json(review.findings)}, ${review.dropped}, ${sql.json(review.missedByModel)},
              ${review.reason}, ${review.model})
      on conflict do nothing
    `;
  }
  return review;
}
