import { loadAssets } from "@/lib/data";
import { hasDatabase } from "@/lib/db";
import { STATUS_LABEL } from "@/lib/status";
import { getWorkspaceId } from "@/lib/workspace";

export const dynamic = "force-dynamic";

// Temporary Phase 1 page: lists the seeded ads so the data can be checked.
// Phase 2 replaces it with the reviewer queue.
export default async function Home() {
  if (!hasDatabase()) {
    return (
      <main className="mx-auto w-full max-w-2xl px-6 py-16">
        <h1 className="text-3xl font-semibold">Ad review desk</h1>
        <p className="mt-4 text-neutral-600">The database is not connected yet.</p>
      </main>
    );
  }
  const assets = await loadAssets(await getWorkspaceId());
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12">
      <p className="text-sm font-medium uppercase tracking-wide text-neutral-500">ClearPath Financial (fictional)</p>
      <h1 className="mt-1 text-3xl font-semibold">Ad review desk</h1>
      <ul className="mt-8 divide-y divide-neutral-200 border-y border-neutral-200">
        {assets.map((a) => (
          <li key={a.id} className="py-3" data-ref={a.ref} data-status={a.status}>
            <div className="font-medium">
              {a.ref} · {a.affiliate.name} · {a.title}
            </div>
            <div className="text-sm text-neutral-600">
              Version {a.latest.number} · {STATUS_LABEL[a.status]} · planned {a.plannedDate} ·{" "}
              {a.analysis?.openFlags ?? 0} open flags
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
