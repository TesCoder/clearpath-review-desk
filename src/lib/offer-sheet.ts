import "server-only";
import { randomBytes } from "node:crypto";
import { loadAssets, loadRevisions } from "./data";
import { db } from "./db";
import { logEvent } from "./events";
import { MAX_ADDED_REVISIONS, SUPPORTED_PRODUCT, refuseRevision, termsOn, type NewRevisionInput } from "./offers";

export type AddRevisionResult =
  | { ok: true; revisionId: string; revision: number; affected: string[] }
  | { ok: false; error: string };

/**
 * Adds a revision to an offer in one visitor's demo. It is always a new
 * revision: nothing already on the offer sheet is edited, and the shared
 * reference revisions are never written to.
 *
 * Every approval is bound to the revision it was checked against, so an
 * approved ad whose date the new revision covers stops being approved by
 * derivation (status.ts). Nothing here sets a status. This only records which
 * ads those were, by reading the same status rule before and after the insert.
 * No AI call is made.
 */
export async function addRevision(workspaceId: string, offerId: string, input: NewRevisionInput): Promise<AddRevisionResult> {
  const revisionId = `${offerId}-w${randomBytes(6).toString("hex")}`;
  return (await db().begin(async (tx) => {
    // One change to the offer sheet at a time, and no decision lands in the
    // middle of it: hold the workspace and its ads until this is recorded.
    // The workspace lock is the weaker "no key update" kind on purpose: a
    // decision in flight holds its ad's lock and then writes an event that
    // references the workspace row. A full row lock here would make the two
    // wait on each other.
    const [workspace] = await tx`select id from workspaces where id = ${workspaceId} for no key update`;
    if (!workspace) return { ok: false, error: "No demo workspace. Reload the page." };
    await tx`select id from assets where workspace_id = ${workspaceId} order by id for update`;

    const [offer] = await tx`select product from offers where id = ${offerId}`;
    if (!offer) return { ok: false, error: "Choose an offer from the list." };
    if (offer.product !== SUPPORTED_PRODUCT) {
      return {
        ok: false,
        error: "This desk is set up for personal-loan offers only. Credit card and mortgage offers are not set up yet.",
      };
    }
    const revisions = await loadRevisions(workspaceId, tx);
    const own = revisions.filter((r) => r.offerId === offerId);
    if (own.filter((r) => r.addedHere).length >= MAX_ADDED_REVISIONS) {
      return { ok: false, error: "This demo has reached its limit of added offer revisions. Use Reset demo to start over." };
    }
    const inForce = termsOn(revisions, offerId, input.effectiveFrom);
    const refusal = refuseRevision(input, inForce);
    if (refusal) return { ok: false, error: refusal };

    const before = await loadAssets(workspaceId, tx);
    const revision = Math.max(0, ...own.map((r) => r.revision)) + 1;
    // The form changes the rates and the fee. The loan term range is carried
    // over from the revision this one replaces.
    const carried = inForce ?? [...own].sort((a, b) => b.revision - a.revision)[0] ?? null;
    await tx`
      insert into offer_revisions
        (id, offer_id, revision, effective_from, effective_to, apr_min, apr_max, origination_fee_pct,
         term_min_months, term_max_months, source, workspace_id)
      values (${revisionId}, ${offerId}, ${revision}, ${input.effectiveFrom}, null, ${input.aprMin}, ${input.aprMax},
              ${input.feePct}, ${carried?.termMinMonths ?? null}, ${carried?.termMaxMonths ?? null},
              ${`Revision ${revision}, added on the Offer sheet page of this demo (fictional)`}, ${workspaceId})
    `;

    const after = await loadAssets(workspaceId, tx);
    const affected = after.filter(
      (a) => a.status === "offer_changed" && before.find((b) => b.id === a.id)?.status === "approved",
    );
    for (const a of affected) {
      await logEvent(tx, workspaceId, { type: "offer_changed", actor: "reviewer", assetId: a.id, data: { revisionId, revision } });
    }
    const refs = affected.map((a) => a.ref);
    await logEvent(tx, workspaceId, { type: "offer_revised", actor: "reviewer", data: { revisionId, revision, offerId, affected: refs } });
    return { ok: true, revisionId, revision, affected: refs };
  })) as AddRevisionResult;
}
