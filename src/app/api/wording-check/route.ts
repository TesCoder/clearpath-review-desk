import { NextResponse } from "next/server";
import { runReviewFor } from "@/lib/ai/store";
import { wordingResult, type WordingResult } from "@/lib/ai/wording";
import { MAX_COPY_CHARS, analyzeCopy } from "@/lib/checks";
import { cleanBody } from "@/lib/copy";
import { loadRevisions } from "@/lib/data";
import { db } from "@/lib/db";
import { fingerprint } from "@/lib/fingerprint";
import { SUPPORTED_PRODUCT, isIsoDate, isPlacement, termsOn } from "@/lib/offers";
import { isSameOrigin, readJsonObject } from "@/lib/request";
import { getRole, getWorkspaceId } from "@/lib/workspace";

const MAX_RECORDS_PER_WORKSPACE = 200;

const unavailable = (reason: string, status: number) =>
  NextResponse.json({ state: "unavailable", notes: [], reason, addressesReviewer: false } satisfies WordingResult, { status });

// The marketer's optional wording check on a draft, before it is submitted.
// It runs the reviewer's claim finder on the draft text: the same prompt, the
// same word-for-word quote check, the same stored results and the same spend
// limits (src/lib/ai/store.ts). The answer is advice. This route writes one
// thing: a record that this exact text was checked, so the reviewer can be
// told. It never creates, changes or approves an ad.
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return unavailable("Cross-site requests are not accepted.", 403);

  // The byte limit is enforced while the body is read, not after.
  const input: { body?: unknown; offerId?: unknown; plannedDate?: unknown; placement?: unknown } | null =
    await readJsonObject(request, MAX_COPY_CHARS * 8);
  if (!input) return unavailable("Bad request.", 400);
  const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : "");
  const body = cleanBody(typeof input.body === "string" ? input.body : "");
  const offerId = str(input.offerId, 40);
  const plannedDate = str(input.plannedDate, 10);
  const placement = str(input.placement, 60);

  let workspaceId: string;
  try {
    workspaceId = await getWorkspaceId();
  } catch {
    return unavailable("No demo workspace. Reload the page.", 401);
  }
  if ((await getRole()) !== "marketer") return unavailable("Switch to the Marketer view to check a draft.", 403);
  if (!body) return unavailable("Type or paste the ad copy first.", 400);
  if (body.length > MAX_COPY_CHARS) return unavailable(`Keep the ad copy under ${MAX_COPY_CHARS} characters.`, 400);
  if (!isPlacement(placement) || !isIsoDate(plannedDate)) {
    return unavailable("Choose where the ad will run and its publication date first.", 400);
  }
  const sql = db();
  const [offer] = await sql`select product from offers where id = ${offerId}`;
  if (!offer || offer.product !== SUPPORTED_PRODUCT) {
    return unavailable("This desk is set up for personal-loan ads only.", 400);
  }
  const terms = termsOn(await loadRevisions(workspaceId), offerId, plannedDate);
  if (!terms) return unavailable("No offer terms are in effect on that date, so there is nothing to compare the draft with.", 400);

  const fp = fingerprint(body);
  const review = await runReviewFor(workspaceId, { body, fingerprint: fp, terms, placement });
  const result = wordingResult(review, analyzeCopy(body, terms).checks);

  // Only a real answer is recorded. One record per text, and a ceiling per
  // workspace, so this cannot be used to fill the event log. When the ceiling
  // stops a record from being written, the marketer is told: otherwise they
  // would see an answer the reviewer never learns about.
  let recorded = true;
  if (review.answered && result.state !== "unavailable") {
    const inserted = await sql`
      insert into events (workspace_id, type, actor_role, data)
      select ${workspaceId}, 'wording_checked', 'marketer',
             ${sql.json({ fingerprint: fp, offerRevisionId: terms.revisionId, placement, state: result.state, notes: result.notes.length })}
      where (select count(*) from events where workspace_id = ${workspaceId} and type = 'wording_checked') < ${MAX_RECORDS_PER_WORKSPACE}
        and not exists (
          select 1 from events
          where workspace_id = ${workspaceId} and type = 'wording_checked'
            and data->>'fingerprint' = ${fp} and data->>'offerRevisionId' = ${terms.revisionId} and data->>'placement' = ${placement}
        )
      returning id
    `;
    if (inserted.length === 0) {
      const [existing] = await sql`
        select 1 from events
        where workspace_id = ${workspaceId} and type = 'wording_checked'
          and data->>'fingerprint' = ${fp} and data->>'offerRevisionId' = ${terms.revisionId} and data->>'placement' = ${placement}
        limit 1
      `;
      recorded = Boolean(existing);
    }
  }
  return NextResponse.json({ ...result, checked: body, recorded });
}
