import Link from "next/link";
import type { AssetView, RevisionTerms } from "@/lib/data";
import { inForceText, termChanges } from "@/lib/offers";
import { Card } from "./ui";

/**
 * For an ad whose offer changed after it was approved: the terms it was
 * approved against beside the terms that apply now, compared in code.
 */
export function OfferChangeCard({ asset, approvalTerms }: { asset: AssetView; approvalTerms: RevisionTerms }) {
  const { terms, analysis } = asset;
  if (!terms) return null;
  return (
    <Card title="What changed in the offer" tone="attention">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" data-table="offer-change">
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="py-1 pr-3 font-medium">Term</th>
              <th className="py-1 pr-3 font-medium">
                Approved against revision {approvalTerms.revision}
              </th>
              <th className="py-1 font-medium">
                Applies now: revision {terms.revision}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {termChanges(approvalTerms, terms).map((row) => (
              <tr key={row.label} data-changed={row.changed}>
                <td className="py-1.5 pr-3 text-slate-600">{row.label}</td>
                <td className={`py-1.5 pr-3 ${row.changed ? "text-slate-500 line-through" : "text-slate-800"}`}>
                  {row.before}
                </td>
                <td className={`py-1.5 ${row.changed ? "font-semibold text-red-900" : "text-slate-800"}`}>
                  {row.after}
                  {row.changed ? " (changed)" : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm text-slate-700">
        Revision {terms.revision} is in effect {inForceText(terms)}.{" "}
        {analysis && analysis.mismatches > 0
          ? `Against it, ${analysis.mismatches} claim${analysis.mismatches === 1 ? "" : "s"} in this ad no longer ${analysis.mismatches === 1 ? "matches" : "match"}: see the checks beside this.`
          : analysis && analysis.openFlags > 0
            ? "Against it, the number check holds something for you to read: see the checks beside this."
            : "The number check finds no mismatch against it. The ad still needs your approval for the new terms."}
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Compared in code from the two offer revisions. No AI call was made when the offer changed.{" "}
        <Link href="/offers" className="text-indigo-700 underline-offset-2 hover:underline">
          Open the offer sheet
        </Link>
      </p>
    </Card>
  );
}
