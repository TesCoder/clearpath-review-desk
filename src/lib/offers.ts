// Shared by server and browser: which offer terms apply on a date.
import type { OfferTerms } from "./checks";
import { formatDate, percent } from "./format";

export type RevisionTerms = OfferTerms & {
  offerId: string;
  revision: number;
  /** True for a revision added on the Offer sheet page of this visitor's demo. */
  addedHere?: boolean;
  /** The revision that took over, when another one started on or after this one's start. */
  replacedBy?: number | null;
};

export const PLACEMENTS = ["Comparison site listing", "Blog article", "Email newsletter", "Social post"] as const;

/** The day after a date, as YYYY-MM-DD. */
export const dayAfter = (isoDate: string) => shiftDay(isoDate, 1);

/** A date moved by a number of days, as YYYY-MM-DD. */
function shiftDay(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * Works out when each revision is in force. A revision applies from its start
 * date until the next revision of the same offer starts. When two start on
 * the same date, the higher revision number replaces the other from that
 * date, so a correction is a new revision and nothing is ever edited.
 *
 * Returns copies whose `effectiveTo` is the last day the revision is actually
 * in force. One that was replaced from its own start date gets an end before
 * its start, so it applies on no date and stays on record.
 */
export function withTimeline<T extends OfferTerms & { offerId: string; revision: number }>(
  revisions: T[],
): Array<T & { replacedBy: number | null }> {
  const later = (a: T, b: T) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.revision - b.revision;
  return revisions.map((r) => {
    const next = revisions
      .filter((o) => o.offerId === r.offerId && o !== r && later(o, r) > 0)
      .sort(later)[0];
    if (!next) return { ...r, replacedBy: null };
    const cut = shiftDay(next.effectiveFrom, -1);
    const ends = r.effectiveTo === null || cut < r.effectiveTo;
    // Several revisions can start on the day this one ends. The one in force
    // from that day is the highest-numbered of them: name that one.
    const successor = Math.max(
      ...revisions.filter((o) => o.offerId === r.offerId && o.effectiveFrom === next.effectiveFrom).map((o) => o.revision),
    );
    return { ...r, effectiveTo: ends ? cut : r.effectiveTo, replacedBy: ends ? successor : null };
  });
}

/** The revision in force on a date. Give it revisions that went through `withTimeline`. */
export function termsOn<T extends OfferTerms & { offerId: string }>(revisions: T[], offerId: string, date: string): T | null {
  return (
    revisions.find(
      (r) => r.offerId === offerId && r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo),
    ) ?? null
  );
}

/** True for one of the placements an ad can run in. */
export function isPlacement(value: string): boolean {
  return (PLACEMENTS as readonly string[]).includes(value);
}

/** True for a real calendar date inside the years this demo covers. */
export function isDemoDate(value: string): boolean {
  return isIsoDate(value) && value >= "2026-01-01" && value <= "2028-12-31";
}

export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** The one product this desk is set up to review. The others exist in the offer list as company context. */
export const SUPPORTED_PRODUCT = "Personal loan";

export const MAX_TITLE_CHARS = 80;
export const MAX_ADS_PER_WORKSPACE = 40;
export const MAX_VERSIONS_PER_AD = 20;
export const MAX_DECISIONS_PER_AD = 40;
export const MAX_MOVES_PER_AD = 30;
export const MAX_ADDED_REVISIONS = 12;

/** The date ranges an offer has terms for, with back-to-back revisions joined. */
export function coverage(revisions: Array<OfferTerms & { offerId: string }>, offerId: string): Array<{ from: string; to: string | null }> {
  const own = revisions
    // A revision replaced from its own start date is in force on no date.
    .filter((r) => r.offerId === offerId && (r.effectiveTo === null || r.effectiveTo >= r.effectiveFrom))
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  const out: Array<{ from: string; to: string | null }> = [];
  for (const r of own) {
    const last = out[out.length - 1];
    // Starts on or before the day after the last range ends: one unbroken range.
    if (last && last.to !== null && shiftDay(last.to, 1) >= r.effectiveFrom) last.to = r.effectiveTo;
    // Otherwise a gap, so a new range. Once a range is open-ended ("onward"),
    // it already covers everything after it and nothing more is added.
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

/** "Dec 1, 2026 to Dec 31, 2026", "Jan 1, 2027 onward", or null when the revision applies on no date. */
export function inForceText(r: OfferTerms): string | null {
  if (r.effectiveTo !== null && r.effectiveTo < r.effectiveFrom) return null;
  return r.effectiveTo ? `${formatDate(r.effectiveFrom)} to ${formatDate(r.effectiveTo)}` : `${formatDate(r.effectiveFrom)} onward`;
}

export type NewRevisionInput = {
  aprMin: number;
  aprMax: number;
  feePct: number;
  effectiveFrom: string;
};

const TWO_DECIMALS = /^\d{1,2}(?:\.\d{1,2})?$/;

/** Reads a percentage typed into the Offer sheet form: digits with up to two decimals, nothing else. */
export function parsePercent(raw: string): number | null {
  const t = raw.trim();
  return TWO_DECIMALS.test(t) ? Number(t) : null;
}

/**
 * The rule for a new offer revision, shared by the form and the server.
 * `inForce` is the revision the new one would replace on its start date, if any.
 * Returns the reason it is refused, or null.
 */
export function refuseRevision(input: NewRevisionInput, inForce: OfferTerms | null): string | null {
  const { aprMin, aprMax, feePct, effectiveFrom } = input;
  if (!isDemoDate(effectiveFrom)) {
    return "Enter an effective date between 2026 and 2028.";
  }
  if (![aprMin, aprMax, feePct].every((n) => Number.isFinite(n))) {
    return "Enter each rate and the fee as a number with up to two decimals, such as 9.49.";
  }
  if (aprMin <= 0 || aprMax <= 0) return "An APR must be above 0%.";
  if (aprMin > aprMax) return "The lowest APR cannot be above the highest APR.";
  if (feePct < 0) return "The origination fee cannot be below 0%.";
  if (inForce && inForce.aprMin === aprMin && inForce.aprMax === aprMax && inForce.feePct === feePct) {
    return `Those are the terms already in effect on ${formatDate(effectiveFrom)}. Change a term, or pick another date.`;
  }
  return null;
}

/** A revision's four terms as the screens show them. One list, so the offer sheet, the review screen and the comparison agree. */
export function termRows(terms: OfferTerms): Array<{ label: string; value: string }> {
  const pct = (n: number | null) => (n === null ? "Not stated" : percent(n));
  return [
    { label: "Lowest APR", value: pct(terms.aprMin) },
    { label: "Highest APR", value: pct(terms.aprMax) },
    { label: "Origination fee", value: pct(terms.feePct) },
    { label: "Loan terms", value: terms.termMinMonths === null ? "Not stated" : `${terms.termMinMonths} to ${terms.termMaxMonths} months` },
  ];
}

/** Two revisions' terms side by side, with the ones that differ marked. */
export function termChanges(before: OfferTerms, after: OfferTerms): Array<{ label: string; before: string; after: string; changed: boolean }> {
  const now = termRows(after);
  return termRows(before).map((row, i) => ({ label: row.label, before: row.value, after: now[i].value, changed: row.value !== now[i].value }));
}

/**
 * The approved ads an offer-change preview was worked out from, as one string.
 * The form posts it and the server works it out again under lock: if an ad
 * was approved, moved or sent back in between, the preview's list of affected
 * ads no longer holds and the save is refused.
 */
export function approvedKey(ads: Array<{ ref: string; plannedDate: string; placement: string }>): string {
  return ads
    .map((a) => `${a.ref}@${a.plannedDate}@${a.placement}`)
    .sort()
    .join(",");
}
