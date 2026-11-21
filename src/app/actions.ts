"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MAX_COMMENT_CHARS, MAX_COPY_CHARS, MAX_NOTE_CHARS } from "@/lib/checks";
import { cleanBody } from "@/lib/copy";
import { loadAsset, loadRevisions, type AssetView, type Executor } from "@/lib/data";
import { db } from "@/lib/db";
import { logEvent } from "@/lib/events";
import { fingerprint } from "@/lib/fingerprint";
import { formatDate, withArticle } from "@/lib/format";
import { addRevision, type AddRevisionResult } from "@/lib/offer-sheet";
import {
  MAX_ADS_PER_WORKSPACE,
  MAX_DECISIONS_PER_AD,
  MAX_MOVES_PER_AD,
  MAX_TITLE_CHARS,
  MAX_VERSIONS_PER_AD,
  SUPPORTED_PRODUCT,
  coverageText,
  isDemoDate,
  isPlacement,
  parsePercent,
  termsOn,
} from "@/lib/offers";
import { DEMO_REVIEWER } from "@/lib/seed";
import { refuseDecision, type DecisionKind } from "@/lib/status";
import { AD_PATH, ROLE_COOKIE, cookieSettings } from "@/lib/session";
import { getRole, getWorkspaceId, resetWorkspace } from "@/lib/workspace";

export async function switchRole(formData: FormData): Promise<void> {
  const role = formData.get("role") === "marketer" ? "marketer" : "reviewer";
  (await cookies()).set({ name: ROLE_COOKIE, value: role, ...cookieSettings() });
  // Stay on the same ad when the switch was made from an ad's page. Only
  // these two fixed shapes are followed, never an address from the form.
  const next = formData.get("next");
  if (typeof next === "string" && (AD_PATH.test(next) || next === "/offers")) redirect(next);
  redirect(role === "marketer" ? "/marketer" : "/");
}

/**
 * An ad can only be planned for a date the offer has terms for. Without
 * terms there is nothing to check it against, and it would sit with no one
 * able to act on it. Returns the message to show, or null when the date is fine.
 */
async function uncoveredDate(
  workspaceId: string,
  offerId: string,
  plannedDate: string,
  sql: Executor = db(),
): Promise<string | null> {
  const revisions = await loadRevisions(workspaceId, sql);
  if (termsOn(revisions, offerId, plannedDate)) return null;
  const campaign = revisions.find((r) => r.offerId === offerId)?.campaign ?? "that offer";
  return `No ${campaign} terms are in effect on ${formatDate(plannedDate)}. The offer has terms for ${coverageText(revisions, offerId)}. Choose a date in that range.`;
}

export async function resetDemo(): Promise<void> {
  await resetWorkspace();
  redirect((await getRole()) === "marketer" ? "/marketer?reset=1" : "/?reset=1");
}

export type FormState = { error: string | null };

const NOT_YOURS = "That ad is not in your workspace.";

/**
 * Runs `work` inside one transaction that holds a row lock on the ad, and
 * hands it the ad as read after the lock was taken. `work` returns a message
 * to refuse, or null after writing. Nothing is written when it refuses.
 */
async function withLockedAd(
  workspaceId: string,
  ref: string,
  work: (asset: AssetView, tx: Executor) => Promise<string | null>,
): Promise<string | null> {
  return db().begin(async (tx) => {
    const locked = await tx`select id from assets where workspace_id = ${workspaceId} and ref = ${ref} for update`;
    if (!locked.length) return NOT_YOURS;
    const asset = await loadAsset(workspaceId, ref, tx);
    if (!asset) return NOT_YOURS;
    return work(asset, tx);
  }) as Promise<string | null>;
}

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "23505";

/**
 * A reviewer's decision on one exact version. Everything that matters is
 * checked here on the server: who is deciding, which workspace, whether the
 * version and its text are still the current ones. The page's buttons are a
 * convenience, not the control.
 */
export async function decide(_prev: FormState, formData: FormData): Promise<FormState> {
  const ref = text(formData.get("ref")).slice(0, 20);
  const kind = text(formData.get("kind")) as DecisionKind;
  const versionNumber = Number(text(formData.get("versionNumber")));
  const shownFingerprint = text(formData.get("fingerprint")).slice(0, 64);
  const comment = text(formData.get("comment")).trim();
  const anchor = text(formData.get("anchor")).trim();
  const acknowledged = formData.get("acknowledge") === "on";
  const seenDate = text(formData.get("plannedDate")).slice(0, 10);
  const seenPlacement = text(formData.get("placement")).slice(0, 60);
  const seenRevision = text(formData.get("offerRevisionId")).slice(0, 60);
  const seenMismatches = Number(text(formData.get("seenMismatches")));

  if (kind !== "approve" && kind !== "request_changes") return { error: "Choose Approve this version or Request changes." };
  if (!Number.isInteger(versionNumber)) return { error: "That version does not exist." };

  const workspaceId = await getWorkspaceId();
  const role = await getRole();

  // Everything below runs while holding a lock on this ad, and reads the ad
  // after the lock is taken. So the checks and the write are one step: a move,
  // a new version or another decision cannot land in between, and two
  // decisions sent at the same moment cannot both pass.
  const error = await withLockedAd(workspaceId, ref, async (asset, tx) => {
    const refusal = refuseDecision(
      {
        role,
        kind,
        versionNumber,
        fingerprint: shownFingerprint,
        plannedDate: seenDate,
        placement: seenPlacement,
        offerRevisionId: seenRevision,
      },
      asset.state,
    );
    if (refusal) return refusal;
    // The stored fingerprint must still describe the stored text.
    if (fingerprint(asset.latest.body) !== asset.latest.fingerprint) {
      return "The stored text does not match its fingerprint. Nothing was recorded.";
    }
    const terms = asset.terms!; // refuseDecision returns a reason when there are none
    if (asset.decisions.length >= MAX_DECISIONS_PER_AD) {
      return "This ad has reached the demo's limit of decisions. Use Reset demo to start over.";
    }

    if (kind === "request_changes") {
      if (!comment) return "Write what the marketer should change.";
      if (comment.length > MAX_COMMENT_CHARS) return `Keep the request under ${MAX_COMMENT_CHARS} characters.`;
      if (anchor && !asset.latest.body.includes(anchor)) {
        return "The words you selected are not in this version of the ad. Select them again.";
      }
    }
    if (kind === "approve") {
      const open = asset.analysis?.mismatches ?? 0;
      // Approving despite a mismatch accepts the mismatches that were on screen, not a different set.
      if (seenMismatches !== open) {
        return "The check results for this ad changed since this page was loaded. Reload and review it as it stands now.";
      }
      if (open > 0 && !acknowledged) {
        return `This version has ${open} claim${open === 1 ? "" : "s"} that ${open === 1 ? "does" : "do"} not match the offer. Tick the box to approve anyway, or request changes.`;
      }
      if (comment.length > MAX_COMMENT_CHARS) return `Keep the note under ${MAX_COMMENT_CHARS} characters.`;
    }

    const [decision] = await tx`
      insert into decisions (version_id, kind, fingerprint, offer_revision_id, planned_date, placement, reviewer, open_mismatches)
      values (${asset.latest.id}, ${kind}, ${asset.latest.fingerprint}, ${terms.revisionId},
              ${asset.plannedDate}, ${asset.placement}, ${DEMO_REVIEWER},
              ${kind === "approve" ? (asset.analysis?.mismatches ?? 0) : 0})
      returning id
    `;
    if (comment) {
      await tx`
        insert into comments (version_id, decision_id, anchor_text, body, author_role)
        values (${asset.latest.id}, ${decision.id}, ${kind === "request_changes" && anchor ? anchor : null},
                ${comment}, 'reviewer')
      `;
    }
    await logEvent(tx, workspaceId, {
      type: kind === "approve" ? "approved" : "changes_requested",
      actor: "reviewer",
      assetId: asset.id,
      versionId: asset.latest.id,
      data: {
        version: asset.latest.number,
        mismatches: asset.analysis?.mismatches ?? 0,
        // Kept for audit: an approval made with a mismatch on screen.
        approvedWithOpenMismatch: kind === "approve" && (asset.analysis?.mismatches ?? 0) > 0,
      },
    });
    return null;
  });
  if (error) return { error };

  redirect(`/ads/${encodeURIComponent(ref)}?done=${kind === "approve" ? "approved" : "requested"}`);
}

// Marketer actions ---------------------------------------------------------

/**
 * Whether this exact text, for these terms and this placement, went through
 * the marketer's wording check, and what it showed. Read from the record the
 * check wrote on the server, never from the form.
 */
async function wordingRecord(
  sql: Executor,
  workspaceId: string,
  fp: string,
  offerRevisionId: string | null,
  placement: string,
): Promise<{ state: string | null; notes: number | null }> {
  if (!offerRevisionId) return { state: null, notes: null };
  const rows = await sql`
    select data from events
    where workspace_id = ${workspaceId} and type = 'wording_checked'
      and data->>'fingerprint' = ${fp} and data->>'offerRevisionId' = ${offerRevisionId} and data->>'placement' = ${placement}
    order by id desc limit 1
  `;
  const data = rows[0]?.data as { state?: unknown; notes?: unknown } | undefined;
  const state = data && ["notes", "nothing", "incomplete"].includes(String(data.state)) ? String(data.state) : null;
  return { state, notes: state && Number.isInteger(data?.notes) ? (data!.notes as number) : state ? 0 : null };
}

/**
 * Stores a new version of an ad and returns its id. A version's text is never
 * changed afterwards: an edit is another version. If this exact text went
 * through the marketer's wording check for the same terms and placement, what
 * the check showed is kept with the version, so the reviewer can be told.
 */
async function insertVersion(
  tx: Executor,
  workspaceId: string,
  v: { assetId: string; number: number; body: string; note: string; offerRevisionId: string | null; placement: string },
): Promise<string> {
  const fp = fingerprint(v.body);
  const checked = await wordingRecord(tx, workspaceId, fp, v.offerRevisionId, v.placement);
  const [version] = await tx`
    insert into versions (asset_id, number, body, fingerprint, note, wording_state, wording_notes, wording_revision_id, wording_placement)
    values (${v.assetId}, ${v.number}, ${v.body}, ${fp}, ${v.note || null}, ${checked.state}, ${checked.notes},
            ${checked.state ? v.offerRevisionId : null}, ${checked.state ? v.placement : null})
    returning id
  `;
  return version.id as string;
}

export async function submitAd(_prev: FormState, formData: FormData): Promise<FormState> {
  const affiliateId = text(formData.get("affiliateId")).slice(0, 40);
  const offerId = text(formData.get("offerId")).slice(0, 40);
  const placement = text(formData.get("placement"));
  const plannedDate = text(formData.get("plannedDate"));
  const title = text(formData.get("title")).trim();
  const body = cleanBody(text(formData.get("body")));
  const note = text(formData.get("note")).trim();

  if ((await getRole()) !== "marketer") return { error: "Switch to the Marketer view to submit an ad." };
  if (!isPlacement(placement)) return { error: "Choose where the ad will run." };
  if (!isDemoDate(plannedDate)) {
    return { error: "Enter a planned publication date between 2026 and 2028." };
  }
  if (!title || title.length > MAX_TITLE_CHARS) return { error: `Give the ad a short name, up to ${MAX_TITLE_CHARS} characters.` };
  if (!body) return { error: "Paste the ad copy." };
  if (body.length > MAX_COPY_CHARS) return { error: `Keep the ad copy under ${MAX_COPY_CHARS} characters.` };
  if (note.length > MAX_NOTE_CHARS) return { error: `Keep the note under ${MAX_NOTE_CHARS} characters.` };

  const workspaceId = await getWorkspaceId();
  const sql = db();
  // The next reference follows the highest one in the workspace; 1043 is the
  // highest seeded ad. It is read outside the transaction, so two submissions
  // at the same moment can pick the same number: the unique index refuses the
  // second, and the catch below asks the marketer to submit again.
  const [known] = await sql`
    select (select count(*) from affiliates where id = ${affiliateId})::int as affiliate,
           (select count(*) from offers where id = ${offerId})::int as offer,
           (select product from offers where id = ${offerId}) as product,
           (select count(*) from assets where workspace_id = ${workspaceId})::int as ads,
           (select coalesce(max(substring(ref from 4)::int), 1043) from assets where workspace_id = ${workspaceId}) as last
  `;
  if (!known.affiliate) return { error: "Choose an affiliate from the list." };
  if (!known.offer) return { error: "Choose an offer from the list." };
  if (known.product !== SUPPORTED_PRODUCT) {
    return { error: "This desk is set up for personal-loan ads only. Credit card and mortgage ads are not set up yet." };
  }
  const uncovered = await uncoveredDate(workspaceId, offerId, plannedDate);
  if (uncovered) return { error: uncovered };
  if (known.ads >= MAX_ADS_PER_WORKSPACE) {
    return { error: "This demo workspace is full. Use Reset demo to start over." };
  }
  const ref = `AD-${Number(known.last) + 1}`;
  const terms = termsOn(await loadRevisions(workspaceId), offerId, plannedDate);

  try {
    await sql.begin(async (tx) => {
      const [asset] = await tx`
        insert into assets (workspace_id, ref, title, affiliate_id, offer_id, placement, planned_date)
        values (${workspaceId}, ${ref}, ${title}, ${affiliateId}, ${offerId}, ${placement}, ${plannedDate})
        returning id
      `;
      const versionId = await insertVersion(tx, workspaceId, {
        assetId: asset.id,
        number: 1,
        body,
        note,
        offerRevisionId: terms?.revisionId ?? null,
        placement,
      });
      await logEvent(tx, workspaceId, { type: "submitted", actor: "marketer", assetId: asset.id, versionId, data: { version: 1 } });
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Another submission arrived at the same moment. Submit again." };
    throw e;
  }
  redirect(`/ads/${ref}?done=submitted`);
}

export async function submitRevision(_prev: FormState, formData: FormData): Promise<FormState> {
  const ref = text(formData.get("ref")).slice(0, 20);
  const body = cleanBody(text(formData.get("body")));
  const note = text(formData.get("note")).trim();
  const baseFingerprint = text(formData.get("baseFingerprint")).slice(0, 64);
  const baseVersion = Number(text(formData.get("baseVersion")));
  const baseRevisionId = text(formData.get("baseRevisionId")).slice(0, 80);
  const basePlannedDate = text(formData.get("basePlannedDate")).slice(0, 10);
  const basePlacement = text(formData.get("basePlacement")).slice(0, 60);

  if ((await getRole()) !== "marketer") return { error: "Switch to the Marketer view to change an ad." };
  if (!body) return { error: "The ad copy cannot be empty." };
  if (body.length > MAX_COPY_CHARS) return { error: `Keep the ad copy under ${MAX_COPY_CHARS} characters.` };
  if (note.length > MAX_NOTE_CHARS) return { error: `Keep the note under ${MAX_NOTE_CHARS} characters.` };

  const workspaceId = await getWorkspaceId();
  let error: string | null;
  try {
    error = await withLockedAd(workspaceId, ref, async (asset, tx) => {
      // An edit is made to a particular version. If another tab has already
      // sent a newer one, saving this would quietly bring back the old words.
      // The version number is checked as well as the text: if the text went
      // from A to B and back to A in other tabs, the fingerprint alone would
      // let a form opened at the first A save over what happened since.
      if (baseFingerprint !== asset.latest.fingerprint || baseVersion !== asset.latest.number) {
        return `Version ${asset.latest.number} of this ad was submitted after you started this edit. Reload the page and edit the current text.`;
      }
      // The marketer wrote this text against the offer terms, the date and the
      // placement shown on their page. If any of them changed in another tab,
      // the check they saw no longer applies to what would be saved.
      if (
        baseRevisionId !== (asset.terms?.revisionId ?? "") ||
        basePlannedDate !== asset.plannedDate ||
        basePlacement !== asset.placement
      ) {
        return "The offer terms, the date or the placement of this ad changed after you started this edit. Reload the page and check the text against what applies now.";
      }
      if (body === asset.latest.body) return `The text is the same as version ${asset.latest.number}. Change it first.`;
      if (asset.versions.length >= MAX_VERSIONS_PER_AD) return "This ad has reached the demo's version limit.";
      const number = asset.latest.number + 1;
      const versionId = await insertVersion(tx, workspaceId, {
        assetId: asset.id,
        number,
        body,
        note,
        offerRevisionId: asset.terms?.revisionId ?? null,
        placement: asset.placement,
      });
      await logEvent(tx, workspaceId, { type: "resubmitted", actor: "marketer", assetId: asset.id, versionId, data: { version: number } });
      return null;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "A newer version was submitted at the same moment. Reload the page." };
    throw e;
  }
  if (error) return { error };
  redirect(`/ads/${encodeURIComponent(ref)}?done=resubmitted`);
}

export async function moveAd(_prev: FormState, formData: FormData): Promise<FormState> {
  const ref = text(formData.get("ref")).slice(0, 20);
  const plannedDate = text(formData.get("plannedDate"));
  const placement = text(formData.get("placement"));
  const fromDate = text(formData.get("fromDate")).slice(0, 10);
  const fromPlacement = text(formData.get("fromPlacement")).slice(0, 60);

  if ((await getRole()) !== "marketer") return { error: "Switch to the Marketer view to move an ad." };
  if (!isPlacement(placement)) return { error: "Choose where the ad will run." };
  if (!isDemoDate(plannedDate)) {
    return { error: "Enter a date between 2026 and 2028." };
  }
  const workspaceId = await getWorkspaceId();
  const error = await withLockedAd(workspaceId, ref, async (asset, tx) => {
    // The form shows a date and a placement and posts both. If the ad was
    // moved in another tab since, a form that changed only one of them would
    // quietly put the other back.
    if (fromDate !== asset.plannedDate || fromPlacement !== asset.placement) {
      return `This ad was moved after you opened this form. It is now planned for ${formatDate(asset.plannedDate)} as ${withArticle(asset.placement)}. Reload the page and move it from there.`;
    }
    if (asset.plannedDate === plannedDate && asset.placement === placement) {
      return "That is the current date and placement. Change one to move the ad.";
    }
    const uncovered = await uncoveredDate(workspaceId, asset.offer.id, plannedDate, tx);
    if (uncovered) return uncovered;
    const [moves] = await tx`
      select count(*)::int as n from events where asset_id = ${asset.id} and workspace_id = ${workspaceId} and type = 'rescheduled'
    `;
    if (moves.n >= MAX_MOVES_PER_AD) return "This ad has reached the demo's limit of moves. Use Reset demo to start over.";
    await tx`
      update assets set planned_date = ${plannedDate}, placement = ${placement}
      where id = ${asset.id} and workspace_id = ${workspaceId}
    `;
    await logEvent(tx, workspaceId, {
      type: "rescheduled",
      actor: "marketer",
      assetId: asset.id,
      data: { from: asset.plannedDate, to: plannedDate, fromPlacement: asset.placement, toPlacement: placement },
    });
    return null;
  });
  if (error) return { error };
  redirect(`/ads/${encodeURIComponent(ref)}?done=moved`);
}

// Compliance actions on the offer sheet --------------------------------------

/** The Offer sheet form. The rule and the write are in src/lib/offer-sheet.ts. */
export async function addOfferRevision(_prev: FormState, formData: FormData): Promise<FormState> {
  const offerId = text(formData.get("offerId")).slice(0, 40);
  const effectiveFrom = text(formData.get("effectiveFrom")).slice(0, 10);
  const aprMin = parsePercent(text(formData.get("aprMin")).slice(0, 12));
  const aprMax = parsePercent(text(formData.get("aprMax")).slice(0, 12));
  const feePct = parsePercent(text(formData.get("feePct")).slice(0, 12));
  const seenLatest = Number(text(formData.get("seenLatest")));
  const seenApproved = text(formData.get("seenApproved")).slice(0, 4000);

  if ((await getRole()) !== "reviewer") {
    return { error: "Switch to the Reviewer view to change the offer sheet. Compliance owns it." };
  }
  if (aprMin === null || aprMax === null || feePct === null) {
    return { error: "Enter each rate and the fee as a number with up to two decimals, such as 9.49." };
  }
  const workspaceId = await getWorkspaceId();
  let result: AddRevisionResult;
  try {
    result = await addRevision(workspaceId, offerId, { aprMin, aprMax, feePct, effectiveFrom }, seenLatest, seenApproved);
  } catch (e) {
    if (isUniqueViolation(e)) return { error: "Another change to the offer sheet arrived at the same moment. Try again." };
    throw e;
  }
  if (!result.ok) return { error: result.error };
  redirect(`/offers?added=${encodeURIComponent(result.revisionId)}`);
}
