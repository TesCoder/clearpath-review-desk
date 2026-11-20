import Link from "next/link";
import { resetDemo, switchRole } from "@/app/actions";
import type { Role } from "@/lib/status";
import { RoleHint, StayOnAd } from "./RoleSwitch";

export function Header({ role }: { role: Role }) {
  const tab = (value: Role, label: string) => (
    <button
      type="submit"
      name="role"
      value={value}
      aria-pressed={role === value}
      className={
        role === value
          ? "rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
          : "rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
      }
    >
      {label}
    </button>
  );
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
        <Link href={role === "marketer" ? "/marketer" : "/"} className="flex items-baseline gap-2">
          <span className="text-base font-semibold text-slate-900">ClearPath</span>
          <span className="text-sm text-slate-600">Ad review desk</span>
        </Link>
        <form action={switchRole} className="flex items-center gap-1 rounded-lg bg-slate-100 p-1" aria-label="View as">
          <StayOnAd />
          <span className="px-2 text-xs font-medium uppercase tracking-wide text-slate-500">View as</span>
          {tab("reviewer", "Reviewer")}
          {tab("marketer", "Marketer")}
        </form>
        <form action={resetDemo} className="ml-auto">
          <button
            type="submit"
            className="rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            title="Puts your demo workspace back to its starting ads. Only your own copy is affected."
          >
            Reset demo
          </button>
        </form>
      </div>
      <div className="border-t border-slate-100 bg-slate-50">
        <p className="mx-auto w-full max-w-7xl px-4 py-2 text-sm text-slate-700 sm:px-6">
          <RoleHint role={role} />{" "}
          <span className="hidden text-slate-500 sm:inline">Demo data: every company, offer and ad here is fictional.</span>
        </p>
      </div>
    </header>
  );
}
