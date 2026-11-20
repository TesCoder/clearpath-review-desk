import Link from "next/link";
import { SubmitForm } from "@/components/SubmitForm";
import { loadAffiliates, loadOffers, loadRevisions } from "@/lib/data";
import { isoDatePlusDays } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function NewAd() {
  const [affiliates, offers, revisions] = await Promise.all([loadAffiliates(), loadOffers(), loadRevisions()]);
  // Personal loans first: it is the campaign this desk is set up for.
  const ordered = [...offers].sort((a, b) => Number(b.id.startsWith("pl-")) - Number(a.id.startsWith("pl-")));
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      <Link href="/marketer" className="text-sm text-indigo-700 underline-offset-2 hover:underline">
        Back to your ads
      </Link>
      <h1 className="mt-2 text-2xl font-semibold">Submit an affiliate ad</h1>
      <p className="mt-1 text-sm text-slate-600">
        Rates and fees are checked against the offer in effect on the publication date while you can still fix them.
      </p>
      <div className="mt-6">
        <SubmitForm
          affiliates={affiliates.map((a) => ({ id: a.id, label: `${a.name} (${a.kind.toLowerCase()})` }))}
          offers={ordered.map((o) => ({ id: o.id, label: `${o.campaign} (${o.product.toLowerCase()})` }))}
          revisions={revisions}
          defaultDate={isoDatePlusDays(14)}
        />
      </div>
    </main>
  );
}
