import { CopyButton } from "@/components/CopyButton";
import type { AssetView, RevisionTerms, VersionView } from "@/lib/data";
import { shortFingerprint } from "@/lib/fingerprint";
import { formatDate, formatMoment, withArticle } from "@/lib/format";
import type { DecisionRecord } from "@/lib/status";
import { Card } from "./ui";

/**
 * The most recent approval and exactly what it covered. It stays on screen
 * after an edit, a move or an offer change, marked as no longer covering what
 * is in review.
 */
export function ApprovalCard({
  asset,
  approval,
  approvedVersion,
  approvalTerms,
}: {
  asset: AssetView;
  approval: DecisionRecord;
  approvedVersion: VersionView;
  approvalTerms: RevisionTerms;
}) {
  return (
    <Card
      title={
        asset.status === "approved"
          ? "Approved copy"
          : "Earlier approval, still on record"
      }
    >
      <p
        className="whitespace-pre-wrap break-words rounded-md border border-emerald-200 bg-emerald-50 p-3 text-slate-900"
        id="approved-copy"
      >
        {approvedVersion.body}
      </p>
      <p className="mt-2 text-sm text-slate-700">
        Approved by{" "}
        {/* The approval record carries no reviewer name, so it is read from the stored decision made at the same moment. */}
        {
          asset.decisions.find(
            (d) => d.createdAt === approval.createdAt,
          )?.reviewer
        }{" "}
        on {formatMoment(approval.createdAt)}. Version{" "}
        {approval.versionNumber}, fingerprint{" "}
        <span className="font-mono">
          {shortFingerprint(approval.fingerprint)}
        </span>
        , checked against {approvalTerms.campaign} revision{" "}
        {approvalTerms.revision}, for {formatDate(approval.plannedDate)}{" "}
        as {withArticle(approval.placement)}.
      </p>
      {asset.status !== "approved" ? (
        <p className="mt-2 text-sm text-amber-900">
          This approval does not cover what is in review now. Do not
          publish until the current version is approved.
        </p>
      ) : (
        <div className="mt-3">
          <CopyButton text={approvedVersion.body} />
        </div>
      )}
    </Card>
  );
}
