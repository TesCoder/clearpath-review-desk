// Shared by server and browser: which offer terms apply on a date.
import type { OfferTerms } from "./checks";
import { formatDate } from "./format";

export type RevisionTerms = OfferTerms & { offerId: string; revision: number };

export const PLACEMENTS = ["Comparison site listing", "Blog article", "Email newsletter", "Social post"] as const;

export function termsOn<T extends OfferTerms & { offerId: string }>(revisions: T[], offerId: string, date: string): T | null {
  return (
    revisions.find(
      (r) => r.offerId === offerId && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo),
    ) ?? null
  );
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export const MAX_TITLE_CHARS = 80;
export const MAX_ADS_PER_WORKSPACE = 40;
export const MAX_VERSIONS_PER_AD = 20;
export const MAX_DECISIONS_PER_AD = 40;
export const MAX_MOVES_PER_AD = 30;

function nextDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** The date ranges an offer has terms for, with back-to-back revisions joined. */
export function coverage(revisions: Array<OfferTerms & { offerId: string }>, offerId: string): Array<{ from: string; to: string | null }> {
  const own = revisions.filter((r) => r.offerId === offerId).sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const out: Array<{ from: string; to: string | null }> = [];
  for (const r of own) {
    const last = out[out.length - 1];
    if (last && last.to !== null && nextDay(last.to) >= r.effectiveFrom) last.to = r.effectiveTo;
    else if (!last || last.to !== null) out.push({ from: r.effectiveFrom, to: r.effectiveTo });
  }
  return out;
}

/** "Nov 1, 2026 onward", or "Nov 1, 2026 to Dec 31, 2026 and Mar 1, 2027 onward". */
export function coverageText(revisions: Array<OfferTerms & { offerId: string }>, offerId: string): string {
  const ranges = coverage(revisions, offerId);
  if (!ranges.length) return "no dates";
  return ranges.map((r) => (r.to ? `${formatDate(r.from)} to ${formatDate(r.to)}` : `${formatDate(r.from)} onward`)).join(" and ");
}
