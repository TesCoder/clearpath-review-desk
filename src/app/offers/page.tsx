import Link from "next/link";
import { OfferRevisionForm } from "@/components/OfferRevisionForm";
import { SwitchTo } from "@/components/SwitchTo";
import { loadAssets, loadOffers, loadRevisions, type AssetView, type RevisionTerms } from "@/lib/data";
import { db } from "@/lib/db";
import { formatDate, percent } from "@/lib/format";
import { SUPPORTED_PRODUCT, inForceText } from "@/lib/offers";
import { getRole, getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

const pct = (n: number | null) => (n === null ? "Not stated" : percent(n));

/** The first day of next month, as YYYY-MM-DD: a usual start date for new terms. */
function firstOfNextMonth(): string {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString().slice(0, 10);
}

function RevisionTable({ revisions, assets }: { revisions: RevisionTerms[]; assets: AssetView[] }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
      <table className="w-full min-w-[820px] text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-2 font-medium">Revision</th>
            <th className="px-4 py-2 font-medium">In effect</th>
            <th className="px-4 py-2 font-medium">Lowest APR</th>
            <th className="px-4 py-2 font-medium">Highest APR</th>
            <th className="px-4 py-2 font-medium">Origination fee</th>
            <th className="px-4 py-2 font-medium">Loan terms</th>
            <th className="px-4 py-2 font-medium">Ads on these terms</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {revisions.map((r) => {
            const when = inForceText(r);
            const here = assets.filter((a) => a.terms?.revisionId === r.revisionId);
            const approved = here.filter((a) => a.status === "approved").length;
            return (
              <tr key={r.revisionId} data-revision={r.revision}>
                <td className="px-4 py-3 font-medium">
                  {r.revision}
                  {r.addedHere ? (
                    <span className="ml-2 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-900">
                      Added in this demo
                    </span>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {when ?? `On no date: revision ${r.replacedBy} replaced it from its start date`}
                  {when && r.replacedBy ? (
                    <span className="block text-xs text-slate-500">Revision {r.replacedBy} takes over after that</span>
                  ) : null}
                </td>
                <td className="px-4 py-3">{pct(r.aprMin)}</td>
                <td className="px-4 py-3">{pct(r.aprMax)}</td>
                <td className="px-4 py-3">{pct(r.feePct)}</td>
                <td className="px-4 py-3">
                  {r.termMinMonths !== null ? `${r.termMinMonths} to ${r.termMaxMonths} months` : "Not stated"}
                </td>
                <td className="px-4 py-3 text-slate-600">
                  {here.length ? `${here.length} ad${here.length === 1 ? "" : "s"}, ${approved} approved` : "None"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function OfferSheet(props: PageProps<"/offers">) {
  const { added } = await props.searchParams;
  const workspaceId = await getWorkspaceId();
  const [role, offers, revisions, assets] = await Promise.all([
    getRole(),
    loadOffers(),
    loadRevisions(workspaceId),
    loadAssets(workspaceId),
  ]);
  const supported = offers.filter((o) => o.product === SUPPORTED_PRODUCT);
  const others = offers.filter((o) => o.product !== SUPPORTED_PRODUCT);

  // What the last save did, read back from the record it wrote.
  const addedId = typeof added === "string" && /^[a-z0-9-]{1,60}$/.test(added) ? added : null;
  const saved = addedId ? revisions.find((r) => r.revisionId === addedId && r.addedHere) : null;
  let affected: AssetView[] = [];
  if (saved) {
    const rows = await db()`
      select data from events
      where workspace_id = ${workspaceId} and type = 'offer_revised' and data->>'revisionId' = ${saved.revisionId}
      order by id desc limit 1
    `;
    const refs: string[] = Array.isArray(rows[0]?.data?.affected) ? rows[0].data.affected : [];
    affected = assets.filter((a) => refs.includes(a.ref)).sort((a, b) => a.plannedDate.localeCompare(b.plannedDate));
  }

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">Offer sheet</h1>
      <p className="mt-1 max-w-3xl text-sm text-slate-600">
        The terms ClearPath has published for each offer, one revision at a time. Every ad is checked against the revision
        in effect on its planned publication date, and every approval is tied to that revision. When the terms change, the
        approvals they covered go back to review.
      </p>

      {saved ? (
        <div
          className="mt-6 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950"
          role="status"
          data-banner="revision-saved"
        >
          <p className="font-semibold">
            Revision {saved.revision} of {saved.campaign} is saved. It is in effect {inForceText(saved) ?? "on no date"}.
          </p>
          {affected.length ? (
            <>
              <p className="mt-2">
                {affected.length} approved ad{affected.length === 1 ? "" : "s"} now need{affected.length === 1 ? "s" : ""} review
                because the offer changed:
              </p>
              <ul className="mt-1 space-y-1">
                {affected.map((a) => (
                  <li key={a.id}>
                    <Link href={`/ads/${a.ref}`} className="font-medium underline">
                      {a.ref}
                    </Link>
                    , {a.affiliate.name}, {a.placement.toLowerCase()}, {formatDate(a.plannedDate)}:{" "}
                    {a.status !== "offer_changed"
                      ? "reviewed since"
                      : a.analysis && a.analysis.mismatches > 0
                        ? `${a.analysis.mismatches} claim${a.analysis.mismatches === 1 ? "" : "s"} no longer match${a.analysis.mismatches === 1 ? "es" : ""} the new terms`
                        : "no mismatch against the new terms, needs approval again"}
                  </li>
                ))}
              </ul>
              <p className="mt-2">
                {role === "reviewer" ? (
                  <Link href="/" className="font-medium underline">
                    Open the review queue: they are at the top
                  </Link>
                ) : (
                  "They are at the top of the reviewer's queue."
                )}
              </p>
            </>
          ) : (
            <p className="mt-2">No approved ad was planned for those dates, so no approval was affected.</p>
          )}
          <p className="mt-2 text-xs text-emerald-900">
            Ads still in review for those dates are now checked against revision {saved.revision}. No AI call was made:
            the re-check is code only.
          </p>
        </div>
      ) : null}

      {supported.map((o) => {
        const own = revisions.filter((r) => r.offerId === o.id);
        const approved = assets
          .filter((a) => a.offer.id === o.id && a.status === "approved")
          .map((a) => ({
            ref: a.ref,
            affiliate: a.affiliate.name,
            placement: a.placement,
            plannedDate: a.plannedDate,
          }));
        return (
          <section key={o.id} className="mt-8">
            <h2 className="text-lg font-semibold">
              {o.campaign} <span className="font-normal text-slate-600">({o.product.toLowerCase()})</span>
            </h2>
            <div className="mt-3">
              <RevisionTable revisions={own} assets={assets} />
            </div>
            <div className="mt-6 rounded-lg border border-slate-200 bg-white p-4">
              <h3 className="text-base font-semibold">Add a revision</h3>
              {role === "reviewer" ? (
                <div className="mt-3">
                  <OfferRevisionForm
                    key={own.length}
                    offerId={o.id}
                    campaign={o.campaign}
                    revisions={own}
                    approved={approved}
                    nextNumber={Math.max(0, ...own.map((r) => r.revision)) + 1}
                    defaultDate={firstOfNextMonth()}
                  />
                </div>
              ) : (
                <div className="mt-2 space-y-2 text-sm text-slate-700">
                  <p>Compliance owns the offer sheet. Switch to the Reviewer view to add a revision.</p>
                  <SwitchTo role="reviewer" label="Switch to the Reviewer view" />
                </div>
              )}
            </div>
          </section>
        );
      })}

      {others.length ? (
        <section className="mt-10">
          <h2 className="text-lg font-semibold">Not set up yet</h2>
          <p className="mt-1 text-sm text-slate-600">
            This desk reviews personal-loan ads. These offers are listed as company context and cannot be changed here.
          </p>
          <ul className="mt-3 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white text-sm">
            {others.map((o) => {
              const r = revisions.find((x) => x.offerId === o.id);
              return (
                <li key={o.id} className="flex flex-wrap gap-x-4 gap-y-1 px-4 py-3">
                  <span className="font-medium">{o.campaign}</span>
                  <span className="text-slate-600">{o.product}</span>
                  <span className="ml-auto text-slate-600">
                    {r && r.aprMin !== null ? `APR ${pct(r.aprMin)} to ${pct(r.aprMax)}` : "No rate terms on file"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <p className="mt-8 text-xs text-slate-500">
        A revision added here belongs to your demo workspace only. Other visitors never see it, and Reset demo removes it.
      </p>
    </main>
  );
}
