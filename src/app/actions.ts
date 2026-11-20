"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { MAX_COMMENT_CHARS } from "@/lib/checks";
import { loadAsset } from "@/lib/data";
import { db } from "@/lib/db";
import { fingerprint } from "@/lib/fingerprint";
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
