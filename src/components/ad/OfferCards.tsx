import type { AssetView } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { Badge, CHECK, Card } from "./ui";

/** The offer revision in effect on the ad's planned publication date, with its dates and source. */
export function OfferTermsCard({ asset }: { asset: AssetView }) {
  const { terms } = asset;
  return (
    <Card title="Offer terms that apply">
      {terms ? (
        <>
          <p className="text-sm text-slate-800">
            <span className="font-semibold">{terms.campaign}</span>,
            revision {terms.revision}. In effect{" "}
            {formatDate(terms.effectiveFrom)}
            {terms.effectiveTo
              ? ` to ${formatDate(terms.effectiveTo)}`
              : " onward"}
            , which covers the planned publication on{" "}
            {formatDate(asset.plannedDate)}.
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-slate-500">Lowest APR</dt>
            <dd className="font-medium">
              {terms.aprMin !== null
                ? `${terms.aprMin.toFixed(2)}%`
                : "Not stated"}
            </dd>
            <dt className="text-slate-500">Highest APR</dt>
            <dd className="font-medium">
              {terms.aprMax !== null
                ? `${terms.aprMax.toFixed(2)}%`
                : "Not stated"}
            </dd>
            <dt className="text-slate-500">Origination fee</dt>
            <dd className="font-medium">
              {terms.feePct !== null ? `${terms.feePct}%` : "Not stated"}
            </dd>
            <dt className="text-slate-500">Loan terms</dt>
            <dd className="font-medium">
              {terms.termMinMonths !== null
                ? `${terms.termMinMonths} to ${terms.termMaxMonths} months`
                : "Not stated"}
            </dd>
          </dl>
          <p className="mt-3 text-xs text-slate-500">
            Source: {terms.source}
          </p>
        </>
      ) : (
        <p className="text-sm text-amber-900">
          No {asset.offer.campaign} terms are in effect on{" "}
          {formatDate(asset.plannedDate)}. The ad cannot be checked or
          approved for that date.
        </p>
      )}
    </Card>
  );
}

/** Each rate and fee the code found in the ad, compared with those terms. */
export function OfferChecksCard({ asset }: { asset: AssetView }) {
  const { analysis } = asset;
  return (
    <Card title="Checks against the offer">
      {analysis && analysis.checks.length && analysis.openFlags === 0 ? (
        <p className="mb-2 text-sm font-medium text-slate-900">No detected offer mismatch.</p>
      ) : null}
      {analysis && analysis.checks.length ? (
        <ul className="space-y-2">
          {analysis.checks.map((c, i) => (
            <li
              key={i}
              className="flex items-start justify-between gap-2 text-sm"
            >
              <p className="text-slate-800">{c.message}</p>
              <Badge {...CHECK[c.status]} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-600">
          No rate or fee found to compare with the offer. That is not a finding that the ad is fine: read the wording, and see the AI claim finder below.
        </p>
      )}
      <p className="mt-3 text-xs text-slate-500">
        Numbers are compared with the offer sheet by code, not by AI. A
        match means a figure agrees with the offer sheet. It is not a
        finding that the ad is compliant: other wording, required
        disclosures and how the ad is laid out still need your judgment.
      </p>
    </Card>
  );
}
