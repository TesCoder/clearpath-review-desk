import { switchRole } from "@/app/actions";
import type { Role } from "@/lib/status";

/** A button that switches view and opens the same ad there: no list to search. Without an ad, it stays on the offer sheet. */
export function SwitchTo({ role, adRef, label }: { role: Role; adRef?: string; label: string }) {
  return (
    <form action={switchRole} className="inline">
      <input type="hidden" name="role" value={role} />
      <input type="hidden" name="next" value={adRef ? `/ads/${adRef}` : "/offers"} />
      <button type="submit" className="rounded-md border border-slate-400 bg-white px-3 py-1 text-sm font-medium text-slate-900 hover:bg-slate-100">
        {label}
      </button>
    </form>
  );
}
