// Code-only checks on ad copy. No model is involved anywhere in this file.
//
// Decision-logic rounds: 3 (llm-first-decision-architecture.mdc section 6).
// Decision counted: whether a claim in ad copy "matches" the offer, "does not
// match", or "needs the reviewer".
//   Round 1, 2026-11-20: the approver's test of the submit form found a rate
//     written in words read as nothing to compare. Added: percentages written
//     out in words.
//   Round 2, 2026-11-20: an independent review found more forms read wrongly
//     or not at all (ranges, unusual digits and percent signs, "no-fee").
//     Stopped there. The approver chose the split the same day ("Yes, narrow
//     it"): exact forms in code, everything else held for the reviewer.
//   Round 3, 2026-11-20: that narrowing, below. It adds no accepted form.
//
// The only forms this file reads as a figure (the approved forms):
//   1. digits, an optional decimal part, at most one space, then "%",
//      "percent" or "per cent"                          ("8.99%", "2 percent")
//   2. the same written out in words          ("six point nine nine percent")
//   3. "no", "zero", "without", "$0" or "0", then an optional "origination",
//      "upfront", "lender" or "loan", then "fee" or "fees"  ("no origination fee")
// A figure is called a rate only when "APR", "annual percentage rate" or
// "rate" is in its sentence, and a fee only when "fee" or "origination" is.
// Everything else is held open as "needs the reviewer": any other number in a
// sentence about rates, fees or percentages, and any sentence that mentions a
// rate or a fee with no figure this file can read. Nothing is matched on a
// guess, and nothing is passed over silently. Do not add a form here without
// the approver's word.
//
// What code decides: explicit figures in the approved forms above, compared
// with the offer sheet. Looser wording ("single-digit rates", "we waive the
// fee") is shown to the reviewer as unread, and left to the AI claim finder
// and the reviewer to judge. A percentage this file cannot classify is still shown to
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
  /** Set when a whole sentence is held because it mentions a rate or a fee with nothing the check could read. */
  heldSentence?: true;
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
 * A lower-case copy of the text for matching: hidden characters removed,
 * compatibility forms folded (full-width "％" becomes "%"), every decimal digit made ASCII.
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
    // Compatibility forms first (full-width and mathematical digits become
    // plain digits), then any remaining decimal digit by its value, then lower
    // case. Lower-casing happens here so the map stays aligned even when a
    // letter lower-cases to two characters.
    for (const unit of ch.normalize("NFKC")) {
      const digit = digitValue(unit);
      const out = digit !== null ? String(digit) : unit.toLowerCase();
      for (let k = 0; k < out.length; k++) {
        norm += out[k];
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
// A figure is a rate only next to these words. "Interest" alone is not enough
// ("cut your interest costs by 30%" is not an APR): it is held for the reviewer.
const RATE_WORDS = /\b(?:aprs?|annual percentage rates?|rates?)\b/g;
const FEE_WORDS = /\b(?:origination|fees?)\b/g;
// Words that make a sentence one the reviewer should read when no figure in it was read.
const TOPIC_WORDS = /\b(?:aprs?|annual percentage rates?|rates?|interest|origination|fees?|percent|per cent)\b|[%\u066A\uFE6A]/g;
const ANY_NUMBER = /\d+(?:[.,]\d+)*/g;
// "No fee" about the loan itself. "No late fee" or "no prepayment fee" are
// different claims and are not matched here.
const NO_FEE =
  /(?:\b(?:no|zero|without(?: an| any)?)|\$\s?0|\b0)\s+(?:(?:origination|upfront|up-front|lender|loan)\s+)?fees?\b/g;

// A percentage written out in words: "six point nine nine percent",
// "twenty-one percent". An exact, well-defined form, so code reads it. Looser
// wording ("single-digit rates") is left to the AI claim finder and the reviewer.
const UNITS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const DIGIT_WORDS = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine"];
const WORD_PERCENT = new RegExp(
  `\\b((?:${TENS.join("|")})(?:[\\s-](?:${UNITS.slice(1, 10).join("|")}))?|${[...UNITS].reverse().join("|")})` +
    `(?:\\s+point((?:\\s+(?:${DIGIT_WORDS.join("|")}|oh))+))?\\s+(?:percent|per cent)\\b`,
  "g",
);

function wordsToNumber(whole: string, decimals: string | undefined): number {
  const parts = whole.split(/[\s-]+/);
  let value = 0;
  for (const part of parts) {
    const tens = TENS.indexOf(part);
    value += tens >= 0 ? (tens + 2) * 10 : UNITS.indexOf(part);
  }
  if (decimals) {
    const digits = decimals
      .trim()
      .split(/\s+/)
      .map((w) => (w === "oh" ? 0 : DIGIT_WORDS.indexOf(w)))
      .join("");
    value = Number(`${value}.${digits}`);
  }
  return value;
}

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
  const { norm: lower, map } = normalizeWithMap(text);
  const claims: Claim[] = [];
  const toOriginal = (s: number, e: number) => {
    let start = map[s];
    let end = map[e];
    // If the words at that position do not normalize back to what was matched,
    // the position cannot be trusted: quote the whole sentence instead.
    if (normalizeWithMap(text.slice(start, end)).norm !== lower.slice(s, e)) {
      const [ss, se] = sentenceBounds(lower, s);
      start = map[ss];
      end = map[se];
    }
    return { start, end, quote: text.slice(start, end) };
  };

  /** Spans already read as a claim, and where each figure sits in the normalized text. */
  const read: Array<[number, number]> = [];
  const figureSpans = new Map<Claim, [number, number]>();
  NO_FEE.lastIndex = 0;
  const noFeeSpans: Array<[number, number]> = [];
  for (let m = NO_FEE.exec(lower); m; m = NO_FEE.exec(lower)) {
    noFeeSpans.push([m.index, m.index + m[0].length]);
    read.push([m.index, m.index + m[0].length]);
    claims.push({ kind: "no_fee", value: 0, ...toOriginal(m.index, m.index + m[0].length) });
  }

  // Percentages in digits, then percentages written out in words.
  const numbers: Array<{ s: number; e: number; value: number }> = [];
  PERCENT.lastIndex = 0;
  for (let m = PERCENT.exec(lower); m; m = PERCENT.exec(lower)) {
    numbers.push({ s: m.index, e: m.index + m[0].length, value: Number(m[1].replace(",", ".")) });
  }
  WORD_PERCENT.lastIndex = 0;
  for (let m = WORD_PERCENT.exec(lower); m; m = WORD_PERCENT.exec(lower)) {
    numbers.push({ s: m.index, e: m.index + m[0].length, value: wordsToNumber(m[1], m[2]) });
  }

  for (const n of numbers) {
    const s = n.s;
    let e = n.e;
    if (noFeeSpans.some(([a, b]) => s >= a && s < b)) continue;
    const value = n.value;
    const [ss, se] = sentenceBounds(lower, s);
    const sentence = lower.slice(ss, se);
    const rate = nearest(RATE_WORDS, sentence, s - ss);
    const fee = nearest(FEE_WORDS, sentence, s - ss);
    let kind: ClaimKind = "unclassified";
    if (rate !== Infinity || fee !== Infinity) kind = fee < rate ? "fee" : "apr";
    // Include a directly following "APR" in the quoted words.
    const tail = /^\s?apr\b/.exec(lower.slice(e));
    if (kind === "apr" && tail) e += tail[0].length;
    const claim: Claim = { kind, value, ...toOriginal(s, e) };
    claims.push(claim);
    figureSpans.set(claim, [n.s, e]);
    read.push([s, e]);
  }

  // Held for the reviewer, never matched and never dropped:
  // (a) any other number in a sentence about rates, fees or percentages. If it
  //     is joined to a figure that was read ("5.99-35.99%", "5.99 to 35.99%"),
  //     the whole expression is held, and the figure that was read is no
  //     longer reported by itself: only half of the claim was understood.
  const inRead = (s: number, e: number) => read.some(([a, b]) => s < b && a < e);
  const JOIN = /^\s*(?:-|\u2013|\u2014|to|and|\/)?\s*$/;
  ANY_NUMBER.lastIndex = 0;
  for (let m = ANY_NUMBER.exec(lower); m; m = ANY_NUMBER.exec(lower)) {
    let s = m.index;
    let e = s + m[0].length;
    if (inRead(s, e)) continue;
    const [ss, se] = sentenceBounds(lower, s);
    TOPIC_WORDS.lastIndex = 0;
    if (!TOPIC_WORDS.test(lower.slice(ss, se))) continue;
    const sign = /^\s{0,2}[%\u066A\uFE6A]/.exec(lower.slice(e));
    if (sign) e += sign[0].length;
    for (let i = claims.length - 1; i >= 0; i--) {
      const c = claims[i];
      if (c.kind === "no_fee" || c.value === null) continue;
      const span = figureSpans.get(c);
      if (!span) continue;
      const joinedAfter = span[0] >= e && span[0] - e <= 5 && JOIN.test(lower.slice(e, span[0]));
      const joinedBefore = s >= span[1] && s - span[1] <= 5 && JOIN.test(lower.slice(span[1], s));
      if (joinedAfter || joinedBefore) {
        s = Math.min(s, span[0]);
        e = Math.max(e, span[1]);
        claims.splice(i, 1);
      }
    }
    claims.push({ kind: "unclassified", value: null, ...toOriginal(s, e) });
    read.push([s, e]);
  }
  // (b) any sentence that mentions a rate, or a fee, and holds nothing that
  //     speaks to it ("no-fee loans", "rates as low as single digits").
  const spansOf = (kinds: ClaimKind[]) =>
    claims.filter((c) => kinds.includes(c.kind)).map((c) => [c.start, c.end] as const);
  const topics: Array<[RegExp, ClaimKind[]]> = [
    [/\b(?:aprs?|annual percentage rates?|rates?|interest)\b/, ["apr", "unclassified"]],
    [/\b(?:origination|fees?)\b/, ["fee", "no_fee", "unclassified"]],
  ];
  let from = 0;
  while (from < lower.length) {
    const [ss, se] = sentenceBounds(lower, from);
    const sentence = lower.slice(ss, se);
    for (const [words, kinds] of topics) {
      const m = words.exec(sentence);
      if (!m) continue;
      const covered = spansOf(kinds).some(([a, b]) => a < map[se] && map[ss] < b);
      // Quote the whole sentence: it is the sentence, not one word, that needs reading.
      if (!covered) {
        const lead = sentence.length - sentence.trimStart().length;
        const held: Claim = { kind: "unclassified", value: null, heldSentence: true, ...toOriginal(ss + lead, se) };
        if (!claims.some((c) => c.start === held.start && c.end === held.end)) claims.push(held);
      }
    }
    from = Math.max(se + 1, from + 1);
  }

  return claims.sort((a, b) => a.start - b.start);
}

/** The claim's own words with the number replaced, or a plain figure when the number was written in words. */
function withNumber(claim: Claim, value: string): string {
  if (/\d/.test(claim.quote)) return claim.quote.replace(/\d{1,3}(?:[.,]\d{1,3})?/, value);
  return /apr\s*$/i.test(claim.quote) ? `${value}% APR` : `${value}%`;
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
        suggestion: withNumber(claim, terms.aprMin.toFixed(2)),
      };
    }
    if (claim.value > terms.aprMax) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says ${pct(claim.value)} APR. The highest APR on the ${terms.campaign} offer ${since} is ${pct(terms.aprMax)}.`,
        offerValue: pct(terms.aprMax),
        suggestion: withNumber(claim, terms.aprMax.toFixed(2)),
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
        suggestion: withNumber(claim, String(terms.feePct)),
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
    message: claim.heldSentence
      ? `"${claim.quote}" mentions a rate or a fee that the automatic check could not compare with the offer. Please read it.`
      : `The ad states "${claim.quote}" and the automatic check could not read it as a rate or a fee to compare. Please read it.`,
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

/**
 * "Matches" is only said of a figure written plainly. If its characters are
 * unusual (other digit forms, hidden characters inside it), the reading may be
 * right but the reviewer should see it, so a match becomes "needs the reviewer".
 * A mismatch stays a mismatch.
 */
function holdUnusualForms(check: Check): Check {
  if (check.status !== "ok" || /^[\x20-\x7E]*$/.test(check.claim.quote)) return check;
  return {
    ...check,
    status: "needs_reviewer",
    message: `The ad states "${check.claim.quote}" using unusual characters. Read as plain text it matches the offer, but please read it yourself.`,
    suggestion: null,
  };
}

export function analyzeCopy(text: string, terms: OfferTerms): CopyAnalysis {
  const claims = findClaims(text);
  const checks = claims.map((c) => holdUnusualForms(checkClaim(c, terms)));
  const hidden = findHiddenText(text);
  const mismatches = checks.filter((c) => c.status === "mismatch").length;
  const needsReviewer = checks.filter((c) => c.status === "needs_reviewer").length;
  return { claims, checks, hidden, mismatches, openFlags: mismatches + needsReviewer + hidden.length };
}

export const MAX_COPY_CHARS = 2000;
export const MAX_NOTE_CHARS = 500;
export const MAX_COMMENT_CHARS = 1000;
