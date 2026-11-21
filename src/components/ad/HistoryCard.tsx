import type { AssetView } from "@/lib/data";
import { formatDate, formatMoment, withArticle } from "@/lib/format";
import { Card } from "./ui";

/** Every version with the decisions and requests made on it, oldest first. */
export function HistoryCard({ asset }: { asset: AssetView }) {
  return (
    <Card title="History">
      <ol className="space-y-4">
        {asset.versions.map((v) => (
          <li key={v.id} className="border-l-2 border-slate-200 pl-3">
            <p className="text-sm font-medium text-slate-900">
              Version {v.number}{" "}
              <span className="font-normal text-slate-500">
                submitted {formatMoment(v.createdAt)}
              </span>
            </p>
            <p className="mt-1 whitespace-pre-wrap break-words text-sm text-slate-700">
              {v.body}
            </p>
            {asset.decisions
              .filter((d) => d.versionNumber === v.number)
              .map((d) => (
                <div key={d.id} className="mt-2 text-sm">
                  <p
                    className={
                      d.kind === "approve"
                        ? "font-medium text-emerald-800"
                        : "font-medium text-slate-800"
                    }
                  >
                    {d.kind === "approve"
                      ? "Approved"
                      : "Changes requested"}{" "}
                    by {d.reviewer}, {formatMoment(d.createdAt)}
                    {d.kind === "approve"
                      ? `, for ${formatDate(d.plannedDate)} as ${withArticle(d.placement)}${d.terms ? `, against offer revision ${d.terms.revision}` : ""}`
                      : ""}
                  </p>
                  {d.kind === "approve" && d.openMismatches > 0 ? (
                    <p className="mt-0.5 text-red-900">
                      Approved with {d.openMismatches} claim{d.openMismatches === 1 ? "" : "s"} that did not match the offer. The
                      reviewer ticked <q>Approve anyway</q>.
                    </p>
                  ) : null}
                  {asset.comments
                    .filter((c) => c.decisionId === d.id)
                    .map((c) => (
                      <p key={c.id} className="mt-1 text-slate-700">
                        {c.anchorText ? (
                          <>
                            About <q>{c.anchorText}</q>:{" "}
                          </>
                        ) : null}
                        {c.body}
                      </p>
                    ))}
                </div>
              ))}
          </li>
        ))}
      </ol>
    </Card>
  );
}
