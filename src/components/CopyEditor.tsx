"use client";

import { useMemo } from "react";
import { MAX_COPY_CHARS, analyzeCopy, type OfferTerms } from "@/lib/checks";
import { findInstructionText } from "@/lib/injection";

/**
 * The ad copy box with the offer check running as the marketer types. The
 * same check runs again on the server when the ad is submitted; this one only
 * saves the marketer a round with the reviewer.
 */
export function CopyEditor({
  value,
  onChange,
  terms,
  dateLabel,
  covered,
}: {
  value: string;
  onChange: (next: string) => void;
  terms: OfferTerms | null;
  dateLabel: string;
  /** The dates the offer has terms for, in words. */
  covered?: string;
}) {
  const analysis = useMemo(() => (terms && value.trim() ? analyzeCopy(value, terms) : null), [value, terms]);
  const open = analysis?.checks.filter((c) => c.status !== "ok") ?? [];
  const fine = analysis?.checks.filter((c) => c.status === "ok") ?? [];
  // Text written to the reviewer or to an AI. Found in code, as the marketer types, with no model call.
  const instruction = useMemo(() => (value.trim() ? findInstructionText(value) : []), [value]);

  return (
    <div>
      <label className="block">
        <span className="text-sm font-medium text-slate-800">Ad copy</span>
        <textarea
          name="body"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={5}
          maxLength={MAX_COPY_CHARS}
          required
          placeholder="Paste the affiliate's ad text here."
          className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-base focus:border-indigo-600 focus:outline-none focus:ring-1 focus:ring-indigo-600"
        />
      </label>
      <p className="mt-1 text-xs text-slate-500">
        {value.length} of {MAX_COPY_CHARS} characters. Plain text only: links and formatting are shown to the reviewer as
        typed.
      </p>

      <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-3" aria-live="polite">
        <p className="text-sm font-semibold text-slate-800">Check against the offer</p>
        {!terms ? (
          <p className="mt-1 text-sm text-amber-900">
            No terms for this offer are in effect on {dateLabel}.{covered ? ` It has terms for ${covered}.` : ""} Pick another
            date or offer: an ad cannot be submitted for a date with no terms to check it against.
          </p>
        ) : !value.trim() ? (
          <p className="mt-1 text-sm text-slate-600">Rates and fees in the copy are checked here as you type.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {open.map((c, i) => (
              <li
                key={`o${i}`}
                className={
                  c.status === "mismatch"
                    ? "rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-950"
                    : "rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950"
                }
              >
                <p>{c.message}</p>
                {c.suggestion ? (
                  <button
                    type="button"
                    onClick={() => onChange(value.slice(0, c.claim.start) + c.suggestion + value.slice(c.claim.end))}
                    className="mt-2 rounded-md border border-red-300 bg-white px-2.5 py-1 text-sm font-medium text-red-900 hover:bg-red-100"
                  >
                    Change to: {c.suggestion}
                  </button>
                ) : null}
              </li>
            ))}
            {analysis?.hidden.map((h) => (
              <li key={h.kind} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950">
                {h.label}. The reviewer will see this flag. Retyping the text usually removes it.
              </li>
            ))}
            {instruction.map((f, i) => (
              <li key={`i${i}`} className="rounded-md border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950" data-flag="instruction">
                <q>{f.quote}</q> reads as written to the reviewer or to an AI, not to a consumer ({f.reason}). It has no
                effect on the checks or on the decision, and the reviewer will see this flag.
              </li>
            ))}
            {fine.map((c, i) => (
              <li key={`f${i}`} className="text-sm text-emerald-900">
                {c.message}
              </li>
            ))}
            {analysis && analysis.checks.length === 0 && analysis.hidden.length === 0 && instruction.length === 0 ? (
              <li className="text-sm text-slate-600">
                No rate or fee found to compare with the offer. This is not a sign-off: other wording in the ad is read by the
                AI claim finder and by the reviewer.
              </li>
            ) : null}
          </ul>
        )}
        {open.length ? (
          <p className="mt-2 text-xs text-slate-600">
            Red items do not match the offer. Amber items are things the check could not read: the reviewer will read them.
            You can fix these now, or submit anyway with a note. The reviewer sees the same flags.
          </p>
        ) : null}
      </div>
    </div>
  );
}
