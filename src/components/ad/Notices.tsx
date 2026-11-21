import Link from "next/link";
import { SwitchTo } from "@/components/SwitchTo";
import type { AssetView, RevisionTerms } from "@/lib/data";
import { formatDate, formatMoment, withArticle } from "@/lib/format";
import type { DecisionRecord, Role } from "@/lib/status";

/**
 * The line shown right after an action, with a button that opens the same ad
 * in the other role. `done` comes from the address the action redirected to.
 */
export function DoneNotice({ done, asset }: { done: string | string[] | undefined; asset: AssetView }) {
  const { latest } = asset;
  return (
    <>
      {done === "approved" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          <span>Approved. The marketer can now see the approved copy.</span>
          <SwitchTo
            role="marketer"
            adRef={asset.ref}
            label="See it as the marketer"
          />
          <Link href="/" className="underline">
            Back to the queue
          </Link>
        </div>
      ) : null}
      {done === "requested" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800"
          role="status"
        >
          <span>Request sent. The ad is with the marketer.</span>
          <SwitchTo
            role="marketer"
            adRef={asset.ref}
            label={`Open ${asset.ref} as the marketer`}
          />
          <Link href="/" className="underline">
            Back to the queue
          </Link>
        </div>
      ) : null}
      {done === "submitted" || done === "resubmitted" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900"
          role="status"
        >
          <span>Sent for review as version {latest.number}.</span>
          <SwitchTo
            role="reviewer"
            adRef={asset.ref}
            label={`Review version ${latest.number} as the reviewer`}
          />
        </div>
      ) : null}
      {done === "moved" ? (
        <div
          className="mt-4 flex flex-wrap items-center gap-3 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm text-slate-800"
          role="status"
        >
          <span>
            Moved to {formatDate(asset.plannedDate)} as{" "}
            {withArticle(asset.placement)}. It is back in the review queue.
          </span>
          <SwitchTo
            role="reviewer"
            adRef={asset.ref}
            label="Review it as the reviewer"
          />
        </div>
      ) : null}
    </>
  );
}

/** Why an ad that was approved is back in review: it was moved, its offer changed, or its text was edited. */
export function ApprovalLostNotice({
  asset,
  role,
  approval,
  approvalTerms,
}: {
  asset: AssetView;
  role: Role;
  approval: DecisionRecord | null;
  approvalTerms: RevisionTerms | null | undefined;
}) {
  const { latest, terms } = asset;
  return (
    <>
      {asset.status === "rescheduled" && approval && approvalTerms ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Same words, new date.</strong> Version{" "}
          {approval.versionNumber} was approved for{" "}
          {formatDate(approval.plannedDate)} under offer revision{" "}
          {approvalTerms.revision}. It was then moved to{" "}
          {formatDate(asset.plannedDate)}
          {terms
            ? `, when revision ${terms.revision} applies`
            : ", when no offer terms are in effect"}
          . That approval still stands for the original date only, so this
          placement needs its own review.
        </p>
      ) : null}
      {asset.status === "offer_changed" && approval && approvalTerms && terms ? (
        <p
          className="mt-4 rounded-md border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-950"
          data-banner="offer-changed"
        >
          <strong>The offer changed after this ad was approved.</strong> Version{" "}
          {approval.versionNumber} was approved on{" "}
          {formatMoment(approval.createdAt)} against offer revision{" "}
          {approvalTerms.revision}. Revision {terms.revision} now applies on{" "}
          {formatDate(asset.plannedDate)}, so that approval no longer covers
          this ad.{" "}
          {role === "marketer"
            ? "Do not publish it until it is approved again. You can change the text below without waiting for the reviewer."
            : "Not a word of the ad changed. The checks below are run against the new terms."}
        </p>
      ) : null}
      {asset.status === "edited_after_approval" && approval ? (
        <p className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <strong>Edited after approval.</strong> Version{" "}
          {approval.versionNumber} was approved on{" "}
          {formatMoment(approval.createdAt)}. The marketer then changed the
          text, so version {latest.number} needs its own review. The earlier
          approval stays with version {approval.versionNumber}.
        </p>
      ) : null}
    </>
  );
}
