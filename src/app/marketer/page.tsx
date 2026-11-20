import Link from "next/link";
import { StatusPill } from "@/components/StatusPill";
import { loadAssets } from "@/lib/data";
import { formatDate, timeAgo } from "@/lib/format";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

export default async function MarketerHome() {
  const assets = await loadAssets(await getWorkspaceId());
  const mine = [...assets].sort((a, b) => {
    const rank = (s: string) => (s === "changes_requested" ? 0 : s === "approved" ? 2 : 1);
    return rank(a.status) - rank(b.status) || b.lastActivityAt.localeCompare(a.lastActivityAt);
  });
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold">Your ads</h1>
      <p className="mt-1 text-sm text-slate-600">Ads that need your changes come first.</p>
      <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
        {mine.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3" data-ref={a.ref} data-status={a.status}>
            <Link href={`/ads/${a.ref}`} className="font-medium text-indigo-700 underline-offset-2 hover:underline">
              {a.ref}
            </Link>
            <span className="text-slate-700">
              {a.affiliate.name}: {a.title}
            </span>
            <StatusPill status={a.status} />
            <span className="ml-auto text-sm text-slate-600">
              Version {a.latest.number} · publishing {formatDate(a.plannedDate)} · {timeAgo(a.lastActivityAt)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}
