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
export function CopyView({ body, checks, id }: { body: string; checks: Check[]; id?: string }) {
  const spans = [...checks].sort((a, b) => a.claim.start - b.claim.start);
  const out: React.ReactNode[] = [];
  let at = 0;
  spans.forEach((c, i) => {
    if (c.claim.start < at) return; // overlapping spans: keep the first
    if (c.claim.start > at) out.push(body.slice(at, c.claim.start));
    out.push(
      <mark key={i} className={`rounded px-0.5 ${MARK[c.status]}`} title={`${TITLE[c.status]}: ${c.message}`}>
        {body.slice(c.claim.start, c.claim.end)}
      </mark>,
    );
    at = c.claim.end;
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
