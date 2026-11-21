"use client";

import { useActionState } from "react";
import { moveAd, type FormState } from "@/app/actions";
import { PLACEMENTS } from "@/lib/offers";
import { FormError } from "./form";

const field = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function MoveForm({
  adRef,
  plannedDate,
  placement,
  covered,
  intro,
}: {
  adRef: string;
  plannedDate: string;
  placement: string;
  /** The dates the offer has terms for, in words. */
  covered: string;
  intro?: string;
}) {
  const [state, action, pending] = useActionState<FormState, FormData>(moveAd, { error: null });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ref" value={adRef} />
      {/* Where the ad stood when this form was opened. The server refuses the move if it has been moved since. */}
      <input type="hidden" name="fromDate" value={plannedDate} />
      <input type="hidden" name="fromPlacement" value={placement} />
      <p className="text-sm text-slate-700">
        {intro ?? "An approval covers one date and one placement. Moving the ad sends it back to review, even if no word changes."}
      </p>
      <p className="text-xs text-slate-500">The offer has terms for {covered}.</p>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="font-medium text-slate-800">New date</span>
          <input type="date" name="plannedDate" defaultValue={plannedDate} className={field} required />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-slate-800">Placement</span>
          <select name="placement" defaultValue={placement} className={field}>
            {PLACEMENTS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </label>
      </div>
      <FormError error={state.error} />
      <button type="submit" disabled={pending} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
        {pending ? "Moving..." : "Move this ad"}
      </button>
    </form>
  );
}
