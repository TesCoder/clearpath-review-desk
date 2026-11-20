"use client";

import { useActionState } from "react";
import { moveAd, type FormState } from "@/app/actions";
import { PLACEMENTS } from "@/lib/offers";

const field = "mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm";

export function MoveForm({ adRef, plannedDate, placement }: { adRef: string; plannedDate: string; placement: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(moveAd, { error: null });
  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="ref" value={adRef} />
      <p className="text-sm text-slate-700">
        An approval covers one date and one placement. Moving the ad sends it back to review, even if no word changes.
      </p>
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
      {state.error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900" role="alert">
          {state.error}
        </p>
      ) : null}
      <button type="submit" disabled={pending} className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-50 disabled:opacity-60">
        {pending ? "Moving..." : "Move this ad"}
      </button>
    </form>
  );
}
