import { STATUS_LABEL, type AssetStatus } from "@/lib/status";

const STYLE: Record<AssetStatus, string> = {
  new: "bg-sky-100 text-sky-900",
  revised: "bg-indigo-100 text-indigo-900",
  edited_after_approval: "bg-amber-100 text-amber-900",
  rescheduled: "bg-amber-100 text-amber-900",
  offer_changed: "bg-red-100 text-red-900",
  changes_requested: "bg-slate-200 text-slate-800",
  approved: "bg-emerald-100 text-emerald-900",
};

export function StatusPill({ status }: { status: AssetStatus }) {
  return (
    <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STYLE[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}
