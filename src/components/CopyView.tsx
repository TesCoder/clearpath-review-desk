import type { Check } from "@/lib/checks";
import type { DiffPart } from "@/lib/diff";

const MARK: Record<Check["status"], string> = {
  mismatch: "bg-red-100 text-red-950 underline decoration-red-500 decoration-2 underline-offset-4",
  needs_reviewer: "bg-amber-100 text-amber-950 underline decoration-amber-500 decoration-2 underline-offset-4",
  ok: "bg-emerald-50 text-emerald-950 underline decoration-emerald-400 decoration-1 underline-offset-4",
};
const TITLE: Record<Check["status"], string> = {
  mismatch: "Does not match the offer",
  needs_reviewer: "Needs your eyes",
  ok: "Matches the offer",
};

/**
 * The ad's words with the checked claims marked. The copy is untrusted text:
 * it is only ever placed in the page as text, so markup or links inside it
 * show up as the characters the affiliate typed.
 */
export type ExtraMark = { start: number; end: number; tone: "ai" | "instruction"; title: string };

const EXTRA: Record<ExtraMark["tone"], string> = {
  ai: "bg-violet-50 text-violet-950 underline decoration-violet-500 decoration-dotted decoration-2 underline-offset-4",
  instruction: "bg-amber-100 text-amber-950 underline decoration-amber-600 decoration-wavy decoration-1 underline-offset-4",
};

export function CopyView({ body, checks, extra = [], id }: { body: string; checks: Check[]; extra?: ExtraMark[]; id?: string }) {
  // Code checks take precedence where marks overlap.
  const spans = [
    ...checks.map((c) => ({ start: c.claim.start, end: c.claim.end, cls: MARK[c.status], title: `${TITLE[c.status]}: ${c.message}`, rank: 0 })),
    ...extra.map((e) => ({ start: e.start, end: e.end, cls: EXTRA[e.tone], title: e.title, rank: 1 })),
  ].sort((a, b) => a.start - b.start || a.rank - b.rank);
  const taken = spans.filter((s) => s.rank === 0);
  const kept = spans.filter((s) => s.rank === 0 || !taken.some((t) => s.start < t.end && t.start < s.end));
  const out: React.ReactNode[] = [];
  let at = 0;
  kept.forEach((c, i) => {
    if (c.start < at) return; // overlapping spans: keep the first
    if (c.start > at) out.push(body.slice(at, c.start));
    out.push(
      <mark key={i} className={`rounded px-0.5 ${c.cls}`} title={c.title}>
        {body.slice(c.start, c.end)}
      </mark>,
    );
    at = c.end;
  });
  if (at < body.length) out.push(body.slice(at));
  return (
    <p id={id} className="whitespace-pre-wrap break-words text-lg leading-relaxed text-slate-900">
      {out}
    </p>
  );
}

export function DiffView({ parts }: { parts: DiffPart[] }) {
  return (
    <p className="whitespace-pre-wrap break-words leading-relaxed text-slate-800">
      {parts.map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "added" ? (
          <ins key={i} className="rounded bg-emerald-100 px-0.5 text-emerald-950 no-underline" title="Added in this version">
            {p.text}
          </ins>
        ) : (
          <del key={i} className="rounded bg-red-100 px-0.5 text-red-900 line-through" title="Removed in this version">
            {p.text}
          </del>
        ),
      )}
    </p>
  );
}
