import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { loadAssets, loadEventsByAsset } from "@/lib/data";
import { formatElapsed, measureAd, median } from "@/lib/measures";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const WITH: Record<string, { label: string; cls: string }> = {
  reviewer: { label: "Reviewer", cls: "bg-indigo-100 text-indigo-900" },
  marketer: { label: "Marketer", cls: "bg-slate-200 text-slate-800" },
  "no one": { label: "No one: approved", cls: "bg-emerald-100 text-emerald-900" },
};

export default async function Measures() {
  const workspaceId = await getWorkspaceId();
  const [assets, events] = await Promise.all([loadAssets(workspaceId), loadEventsByAsset(workspaceId)]);
  const rows = assets
    .map((a) => ({ a, m: measureAd(events.get(a.id) ?? [], a.status, Boolean(a.terms)) }))
    .sort((x, y) => x.a.ref.localeCompare(y.a.ref));

  const approved = rows.filter((r) => r.m.submissionToApprovalMs !== null);
  const medianMs = median(approved.map((r) => r.m.submissionToApprovalMs!));
  const sentBack = rows.reduce((n, r) => n + r.m.timesSentBack, 0);
  const tile = (label: string, value: string, note: string) => (
    <div className="rounded-lg border border-slate-200 bg-white p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-500">{note}</p>
    </div>
  );

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">Measures</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        Counted from this workspace&apos;s event log each time the page opens, so every number moves when you act in the demo.
      </p>
      <div className="mt-4 max-w-3xl rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950" role="note">
        <p>
          <strong>Fictional demo activity.</strong> The ads, dates and times here were seeded for the demo, plus whatever you
          have done in it. They are not measurements of a real team.
        </p>
        <p className="mt-1">
          <strong>Elapsed time includes waits between people.</strong> It runs from the first submission to the approval,
          on the calendar. It is not time spent working, and it is not evidence of time saved: that needs a baseline from the
          current spreadsheet and email process.
        </p>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {tile("Ads approved as they stand", `${approved.length} of ${rows.length}`, "An approval stops counting if the ad is edited or moved.")}
        {tile("Times compliance sent an ad back", String(sentBack), "Across all ads. Each request for changes counts once.")}
        {tile(
          "Median submission to approval",
          medianMs !== null ? formatElapsed(medianMs) : "None yet",
          "Approved ads only. Includes waits between people.",
        )}
      </div>

      <div className="mt-6 overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Ad</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Now with</th>
              <th className="px-4 py-2 font-medium">Times sent back</th>
              <th className="px-4 py-2 font-medium">Versions</th>
              <th className="px-4 py-2 font-medium">Submission to approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ a, m }) => (
              <tr key={a.id} className="hover:bg-slate-50" data-measure-ref={a.ref} data-sent-back={m.timesSentBack} data-with={m.withWhom}>
                <td className="px-4 py-3">
                  <Link href={`/ads/${a.ref}`} className="font-medium text-indigo-700 underline-offset-2 hover:underline">
                    {a.ref}
                  </Link>
                  <div className="text-slate-600">
                    {a.affiliate.name}: {a.title}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={a.status} />
                </td>
                <td className="px-4 py-3">
                  <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${WITH[m.withWhom].cls}`}>
                    {WITH[m.withWhom].label}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {m.timesSentBack}
                </td>
                <td className="px-4 py-3">{m.versionsSubmitted}</td>
                <td className="px-4 py-3" data-cell="turnaround">
                  {m.submissionToApprovalMs !== null ? (
                    formatElapsed(m.submissionToApprovalMs)
                  ) : (
                    <span className="text-slate-500">Not approved as it stands</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
