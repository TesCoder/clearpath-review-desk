// Shared by server and browser: which offer terms apply on a date.
import type { OfferTerms } from "./checks";

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
