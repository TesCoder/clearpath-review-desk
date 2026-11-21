// Small pieces shared by the cards on the ad's review screen.
import type { Check } from "@/lib/checks";

export function Card({
  title,
  children,
  tone,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "plain" | "attention";
}) {
  return (
    <section
      className={`rounded-lg border bg-white p-4 ${tone === "attention" ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}
    >
      <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
        {title}
      </h2>
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Badge({ label, cls }: { label: string; cls: string }) {
  return (
    <span
      className={`inline-block shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}
    >
      {label}
    </span>
  );
}


/** How each result of a code check is labeled wherever it is shown. */
export const CHECK: Record<Check["status"], { label: string; cls: string }> = {
  mismatch: { label: "Does not match", cls: "bg-red-100 text-red-900" },
  needs_reviewer: {
    label: "Needs your eyes",
    cls: "bg-amber-100 text-amber-900",
  },
  ok: { label: "Matches", cls: "bg-emerald-100 text-emerald-900" },
};
