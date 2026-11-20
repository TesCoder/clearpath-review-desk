"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { runReview } from "@/lib/ai/store";
import { MAX_COMMENT_CHARS, MAX_COPY_CHARS, MAX_NOTE_CHARS } from "@/lib/checks";
import { loadAsset } from "@/lib/data";
import { db } from "@/lib/db";
import { fingerprint } from "@/lib/fingerprint";
import { MAX_ADS_PER_WORKSPACE, MAX_TITLE_CHARS, MAX_VERSIONS_PER_AD, PLACEMENTS, isIsoDate } from "@/lib/offers";
import { DEMO_REVIEWER } from "@/lib/seed";
import { refuseDecision, type DecisionKind } from "@/lib/status";
import { ROLE_COOKIE, getRole, getWorkspaceId, resetWorkspace } from "@/lib/workspace";

export async function switchRole(formData: FormData): Promise<void> {
  const role = formData.get("role") === "marketer" ? "marketer" : "reviewer";
  (await cookies()).set({
    name: ROLE_COOKIE,
    value: role,
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  });
  redirect(role === "marketer" ? "/marketer" : "/");
}

export async function resetDemo(): Promise<void> {
  await resetWorkspace();
  redirect((await getRole()) === "marketer" ? "/marketer?reset=1" : "/?reset=1");
}

export type FormState = { error: string | null };

const text = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");

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

  if (kind !== "approve" && kind !== "request_changes") return { error: "Choose Approve this version or Request changes." };
  if (!Number.isInteger(versionNumber)) return { error: "That version does not exist." };

  const workspaceId = await getWorkspaceId();
  const role = await getRole();
  const asset = await loadAsset(workspaceId, ref);
  if (!asset) return { error: "That ad is not in your workspace." };

  const refusal = refuseDecision({ role, kind, versionNumber, fingerprint: shownFingerprint }, asset.state);
  if (refusal) return { error: refusal };
  // The stored fingerprint must still describe the stored text.
  if (fingerprint(asset.latest.body) !== asset.latest.fingerprint) {
    return { error: "The stored text does not match its fingerprint. Nothing was recorded." };
  }
  const terms = asset.terms!; // refuseDecision returns a reason when there are none

  if (kind === "request_changes") {
    if (!comment) return { error: "Write what the marketer should change." };
    if (comment.length > MAX_COMMENT_CHARS) return { error: `Keep the request under ${MAX_COMMENT_CHARS} characters.` };
    if (anchor && !asset.latest.body.includes(anchor)) {
      return { error: "The words you selected are not in this version of the ad. Select them again." };
    }
  }
  if (kind === "approve") {
    const open = asset.analysis?.mismatches ?? 0;
    if (open > 0 && !acknowledged) {
      return {
        error: `This version has ${open} claim${open === 1 ? "" : "s"} that ${open === 1 ? "does" : "do"} not match the offer. Tick the box to approve anyway, or request changes.`,
      };
    }
    if (comment.length > MAX_COMMENT_CHARS) return { error: `Keep the note under ${MAX_COMMENT_CHARS} characters.` };
  }

  await db().begin(async (tx) => {
    const [decision] = await tx`
      insert into decisions (version_id, kind, fingerprint, offer_revision_id, planned_date, placement, reviewer)
      values (${asset.latest.id}, ${kind}, ${asset.latest.fingerprint}, ${terms.revisionId},
              ${asset.plannedDate}, ${asset.placement}, ${DEMO_REVIEWER})
      returning id
    `;
    if (comment) {
      await tx`
        insert into comments (version_id, decision_id, anchor_text, body, author_role)
        values (${asset.latest.id}, ${decision.id}, ${kind === "request_changes" && anchor ? anchor : null},
                ${comment}, 'reviewer')
      `;
    }
    await tx`
      insert into events (workspace_id, asset_id, version_id, type, actor_role, data)
      values (${workspaceId}, ${asset.id}, ${asset.latest.id},
              ${kind === "approve" ? "approved" : "changes_requested"}, 'reviewer',
              ${tx.json({
                version: asset.latest.number,
                mismatches: asset.analysis?.mismatches ?? 0,
                approvedWithOpenMismatch: kind === "approve" && (asset.analysis?.mismatches ?? 0) > 0,
              })})
    `;
  });

  redirect(`/ads/${encodeURIComponent(ref)}?done=${kind === "approve" ? "approved" : "requested"}`);
}

// Marketer actions ---------------------------------------------------------

function cleanBody(raw: string): string {
  // Line endings only. The words are kept exactly as typed, hidden characters
  // included, so the reviewer sees and fingerprints what was submitted.
  return raw.replace(/\r\n?/g, "\n").trim();
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
  if (!(PLACEMENTS as readonly string[]).includes(placement)) return { error: "Choose where the ad will run." };
  if (!isIsoDate(plannedDate) || plannedDate < "2026-01-01" || plannedDate > "2028-12-31") {
    return { error: "Enter a planned publication date between 2026 and 2028." };
  }
  if (!title || title.length > MAX_TITLE_CHARS) return { error: `Give the ad a short name, up to ${MAX_TITLE_CHARS} characters.` };
  if (!body) return { error: "Paste the ad copy." };
  if (body.length > MAX_COPY_CHARS) return { error: `Keep the ad copy under ${MAX_COPY_CHARS} characters.` };
  if (note.length > MAX_NOTE_CHARS) return { error: `Keep the note under ${MAX_NOTE_CHARS} characters.` };

  const workspaceId = await getWorkspaceId();
  const sql = db();
  const [known] = await sql`
    select (select count(*) from affiliates where id = ${affiliateId})::int as affiliate,
           (select count(*) from offers where id = ${offerId})::int as offer,
           (select count(*) from assets where workspace_id = ${workspaceId})::int as ads,
           (select coalesce(max(substring(ref from 4)::int), 1043) from assets where workspace_id = ${workspaceId}) as last
  `;
  if (!known.affiliate) return { error: "Choose an affiliate from the list." };
  if (!known.offer) return { error: "Choose an offer from the list." };
  if (known.ads >= MAX_ADS_PER_WORKSPACE) {
    return { error: "This demo workspace is full. Use Reset demo to start over." };
  }
  const ref = `AD-${Number(known.last) + 1}`;

  await sql.begin(async (tx) => {
    const [asset] = await tx`
      insert into assets (workspace_id, ref, title, affiliate_id, offer_id, placement, planned_date)
      values (${workspaceId}, ${ref}, ${title}, ${affiliateId}, ${offerId}, ${placement}, ${plannedDate})
      returning id
    `;
    const [version] = await tx`
      insert into versions (asset_id, number, body, fingerprint, note)
      values (${asset.id}, 1, ${body}, ${fingerprint(body)}, ${note || null})
      returning id
    `;
    await tx`
      insert into events (workspace_id, asset_id, version_id, type, actor_role, data)
      values (${workspaceId}, ${asset.id}, ${version.id}, 'submitted', 'marketer', ${tx.json({ version: 1 })})
    `;
  });
  redirect(`/ads/${ref}?done=submitted`);
}

export async function submitRevision(_prev: FormState, formData: FormData): Promise<FormState> {
  const ref = text(formData.get("ref")).slice(0, 20);
  const body = cleanBody(text(formData.get("body")));
  const note = text(formData.get("note")).trim();

  if ((await getRole()) !== "marketer") return { error: "Switch to the Marketer view to change an ad." };
  if (!body) return { error: "The ad copy cannot be empty." };
  if (body.length > MAX_COPY_CHARS) return { error: `Keep the ad copy under ${MAX_COPY_CHARS} characters.` };
  if (note.length > MAX_NOTE_CHARS) return { error: `Keep the note under ${MAX_NOTE_CHARS} characters.` };

  const workspaceId = await getWorkspaceId();
  const asset = await loadAsset(workspaceId, ref);
  if (!asset) return { error: "That ad is not in your workspace." };
  if (body === asset.latest.body) return { error: `The text is the same as version ${asset.latest.number}. Change it first.` };
  if (asset.versions.length >= MAX_VERSIONS_PER_AD) return { error: "This ad has reached the demo's version limit." };
  const number = asset.latest.number + 1;

  await db().begin(async (tx) => {
    const [version] = await tx`
      insert into versions (asset_id, number, body, fingerprint, note)
      values (${asset.id}, ${number}, ${body}, ${fingerprint(body)}, ${note || null})
      returning id
    `;
    await tx`
      insert into events (workspace_id, asset_id, version_id, type, actor_role, data)
      values (${workspaceId}, ${asset.id}, ${version.id}, 'resubmitted', 'marketer', ${tx.json({ version: number })})
    `;
  });
  redirect(`/ads/${encodeURIComponent(ref)}?done=resubmitted`);
}

export async function moveAd(_prev: FormState, formData: FormData): Promise<FormState> {
  const ref = text(formData.get("ref")).slice(0, 20);
  const plannedDate = text(formData.get("plannedDate"));
  const placement = text(formData.get("placement"));

  if ((await getRole()) !== "marketer") return { error: "Switch to the Marketer view to move an ad." };
  if (!(PLACEMENTS as readonly string[]).includes(placement)) return { error: "Choose where the ad will run." };
  if (!isIsoDate(plannedDate) || plannedDate < "2026-01-01" || plannedDate > "2028-12-31") {
    return { error: "Enter a date between 2026 and 2028." };
  }
  const workspaceId = await getWorkspaceId();
  const asset = await loadAsset(workspaceId, ref);
  if (!asset) return { error: "That ad is not in your workspace." };
  if (asset.plannedDate === plannedDate && asset.placement === placement) {
    return { error: "That is the current date and placement. Change one to move the ad." };
  }
  await db().begin(async (tx) => {
    await tx`
      update assets set planned_date = ${plannedDate}, placement = ${placement}
      where id = ${asset.id} and workspace_id = ${workspaceId}
    `;
    await tx`
      insert into events (workspace_id, asset_id, type, actor_role, data)
      values (${workspaceId}, ${asset.id}, 'rescheduled', 'marketer',
              ${tx.json({ from: asset.plannedDate, to: plannedDate, fromPlacement: asset.placement, toPlacement: placement })})
    `;
  });
  redirect(`/ads/${encodeURIComponent(ref)}?done=moved`);
}

// AI claim finder ------------------------------------------------------------

export type AiRunState = { status: "complete" | "incomplete" | "unavailable"; reason: string | null };

/** Runs the AI claim finder for an ad's latest version. Takes only the ad's reference. */
export async function runAiReview(ref: string): Promise<AiRunState> {
  const workspaceId = await getWorkspaceId();
  const asset = await loadAsset(workspaceId, String(ref).slice(0, 20));
  if (!asset) return { status: "unavailable", reason: "That ad is not in your workspace." };
  const review = await runReview(workspaceId, asset);
  return { status: review.status, reason: review.reason };
}
