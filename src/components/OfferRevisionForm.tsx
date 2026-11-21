"use client";

import { useActionState, useState } from "react";
import { addOfferRevision, type FormState } from "@/app/actions";
import { formatDate } from "@/lib/format";
import { inForceText, isIsoDate, parsePercent, refuseRevision, termChanges, termsOn, withTimeline, type RevisionTerms } from "@/lib/offers";
import { FIELD, FormError } from "./form";

export type ApprovedAd = { ref: string; affiliate: string; placement: string; plannedDate: string };

const two = (n: number | null) => (n === null ? "" : n.toFixed(2));

/**
 * Adds a revision to one offer. Before anything is saved, it shows the dates
 * the revision would be in force and which approved ads it would send back to
 * review, worked out with the same functions the server uses.
 */
export function OfferRevisionForm({
  offerId,
  campaign,
  revisions,
  approved,
  nextNumber,
  defaultDate,
}: {
  offerId: string;
  campaign: string;
  /** This offer's revisions, with the dates each is in force. */
  revisions: RevisionTerms[];
  /** Ads for this offer that are approved as they stand. */
  approved: ApprovedAd[];
  nextNumber: number;
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(addOfferRevision, { error: null });
  const start = termsOn(revisions, offerId, defaultDate) ?? revisions[revisions.length - 1] ?? null;
  const [date, setDate] = useState(defaultDate);
  const [aprMin, setAprMin] = useState(two(start?.aprMin ?? null));
  const [aprMax, setAprMax] = useState(two(start?.aprMax ?? null));
  const [fee, setFee] = useState(two(start?.feePct ?? null));

  const inForce = isIsoDate(date) ? termsOn(revisions, offerId, date) : null;
  const values = { aprMin: parsePercent(aprMin), aprMax: parsePercent(aprMax), feePct: parsePercent(fee) };
  const complete = values.aprMin !== null && values.aprMax !== null && values.feePct !== null;
  const refusal = complete
    ? refuseRevision({ aprMin: values.aprMin!, aprMax: values.aprMax!, feePct: values.feePct!, effectiveFrom: date }, inForce)
    : "Enter each rate and the fee as a number with up to two decimals, such as 9.49.";

  // The revision as it would stand, placed among the others to see its dates.
  let preview: { candidate: RevisionTerms; affected: ApprovedAd[] } | null = null;
  if (!refusal && complete) {
    const candidate: RevisionTerms = {
      revisionId: "candidate",
      offerId,
      revision: nextNumber,
      campaign,
      effectiveFrom: date,
      effectiveTo: null,
      aprMin: values.aprMin,
      aprMax: values.aprMax,
      feePct: values.feePct,
      termMinMonths: inForce?.termMinMonths ?? start?.termMinMonths ?? null,
      termMaxMonths: inForce?.termMaxMonths ?? start?.termMaxMonths ?? null,
      source: "",
    };
    const timeline = withTimeline([...revisions, candidate]);
    const placed = timeline.find((r) => r.revisionId === "candidate")!;
    preview = {
      candidate: placed,
      affected: approved
        .filter((a) => termsOn(timeline, offerId, a.plannedDate)?.revisionId === "candidate")
        .sort((a, b) => a.plannedDate.localeCompare(b.plannedDate)),
    };
  }
  const changed = preview && inForce ? termChanges(inForce, preview.candidate).filter((r) => r.changed) : [];

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-5" aria-label={`Add a revision to ${campaign}`}>
      <input type="hidden" name="offerId" value={offerId} />
      <div className="space-y-4 lg:col-span-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Effective from</span>
          <input type="date" name="effectiveFrom" value={date} onChange={(e) => setDate(e.target.value)} className={FIELD} required />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Lowest APR %</span>
            <input name="aprMin" inputMode="decimal" value={aprMin} onChange={(e) => setAprMin(e.target.value)} className={FIELD} required />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Highest APR %</span>
            <input name="aprMax" inputMode="decimal" value={aprMax} onChange={(e) => setAprMax(e.target.value)} className={FIELD} required />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-800">Origination fee %</span>
            <input name="feePct" inputMode="decimal" value={fee} onChange={(e) => setFee(e.target.value)} className={FIELD} required />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          The loan term range is carried over from the revision this one replaces. Saving always adds a new revision:
          nothing already on the offer sheet is edited.
        </p>
      </div>

      <div className="lg:col-span-3">
        <div className="rounded-md border border-slate-200 bg-slate-50 p-3" aria-live="polite" data-preview="offer-revision">
          <p className="text-sm font-semibold text-slate-800">Before you save</p>
          {refusal || !preview ? (
            <p className="mt-1 text-sm text-slate-600">{refusal}</p>
          ) : (
            <div className="mt-1 space-y-2 text-sm text-slate-800">
              <p>
                Revision {nextNumber} would be in effect {inForceText(preview.candidate)}
                {preview.candidate.replacedBy ? `, when revision ${preview.candidate.replacedBy} starts` : ""}.
                {inForce ? ` From ${formatDate(date)} it replaces revision ${inForce.revision}.` : ""}
              </p>
              {changed.length ? (
                <p>
                  {changed.map((r, i) => (
                    <span key={r.label}>
                      {i > 0 ? "; " : ""}
                      {r.label} {r.before} → <span className="font-semibold">{r.after}</span>
                    </span>
                  ))}
                  .
                </p>
              ) : null}
              {preview.affected.length ? (
                <div className="rounded-md border border-red-200 bg-red-50 p-2 text-red-950">
                  <p className="font-medium">
                    {preview.affected.length} approved ad{preview.affected.length === 1 ? " is" : "s are"} planned in that period
                    and would need review again:
                  </p>
                  <ul className="mt-1 list-disc pl-5">
                    {preview.affected.map((a) => (
                      <li key={a.ref}>
                        {a.ref}, {a.affiliate}, {a.placement.toLowerCase()}, {formatDate(a.plannedDate)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <p className="text-slate-600">No approved ad is planned in that period, so no approval is affected.</p>
              )}
            </div>
          )}
        </div>
        <FormError error={state.error} className="mt-3" />
        <button
          type="submit"
          disabled={pending || Boolean(refusal)}
          className="mt-3 rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Saving..." : `Add revision ${nextNumber}`}
        </button>
      </div>
    </form>
  );
}
