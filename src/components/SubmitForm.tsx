"use client";

import { useActionState, useState } from "react";
import { submitAd, type FormState } from "@/app/actions";
import { MAX_NOTE_CHARS } from "@/lib/checks";
import { formatDate } from "@/lib/format";
import { MAX_TITLE_CHARS, PLACEMENTS, coverageText, isIsoDate, termsOn, type RevisionTerms } from "@/lib/offers";
import { CopyEditor } from "./CopyEditor";
import { WordingCheck } from "./WordingCheck";

type Option = { id: string; label: string };
type OfferOption = Option & { supported: boolean };

const field =
  "mt-1 block w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600";

export function SubmitForm({
  affiliates,
  offers,
  revisions,
  defaultDate,
}: {
  affiliates: Option[];
  offers: OfferOption[];
  revisions: RevisionTerms[];
  defaultDate: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitAd, { error: null });
  const [offerId, setOfferId] = useState(offers.find((o) => o.supported)?.id ?? "");
  const [date, setDate] = useState(defaultDate);
  const [body, setBody] = useState("");
  const [placement, setPlacement] = useState<string>(PLACEMENTS[0]);
  const terms = isIsoDate(date) ? termsOn(revisions, offerId, date) : null;

  return (
    <form action={action} className="grid gap-6 lg:grid-cols-5">
      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-2">
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Affiliate</span>
          <select name="affiliateId" className={field} required>
            {affiliates.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Where it will run</span>
          <select name="placement" value={placement} onChange={(e) => setPlacement(e.target.value)} className={field} required>
            {PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Planned publication date</span>
          <input type="date" name="plannedDate" value={date} onChange={(e) => setDate(e.target.value)} className={field} required />
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">ClearPath offer it promotes</span>
          <select name="offerId" value={offerId} onChange={(e) => setOfferId(e.target.value)} className={field} required>
            {offers.map((o) => (
              <option key={o.id} value={o.id} disabled={!o.supported}>
                {o.label}
                {o.supported ? "" : " (not set up yet)"}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-slate-500">
            This desk is set up for personal-loan ads. Credit card and mortgage ads are not set up yet.
          </span>
          {terms ? (
            <span className="mt-1 block text-xs text-slate-500">
              Terms in effect on {formatDate(date)}: revision {terms.revision}
              {terms.aprMin !== null ? `, APR ${terms.aprMin.toFixed(2)}% to ${terms.aprMax?.toFixed(2)}%` : ""}
              {terms.feePct !== null ? `, ${terms.feePct}% origination fee` : ""}.
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Short name for this ad</span>
          <input name="title" maxLength={MAX_TITLE_CHARS} className={field} placeholder="For example: January listing" required />
        </label>
      </div>

      <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:col-span-3">
        <CopyEditor
          value={body}
          onChange={setBody}
          terms={terms}
          dateLabel={isIsoDate(date) ? formatDate(date) : "that date"}
          covered={coverageText(revisions, offerId)}
        />
        <WordingCheck body={body} offerId={offerId} plannedDate={date} placement={placement} ready={Boolean(terms)} />
        <label className="block">
          <span className="text-sm font-medium text-slate-800">Note to the reviewer (optional)</span>
          <textarea name="note" rows={2} maxLength={MAX_NOTE_CHARS} className={field} />
        </label>
        {state.error ? (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
            {state.error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || !terms}
          className="rounded-md bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Submitting..." : "Submit for review"}
        </button>
      </div>
    </form>
  );
}
