// Code-only checks on ad copy. No model is involved anywhere in this file.
//
// What code decides: explicit numbers (an APR, a fee percentage, "no
// origination fee") compared with the offer sheet. Varied wording ("six point
// nine nine percent", "rock-bottom rates") is left to the AI claim finder and
// to the reviewer. A percentage this file cannot classify is still shown to
// the reviewer, so an explicit number never disappears silently.

export type OfferTerms = {
  revisionId: string;
  campaign: string;
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo: string | null;
  aprMin: number | null;
  aprMax: number | null;
  feePct: number | null;
  termMinMonths: number | null;
  termMaxMonths: number | null;
  source: string;
};

export type ClaimKind = "apr" | "fee" | "no_fee" | "unclassified";

export type Claim = {
  kind: ClaimKind;
  value: number | null;
  /** The exact words in the submitted copy. */
  quote: string;
  /** Offsets into the submitted copy. */
  start: number;
  end: number;
};

export type CheckStatus = "ok" | "mismatch" | "needs_reviewer";

export type Check = {
  claim: Claim;
  status: CheckStatus;
  message: string;
  /** The value on the offer sheet the claim was compared with, as text. */
  offerValue: string | null;
  /** A replacement the marketer could use, when one is obvious. */
  suggestion: string | null;
};

export type HiddenTextFinding = {
  kind: "invisible" | "direction" | "tag" | "mixed_script" | "foreign_digit";
  count: number;
  label: string;
};

// Characters a reader cannot see but a model, or a pattern, still reads.
const INVISIBLE =
  /[­͏؜ᅟᅠ឴឵᠋-᠎​-‏⁠-⁤⁪-⁯ㅤ︀-️﻿ﾠ]/u;
const DIRECTION = /[‪-‮⁦-⁩]/u;
const TAG = /[\u{E0000}-\u{E007F}]/u;
const NON_LATIN_LETTER = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const DECIMAL_DIGIT = /\p{Nd}/u;

function isHidden(ch: string): boolean {
  return INVISIBLE.test(ch) || DIRECTION.test(ch) || TAG.test(ch);
}

/** The numeric value of any Unicode decimal digit, or null. */
function digitValue(ch: string): number | null {
  if (ch >= "0" && ch <= "9") return ch.charCodeAt(0) - 48;
  if (!DECIMAL_DIGIT.test(ch)) return null;
  // Unicode decimal digits come in runs of ten in order, zero first.
  const cp = ch.codePointAt(0)!;
  let value = 0;
  while (value < 9 && DECIMAL_DIGIT.test(String.fromCodePoint(cp - value - 1))) {
    value++;
  }
  return value;
}

/**
 * A copy of the text for matching: hidden characters removed, compatibility
 * forms folded (full-width "％" becomes "%"), every decimal digit made ASCII.
 * `map[i]` is the offset in the original text of normalized character i, and
 * the last entry is the original length, so spans can be mapped back.
 */
export function normalizeWithMap(text: string): { norm: string; map: number[] } {
  let norm = "";
  const map: number[] = [];
  let i = 0;
  for (const ch of text) {
    const at = i;
    i += ch.length;
    if (isHidden(ch)) continue;
    const digit = digitValue(ch);
    const folded = digit !== null ? String(digit) : ch.normalize("NFKC");
    for (const unit of folded) {
      for (let k = 0; k < unit.length; k++) {
        norm += unit[k];
        map.push(at);
      }
    }
  }
  map.push(text.length);
  return { norm, map };
}

export function findHiddenText(text: string): HiddenTextFinding[] {
  let invisible = 0;
  let direction = 0;
  let tag = 0;
  let nonLatin = 0;
  let latin = 0;
  let foreignDigit = 0;
  for (const ch of text) {
    if (TAG.test(ch)) tag++;
    else if (DIRECTION.test(ch)) direction++;
    else if (INVISIBLE.test(ch)) invisible++;
    else if (NON_LATIN_LETTER.test(ch)) nonLatin++;
    else if (LATIN_LETTER.test(ch)) latin++;
    else if (DECIMAL_DIGIT.test(ch) && !(ch >= "0" && ch <= "9")) foreignDigit++;
  }
  const out: HiddenTextFinding[] = [];
  if (invisible > 0) {
    out.push({
      kind: "invisible",
      count: invisible,
      label: `${invisible} invisible character${invisible === 1 ? "" : "s"} in the copy`,
    });
  }
  if (direction > 0) {
    out.push({
      kind: "direction",
      count: direction,
      label: `${direction} text-direction control${direction === 1 ? "" : "s"} that can reorder what is displayed`,
    });
  }
  if (tag > 0) {
    out.push({
      kind: "tag",
      count: tag,
      label: `${tag} hidden tag character${tag === 1 ? "" : "s"} that can carry unseen text`,
    });
  }
  // A few look-alike letters inside mostly Latin copy, such as a Cyrillic "A"
  // in "APR", can make a word unreadable to a pattern while it looks normal.
  if (nonLatin > 0 && latin > nonLatin) {
    out.push({
      kind: "mixed_script",
      count: nonLatin,
      label: `${nonLatin} look-alike letter${nonLatin === 1 ? "" : "s"} from another alphabet mixed into the copy`,
    });
  }
  if (foreignDigit > 0) {
    out.push({
      kind: "foreign_digit",
      count: foreignDigit,
      label: `${foreignDigit} digit${foreignDigit === 1 ? "" : "s"} written in a non-standard form`,
    });
  }
  return out;
}

const PERCENT = /(\d{1,3}(?:[.,]\d{1,3})?)\s?(?:%|percent\b|per cent\b)/g;
const RATE_WORDS = /\b(?:aprs?|annual percentage rates?|rates?|interest)\b/g;
const FEE_WORDS = /\b(?:origination|fees?)\b/g;
// "No fee" about the loan itself. "No late fee" or "no prepayment fee" are
// different claims and are not matched here.
const NO_FEE =
  /(?:\b(?:no|zero|without(?: an| any)?)|\$\s?0|\b0)\s+(?:(?:origination|upfront|up-front|lender|loan)\s+)?fees?\b/g;

function sentenceBounds(norm: string, at: number): [number, number] {
  const isBreak = (i: number) =>
    norm[i] === "\n" ||
    ((norm[i] === "." || norm[i] === "!" || norm[i] === "?") &&
      (i + 1 >= norm.length || /\s/.test(norm[i + 1])));
  let start = at;
  while (start > 0 && !isBreak(start - 1)) start--;
  let end = at;
  while (end < norm.length && !isBreak(end)) end++;
  return [start, end];
}

function nearest(re: RegExp, sentence: string, at: number): number {
  let best = Infinity;
  re.lastIndex = 0;
  for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
    const distance = Math.min(Math.abs(m.index - at), Math.abs(m.index + m[0].length - at));
    if (distance < best) best = distance;
  }
  return best;
}

export function findClaims(text: string): Claim[] {
  const { norm, map } = normalizeWithMap(text);
  const lower = norm.toLowerCase();
  const claims: Claim[] = [];
  const toOriginal = (s: number, e: number) => {
    const start = map[s];
    const end = map[e];
    return { start, end, quote: text.slice(start, end) };
  };

  NO_FEE.lastIndex = 0;
  const noFeeSpans: Array<[number, number]> = [];
  for (let m = NO_FEE.exec(lower); m; m = NO_FEE.exec(lower)) {
    noFeeSpans.push([m.index, m.index + m[0].length]);
    claims.push({ kind: "no_fee", value: 0, ...toOriginal(m.index, m.index + m[0].length) });
  }

  PERCENT.lastIndex = 0;
  for (let m = PERCENT.exec(lower); m; m = PERCENT.exec(lower)) {
    const s = m.index;
    let e = s + m[0].length;
    if (noFeeSpans.some(([a, b]) => s >= a && s < b)) continue;
    const value = Number(m[1].replace(",", "."));
    const [ss, se] = sentenceBounds(lower, s);
    const sentence = lower.slice(ss, se);
    const rate = nearest(RATE_WORDS, sentence, s - ss);
    const fee = nearest(FEE_WORDS, sentence, s - ss);
    let kind: ClaimKind = "unclassified";
    if (rate !== Infinity || fee !== Infinity) kind = fee < rate ? "fee" : "apr";
    // Include a directly following "APR" in the quoted words.
    const tail = /^\s?apr\b/.exec(lower.slice(e));
    if (kind === "apr" && tail) e += tail[0].length;
    claims.push({ kind, value, ...toOriginal(s, e) });
  }

  return claims.sort((a, b) => a.start - b.start);
}

function pct(n: number): string {
  return `${n.toFixed(2)}%`;
}

function longDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${months[m - 1]} ${d}, ${y}`;
}

export function checkClaim(claim: Claim, terms: OfferTerms): Check {
  const since = `from ${longDate(terms.effectiveFrom)}`;
  if (claim.kind === "apr" && claim.value !== null) {
    if (terms.aprMin === null || terms.aprMax === null) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states ${pct(claim.value)}. The ${terms.campaign} offer sheet lists no APR range to compare it with.`,
        offerValue: null,
        suggestion: null,
      };
    }
    if (claim.value < terms.aprMin) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says ${pct(claim.value)} APR. The lowest APR on the ${terms.campaign} offer ${since} is ${pct(terms.aprMin)}.`,
        offerValue: pct(terms.aprMin),
        suggestion: claim.quote.replace(/\d{1,3}(?:[.,]\d{1,3})?/, terms.aprMin.toFixed(2)),
      };
    }
    if (claim.value > terms.aprMax) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says ${pct(claim.value)} APR. The highest APR on the ${terms.campaign} offer ${since} is ${pct(terms.aprMax)}.`,
        offerValue: pct(terms.aprMax),
        suggestion: claim.quote.replace(/\d{1,3}(?:[.,]\d{1,3})?/, terms.aprMax.toFixed(2)),
      };
    }
    return {
      claim,
      status: "ok",
      message: `${pct(claim.value)} APR is within the offer's range of ${pct(terms.aprMin)} to ${pct(terms.aprMax)}.`,
      offerValue: `${pct(terms.aprMin)} to ${pct(terms.aprMax)}`,
      suggestion: null,
    };
  }
  if (claim.kind === "fee" && claim.value !== null) {
    if (terms.feePct === null) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states a ${pct(claim.value)} fee. The ${terms.campaign} offer sheet lists no origination fee to compare it with.`,
        offerValue: null,
        suggestion: null,
      };
    }
    if (claim.value !== terms.feePct) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says a ${pct(claim.value)} fee. The ${terms.campaign} offer ${since} lists a ${pct(terms.feePct)} origination fee.`,
        offerValue: pct(terms.feePct),
        suggestion: claim.quote.replace(/\d{1,3}(?:[.,]\d{1,3})?/, String(terms.feePct)),
      };
    }
    return {
      claim,
      status: "ok",
      message: `A ${pct(claim.value)} fee matches the offer's origination fee.`,
      offerValue: pct(terms.feePct),
      suggestion: null,
    };
  }
  if (claim.kind === "no_fee") {
    if (terms.feePct !== null && terms.feePct > 0) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says "${claim.quote}". The ${terms.campaign} offer ${since} lists a ${pct(terms.feePct)} origination fee.`,
        offerValue: pct(terms.feePct),
        suggestion: `A ${String(terms.feePct)}% origination fee applies`,
      };
    }
    return {
      claim,
      status: terms.feePct === 0 ? "ok" : "needs_reviewer",
      message:
        terms.feePct === 0
          ? "The offer sheet lists no origination fee."
          : `The ${terms.campaign} offer sheet does not state an origination fee, so "${claim.quote}" cannot be confirmed from it.`,
      offerValue: terms.feePct === 0 ? "0%" : null,
      suggestion: null,
    };
  }
  return {
    claim,
    status: "needs_reviewer",
    message: `The ad states ${claim.quote} and the automatic check could not tell what it refers to. Please read it.`,
    offerValue: null,
    suggestion: null,
  };
}

export type CopyAnalysis = {
  claims: Claim[];
  checks: Check[];
  hidden: HiddenTextFinding[];
  mismatches: number;
  /** Mismatches plus hidden-text findings plus unclassified numbers. */
  openFlags: number;
};

export function analyzeCopy(text: string, terms: OfferTerms): CopyAnalysis {
  const claims = findClaims(text);
  const checks = claims.map((c) => checkClaim(c, terms));
  const hidden = findHiddenText(text);
  const mismatches = checks.filter((c) => c.status === "mismatch").length;
  const needsReviewer = checks.filter((c) => c.status === "needs_reviewer").length;
  return { claims, checks, hidden, mismatches, openFlags: mismatches + needsReviewer + hidden.length };
}

export const MAX_COPY_CHARS = 2000;
export const MAX_NOTE_CHARS = 500;
export const MAX_COMMENT_CHARS = 1000;
