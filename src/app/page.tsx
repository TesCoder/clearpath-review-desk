import Link from "next/link";
import { ResetNotice } from "@/components/ResetNotice";
import { StatusPill } from "@/components/StatusPill";
import { summarizeAi, type AiSummary } from "@/lib/ai/display";
import { getStoredReviews } from "@/lib/ai/store";
import { loadAssets, type AssetView } from "@/lib/data";
import { formatDate, timeAgo } from "@/lib/format";
import { REVIEWER_TURN } from "@/lib/status";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// First, ads that were approved and then lost that approval because the offer
// changed: they may already be scheduled with a claim that is no longer true.
// Then revisions: the reviewer already knows the ad and the marketer is on a
// second round, so closing them is the fastest way to get an ad published.
// Then whatever has waited longest.
function queueOrder(a: AssetView, b: AssetView): number {
  const rank = (x: AssetView) => (x.status === "offer_changed" ? 0 : x.status === "revised" ? 1 : 2);
  return rank(a) - rank(b) || a.lastActivityAt.localeCompare(b.lastActivityAt);
}

function Flags({ a }: { a: AssetView }) {
  const n = a.flags;
  if (!a.terms)
    return <span className="text-amber-800">No offer terms on that date</span>;
  if (n === 0) return <span className="text-slate-500">No offer-check flags</span>;
  return (
    <span className="font-medium text-red-700">
      {n} flag{n === 1 ? "" : "s"} to check
    </span>
  );
}

/** Why an approved ad is back: which revision it was approved against and which applies now. */
function OfferReason({ a }: { a: AssetView }) {
  if (a.status !== "offer_changed" || !a.approvedAgainst || !a.terms) return null;
  return (
    <span className="mt-1 block text-xs text-slate-600">
      Approved against revision {a.approvedAgainst.revision}. Revision {a.terms.revision} now applies on{" "}
      {formatDate(a.plannedDate)}.
    </span>
  );
}

// The AI's read is shown beside the offer check, never folded into it: "no
// offer-check flags" must not read as "nothing left to look at".
function Ai({ summary }: { summary: AiSummary }) {
  if (summary.state === "not_run") return <span className="text-slate-500">AI: not run yet</span>;
  const n = summary.toRead;
  const things = `${n} to read`;
  if (summary.state === "incomplete") {
    return <span className="font-medium text-amber-800">AI: incomplete{n ? `, ${things}` : ""}</span>;
  }
  if (n === 0) {
    return (
      <span className="text-slate-500">{summary.reported > 0 ? "AI: nothing beyond the offer check" : "AI: nothing reported"}</span>
    );
  }
  return <span className="font-medium text-violet-800">AI: {things}</span>;
}

function Rows({
  items,
  waitingLabel,
  ai,
}: {
  items: AssetView[];
  waitingLabel: boolean;
  ai: Map<string, AiSummary>;
}) {
  const aiFor = (a: AssetView): AiSummary => ai.get(a.id) ?? { state: "not_run" };
  return (
    <>
      {/* Narrow screens: one card per ad, with the status and flags under the title. */}
      <ul className="space-y-3 md:hidden">
        {items.map((a) => (
          <li
            key={a.id}
            className="rounded-lg border border-slate-200 bg-white p-3"
            data-card-ref={a.ref}
          >
            <Link href={`/ads/${a.ref}`} className="block">
              <span className="font-medium text-indigo-700">{a.ref}</span>{" "}
              <span className="text-slate-700">
                {a.affiliate.name}: {a.title}
              </span>
              <span className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                <StatusPill status={a.status} />
                <Flags a={a} />
                <Ai summary={aiFor(a)} />
              </span>
              <OfferReason a={a} />
              <span className="mt-1 block text-sm text-slate-600">
                Version {a.latest.number} · publishing{" "}
                {formatDate(a.plannedDate)} ·{" "}
                {waitingLabel ? "waiting, last change" : "last activity"}{" "}
                {timeAgo(a.lastActivityAt)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 bg-white md:block">
        <table className="w-full min-w-[940px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 font-medium">Ad</th>
              <th className="px-4 py-2 font-medium">Affiliate</th>
              <th className="px-4 py-2 font-medium">Offer</th>
              <th className="px-4 py-2 font-medium">Version</th>
              <th className="px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium">Planned publication</th>
              <th className="px-4 py-2 font-medium">
                {waitingLabel ? "Waiting since" : "Last activity"}
              </th>
              <th className="px-4 py-2 font-medium">Offer check</th>
              <th className="px-4 py-2 font-medium">AI read</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((a) => (
              <tr
                key={a.id}
                className="hover:bg-slate-50"
                data-ref={a.ref}
                data-status={a.status}
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/ads/${a.ref}`}
                    className="font-medium text-indigo-700 underline-offset-2 hover:underline"
                  >
                    {a.ref}
                  </Link>
                  <div className="text-slate-600">{a.title}</div>
                </td>
                <td className="px-4 py-3">{a.affiliate.name}</td>
                <td className="px-4 py-3">{a.offer.campaign}</td>
                <td className="px-4 py-3">{a.latest.number}</td>
                <td className="px-4 py-3">
                  <StatusPill status={a.status} />
                  <OfferReason a={a} />
                </td>
                <td className="px-4 py-3">{formatDate(a.plannedDate)}</td>
                <td className="px-4 py-3 text-slate-600">
                  {timeAgo(a.lastActivityAt)}
                </td>
                <td className="px-4 py-3">
                  <Flags a={a} />
                </td>
                <td className="px-4 py-3" data-cell="ai">
                  <Ai summary={aiFor(a)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default async function Queue(props: PageProps<"/">) {
  const { reset } = await props.searchParams;
  const assets = await loadAssets(await getWorkspaceId());
  const reviews = await getStoredReviews(assets);
  const ai = new Map<string, AiSummary>(
    assets.map((a) => [a.id, summarizeAi(reviews.get(a.id) ?? null, a.analysis?.checks ?? [])]),
  );
  const waiting = assets
    .filter((a) => REVIEWER_TURN.includes(a.status))
    .sort(queueOrder);
  const rest = assets.filter((a) => !REVIEWER_TURN.includes(a.status));
  const offerChanged = waiting.filter((a) => a.status === "offer_changed").length;
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <ResetNotice show={Boolean(reset)} />
      <h1 className="text-2xl font-semibold">Review queue</h1>
      <p className="mt-1 text-sm text-slate-600">
        {waiting.length} ad{waiting.length === 1 ? "" : "s"} waiting for your
        decision. {offerChanged ? "Ads whose offer changed after approval come first, then revised ads" : "Revised ads come first"}, then the longest wait.
      </p>
      {offerChanged ? (
        <p
          className="mt-3 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-950"
          role="status"
        >
          {offerChanged} approved ad{offerChanged === 1 ? "" : "s"} need{offerChanged === 1 ? "s" : ""} review again because the
          offer changed. {offerChanged === 1 ? "It is" : "They are"} at the top of the queue.{" "}
          <Link href="/offers" className="underline">
            See the offer sheet
          </Link>
        </p>
      ) : null}
      <div className="mt-4">
        {waiting.length ? (
          <Rows items={waiting} waitingLabel ai={ai} />
        ) : (
          <p className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-8 text-center text-sm text-slate-600">
            Nothing is waiting for you. Switch to the Marketer view to submit an
            ad, or use Reset demo to start over.
          </p>
        )}
      </div>
      {rest.length ? (
        <>
          <h2 className="mt-10 text-lg font-semibold">Not waiting on you</h2>
          <p className="mt-1 text-sm text-slate-600">
            Approved ads, and ads back with the marketer.
          </p>
          <div className="mt-4">
            <Rows items={rest} waitingLabel={false} ai={ai} />
          </div>
        </>
      ) : null}
    </main>
  );
}
