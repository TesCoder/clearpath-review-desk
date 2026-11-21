// Code-only checks on ad copy. No model is involved anywhere in this file.
//
// What this file decides: whether a claim in ad copy "matches" the offer,
// "does not match", or "needs the reviewer".
//
// It has been corrected nine times, each time after a test or a review found
// a misread. After the second, the approach changed: instead of teaching the
// code more wording, it reads a short list of exact forms and holds
// everything else open for a person. Rounds 3 to 9 each made it say less.
//   1. A manual test of the submit form: a rate written in words was read as
//      nothing to compare. Added percentages written out in words.
//   2. An independent review: ranges, unusual digits and percent signs, and
//      "no-fee" were read wrongly or not at all. This is where the approach
//      changed to exact forms in code, everything else held for the reviewer.
//   3. That narrowing. It adds no form.
//   4. A review found "0% prepayment fee" compared with the origination fee
//      and offered "Change to: 2%". Now a fee figure is compared only when
//      the ad names the origination fee.
//   5. A review found "The maximum APR is 6.99%" given the edit "8.99%" and
//      then shown with no flags, and an interest rate edited as if it were
//      the APR. Now an edit is suggested only when the ad states the figure
//      as its lowest rate; a stated maximum or minimum that differs from the
//      offer's is flagged or held, never matched; and in a sentence about
//      interest only "<figure> APR" is an APR.
//   6. Two reviews found green results on wrong claims: ".12%" read as 12%,
//      "from 8.99% to 15.99% APR" passed because 15.99% is inside the range,
//      and "No fees for late payments" given an edit that wrote a false
//      sentence. The rule became simpler instead of longer. A rate is a
//      match only when it EQUALS the offer's lowest or highest APR; any
//      other rate inside the range is held. A figure is read only as a whole
//      number. A fee is a match, and an edit is offered, only when the
//      sentence says nothing more about it.
//   7. A review found three more green results: "Only returning borrowers
//      pay a 2% origination fee", "Our APR never exceeds 8.99%" and "APR is
//      at least 35.99%". Each passed because the code looked for wording
//      that rules a match OUT, and that list can never be complete. Now a
//      match needs wording that rules it IN: a rate is a match only when the
//      ad states it as its lowest rate ("from 8.99% APR"), as its highest
//      ("up to 35.99% APR"), or as the two ends of a range ("8.99% to
//      35.99%"), with no "no", "not" or "never" before it; and a fee is a
//      match only when its whole sentence is one of a few plain forms. This
//      round uses the lists the file already had and adds none.
//   8. Two more reviews found green results where the sentence went on after
//      the figure ("Rates from 8.99% APR for the first six months", "Rates
//      from 6.99% APR are unavailable"), where the claim was split over two
//      lines ("No fees" / "for late payments"), in a question, and on "-8.99%"
//      and "8,990%". This round is about the shape of a sentence, not its
//      words: a rate is a match, and an edit is offered, only when nothing
//      follows the figure in its sentence; a question is never a match; a
//      line break ends a sentence only after end punctuation or before a
//      blank line; a figure with a minus sign or a comma is held. The one
//      wording change is that "n't" and "cannot" count as "not".
//   9. A last sweep found the same two shapes from the other side: a
//      condition BEFORE the figure ("If you have an 800 credit score, rates
//      start at 8.99% APR"), and a line that ends in a colon or semicolon
//      with the condition on the next line ("A 2% origination fee applies:" /
//      "Unless waived for autopay borrowers"). Now a comma before the figure
//      in its sentence holds it (a clause came first), and only a full stop,
//      "!" or "?" ends a sentence at a line break. No word was added.
//
// What this file still cannot do, by design: it reads one sentence at a time,
// and of the words before a figure it reads only "no", "not", "never" and a
// comma. A condition in the NEXT sentence ("A 2% origination fee applies.
// Only on your second loan."), a denial with no "not" in it ("Nobody pays
// rates from 8.99% APR") and a qualifier before the figure ("Rates after the
// introductory period are from 8.99% APR") still show the figure as a match.
// No list of words closes that. The README says so, and the reviewer and the
// AI read the sentence.
//
// The only forms this file reads as a figure (the approved forms):
//   1. digits, an optional decimal part, at most one space, then "%",
//      "percent" or "per cent"                          ("8.99%", "2 percent")
//   2. the same written out in words          ("six point nine nine percent")
//   3. "no", "zero", "without", "$0" or "0", then an optional "origination",
//      "upfront", "lender" or "loan", then "fee" or "fees"  ("no origination fee")
// A figure is called a rate only when "APR", "annual percentage rate" or
// "rate" is in its sentence. A figure is compared as the origination fee only
// when it reads "<figure> origination fee" or "origination fee of <figure>".
// Everything else is held open as "needs the reviewer": any other number in a
// sentence about rates, fees or percentages, and any sentence that mentions a
// rate or a fee with no figure this file can read. Nothing is matched on a
// guess, and nothing is passed over silently. Adding a form here is a product
// decision, not a bug fix: each form that was added loosely became a wrong match.
//
// What code decides: explicit figures in the approved forms above, compared
// with the offer sheet. Looser wording ("single-digit rates", "we waive the
// fee") is shown to the reviewer as unread, and left to the AI claim finder
// and the reviewer to judge. A percentage this file cannot classify is still shown to
// the reviewer, so an explicit number never disappears silently.

import { formatDate, percent } from "./format";

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
  /**
   * For a fee or a "no fee" claim: its sentence says nothing more about the
   * fee than the claim itself ("A 2% origination fee applies.", "No
   * origination fee."). Only then is a fee called a match or an edit offered.
   * "No fees for late payments" and "The 2% origination fee is waived" are
   * not plain: the rest of the sentence changes what the figure means.
   */
  plain?: true;
  /** The figure directly follows "from", "as low as", "starting at" and the like: the ad states it as its lowest rate. */
  statesMinimum?: true;
  /** A word just before the figure says which end of the range it is. */
  endpoint?: "maximum" | "minimum";
  /** The figure is one end of a range written as two rates joined by "to" or a dash ("8.99% to 35.99%"). */
  rangeEnd?: "low" | "high";
  /** "No", "not", "never" or "without" comes before the figure in its sentence ("APR is never as low as 8.99%"). */
  negated?: true;
  /** Words follow the figure in its sentence ("... APR for the first six months", "... APR are unavailable"). */
  followed?: true;
  /** The figure's sentence is a question. */
  question?: true;
  /** A comma comes before the figure in its sentence: a clause came first ("If you qualify, rates from 8.99% APR"). */
  afterClause?: true;
};

export type CheckStatus = "ok" | "mismatch" | "needs_reviewer";

export type Check = {
  claim: Claim;
  status: CheckStatus;
  message: string;
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
// The list above names the ones seen in practice. A list cannot be complete, so
// hidden characters are also recognized by what Unicode says they are: ones a
// renderer ignores by default (variation selectors among them), control and
// format characters, private-use and unassigned code points, and the line and
// paragraph separators. Line breaks and tabs are ordinary text.
const HIDDEN_BY_KIND = /[\p{Default_Ignorable_Code_Point}\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]/u;
const ORDINARY_CONTROL = /[\n\r\t]/;
const isInvisible = (ch: string) => INVISIBLE.test(ch) || (HIDDEN_BY_KIND.test(ch) && !ORDINARY_CONTROL.test(ch));
const DIRECTION = /[‪-‮⁦-⁩]/u;
const TAG = /[\u{E0000}-\u{E007F}]/u;
const NON_LATIN_LETTER = /[\p{Script=Cyrillic}\p{Script=Greek}]/u;
const LATIN_LETTER = /\p{Script=Latin}/u;
const DECIMAL_DIGIT = /\p{Nd}/u;

function isHidden(ch: string): boolean {
  return isInvisible(ch) || DIRECTION.test(ch) || TAG.test(ch);
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
    else if (isInvisible(ch)) invisible++;
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

// A figure is read only as a whole number: nothing numeric may sit directly
// before it. ".12%" is not 12%, and the "012.99%" inside "1012.99%" is not
// 12.99%. A number that fails this is not dropped: it is held below.
// A figure is written with a decimal point. One written with a comma ("8,99%",
// "8,990%") is not read: it is held below with every other number.
const PERCENT = /(?<![\d.,])(\d{1,3}(?:\.\d{1,3})?)\s?(?:%|percent\b|per cent\b)/g;
// A minus sign directly before a figure ("-8.99%"), as opposed to the dash of
// a range ("8.99%-35.99%", "5.99-35.99%"). A signed figure is held, not read.
const MINUS_BEFORE = /(?:^|[^\d%a-z])[-\u2212\u2013]$/;
// A figure is a rate only next to these words. "Interest" alone is not enough
// ("cut your interest costs by 30%" is not an APR): it is held for the reviewer.
const RATE_WORDS = /\b(?:aprs?|annual percentage rates?|rates?)\b/g;
const FEE_WORDS = /\b(?:origination|fees?)\b/g;
// Words that make a sentence one the reviewer should read when no figure in it was read.
const TOPIC_WORDS = /\b(?:aprs?|annual percentage rates?|rates?|interest|origination|fees?|percent|per cent)\b|[%\u066A\uFE6A]/g;
const ANY_NUMBER = /(?:(?<![\d.,])[.,](?=\d))?\d+(?:[.,]\d+)*/g;
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
// The units are listed longest first ("nineteen" before "nine"), so the
// pattern never stops at a shorter word that begins a longer one.
const WORD_PERCENT = new RegExp(
  `\\b((?:${TENS.join("|")})(?:[\\s-](?:${UNITS.slice(1, 10).join("|")}))?|${[...UNITS].reverse().join("|")})` +
    `(?:\\s+point((?:\\s+(?:${DIGIT_WORDS.join("|")}|oh))+))?\\s+(?:percent|per cent)\\b`,
  "g",
);

// Words that make a written-out number part of a larger one: "one hundred
// twelve percent" is not twelve percent.
const LARGER_NUMBER_BEFORE = new RegExp(
  `\\b(?:hundred|thousand|million|point|${[...UNITS, ...TENS].join("|")})(?:\\s+and)?[\\s-]+$`,
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
  // A line break ends a sentence only after a full stop, "!" or "?", or next
  // to a blank line. "No fees" on one line and "for late payments" on the next
  // is one sentence: read as two, the first looked like a plain claim. A colon
  // or semicolon does not end one: what follows it belongs to the same claim.
  const lineEnds = (i: number) => {
    let next = i + 1;
    while (next < norm.length && (norm[next] === " " || norm[next] === "\t" || norm[next] === "\r")) next++;
    if (next >= norm.length || norm[next] === "\n") return true;
    let prev = i - 1;
    while (prev >= 0 && /\s/.test(norm[prev])) {
      if (norm[prev] === "\n") return true;
      prev--;
    }
    return prev < 0 || /[.!?]/.test(norm[prev]);
  };
  const isBreak = (i: number) =>
    norm[i] === "\n"
      ? lineEnds(i)
      : (norm[i] === "." || norm[i] === "!" || norm[i] === "?") && (i + 1 >= norm.length || /\s/.test(norm[i + 1]));
  let start = at;
  while (start > 0 && !isBreak(start - 1)) start--;
  let end = at;
  while (end < norm.length && !isBreak(end)) end++;
  return [start, end];
}

/**
 * How many characters lie between a figure and the closest match of a word
 * pattern in its sentence, or Infinity when the sentence has none. `re` is a
 * shared global pattern, so its position is reset before the search.
 */
function nearest(re: RegExp, sentence: string, at: number): number {
  let best = Infinity;
  re.lastIndex = 0;
  for (let m = re.exec(sentence); m; m = re.exec(sentence)) {
    const distance = Math.min(Math.abs(m.index - at), Math.abs(m.index + m[0].length - at));
    if (distance < best) best = distance;
  }
  return best;
}

/** True for "<figure> origination fee" and "origination fee of <figure>". */
function namesOriginationFee(lower: string, s: number, e: number): boolean {
  return /^\s+origination\s+fees?\b/.test(lower.slice(e)) || /\borigination\s+fees?\s+(?:(?:of|is|at)\s+)?$/.test(lower.slice(0, s));
}

/** A sentence or phrase without its outer spaces and closing punctuation. */
const bare = (t: string) => t.trim().replace(/[.!?,;:]+$/, "").trim();

/** Words that turn a statement around. One list, used for fees and for rates. */
const NEGATION = /\b(?:no|not|never|without|cannot|\w+n['\u2019]t|waive[sd]?|waiving)\b/;

/** The only words a sentence may put before a plain statement of the fee. */
const FEE_LEADS = ["", "a", "an", "the", "just a", "only a", "there is a", "there is an", "with a", "with an"];

/**
 * True when a whole sentence states the origination fee and nothing else.
 * After the fee phrase there may be nothing, or one of two plain endings
 * ("applies", "is charged"). Before it there may be nothing, or one of the
 * few lead-ins listed above. A question is not a statement.
 * Anything else ("... applies for late payments", "... is waived for new
 * customers", "no 2% origination fee", "Only returning borrowers pay a 2%
 * origination fee") is not read as a plain statement of the fee: the rest of
 * the sentence can change who pays it or when.
 */
function saysOnlyTheFee(sentence: string, s: number, e: number): boolean {
  const after = /^\s+origination\s+fees?\b/.exec(sentence.slice(e));
  const tail = bare(sentence.slice(after ? e + after[0].length : e));
  if (!["", "applies", "is charged"].includes(tail)) return false;
  const before = sentence.slice(0, s).trim();
  // "origination fee of <figure>": the lead-in is what comes before those words.
  const named = /(?:^|\s)origination\s+fees?(?:\s+(?:of|is|at))?$/.exec(before);
  return FEE_LEADS.includes((named ? before.slice(0, named.index) : before).trim());
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
    const noFee: Claim = { kind: "no_fee", value: 0, ...toOriginal(m.index, m.index + m[0].length) };
    const [ss, se] = sentenceBounds(lower, m.index);
    if (bare(lower.slice(ss, se)) === bare(m[0]) && lower[se] !== "?") noFee.plain = true;
    claims.push(noFee);
  }

  // Percentages in digits, then percentages written out in words.
  const numbers: Array<{ s: number; e: number; value: number }> = [];
  PERCENT.lastIndex = 0;
  for (let m = PERCENT.exec(lower); m; m = PERCENT.exec(lower)) {
    if (MINUS_BEFORE.test(lower.slice(Math.max(0, m.index - 2), m.index))) continue;
    numbers.push({ s: m.index, e: m.index + m[0].length, value: Number(m[1]) });
  }
  WORD_PERCENT.lastIndex = 0;
  for (let m = WORD_PERCENT.exec(lower); m; m = WORD_PERCENT.exec(lower)) {
    // Part of a larger written-out number: not read. Its sentence is held below.
    if (LARGER_NUMBER_BEFORE.test(lower.slice(0, m.index))) continue;
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
    // The closer word decides. On a tie the figure is read as a rate: a wrong
    // rate is the costlier miss, and a rate out of range is always flagged.
    if (rate !== Infinity || fee !== Infinity) kind = fee < rate ? "fee" : "apr";
    // The offer sheet states one fee, the origination fee. A fee figure is
    // compared with it only when the ad plainly names that fee. A prepayment,
    // late or unnamed fee is held for the reviewer, with no suggested edit:
    // "changing 0% to 2%" on a prepayment fee would write a false claim.
    if (kind === "fee" && !namesOriginationFee(lower, n.s, n.e)) kind = "unclassified";
    // Include a directly following "APR" in the quoted words.
    const tail = /^\s?apr\b/.exec(lower.slice(e));
    // "Interest rate 6.99%, APR 8.99%": the offer sheet has no separate
    // interest rate. In a sentence about interest, a figure is called an APR
    // only when "APR" directly follows it. Otherwise it is held.
    if (kind === "apr" && !tail && /\binterest\b/.test(sentence)) kind = "unclassified";
    if (kind === "apr" && tail) e += tail[0].length;
    const claim: Claim = { kind, value, ...toOriginal(s, e) };
    if (kind === "fee" && lower[se] !== "?" && saysOnlyTheFee(sentence, n.s - ss, n.e - ss)) claim.plain = true;
    if (kind === "apr") {
      // What the words just before the figure say it is. Used only to hold a
      // figure back or to withhold a suggested edit, never to call a match.
      const lead = lower.slice(Math.max(0, n.s - 30), n.s);
      if (/(?:\bfrom|\bas low as|\bstarting at|\bstarting from|\bstart at|\bstarts at)\s+$/.test(lead)) claim.statesMinimum = true;
      if (/\b(?:maximum|max|highest|up to|no more than|at most|capped at)\b[^.!?]*$/.test(lead)) claim.endpoint = "maximum";
      else if (/\b(?:minimum|lowest|as low as)\b[^.!?]*$/.test(lead)) claim.endpoint = "minimum";
      // The same label written after the figure: "12.99% APR maximum".
      const label = /^\s*(maximum|max|minimum|min)\b/.exec(lower.slice(e));
      if (label && !claim.endpoint) claim.endpoint = label[1].startsWith("max") ? "maximum" : "minimum";
      if (NEGATION.test(lower.slice(ss, n.s))) claim.negated = true;
      if (lower[se] === "?") claim.question = true;
      // A comma followed by a space, not the comma inside "$5,000".
      if (/,\s/.test(lower.slice(ss, n.s))) claim.afterClause = true;
    }
    claims.push(claim);
    figureSpans.set(claim, [n.s, e]);
    read.push([s, e]);
  }

  // Two rates joined by "to" or a dash are the two ends of one range
  // ("8.99% to 35.99% APR"). This is the only way the second figure is read
  // as the highest rate without a word such as "up to" before it.
  const rates = claims
    .filter((c) => c.kind === "apr" && figureSpans.has(c))
    .sort((a, b) => figureSpans.get(a)![0] - figureSpans.get(b)![0]);
  for (let i = 0; i + 1 < rates.length; i++) {
    const end = figureSpans.get(rates[i])![1];
    const next = figureSpans.get(rates[i + 1])![0];
    if (next - end <= 5 && /^\s*(?:-|\u2013|\u2014|to)\s*$/.test(lower.slice(end, next))) {
      rates[i].rangeEnd = "low";
      rates[i + 1].rangeEnd = "high";
    }
  }
  // Does anything follow the figure in its sentence? For the low end of a
  // range, "follow" means after the high end. A label directly after the
  // figure ("12.99% APR maximum") is part of the figure's own statement.
  for (let i = 0; i < rates.length; i++) {
    const own = figureSpans.get(rates[i])!;
    const from = rates[i].rangeEnd === "low" ? figureSpans.get(rates[i + 1])![1] : own[1];
    const [, sentenceEnd] = sentenceBounds(lower, own[0]);
    const rest = lower.slice(from, sentenceEnd).replace(/^\s*(?:maximum|max|minimum|min)\b/, "");
    if (bare(rest) !== "") rates[i].followed = true;
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

/**
 * The claim's own words with the number replaced. When the quote is not a
 * plain figure in digits (it was written in words, or has hidden characters
 * inside the number), a plain figure is given instead of a patched quote.
 */
function withNumber(claim: Claim, value: string): string {
  const plain = /^(\D*)\d{1,3}(?:[.,]\d{1,3})?(\s?(?:%|percent\b|per cent\b).*)$/i.exec(claim.quote);
  if (plain) return `${plain[1]}${value}${plain[2]}`;
  return /apr\s*$/i.test(claim.quote) ? `${value}% APR` : `${value}%`;
}

export function checkClaim(claim: Claim, terms: OfferTerms): Check {
  const since = `from ${formatDate(terms.effectiveFrom)}`;
  if (claim.kind === "apr" && claim.value !== null) {
    if (terms.aprMin === null || terms.aprMax === null) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states ${percent(claim.value)}. The ${terms.campaign} offer sheet lists no APR range to compare it with.`,
        suggestion: null,
      };
    }
    const range = `${percent(terms.aprMin)} to ${percent(terms.aprMax)}`;
    if (claim.endpoint === "maximum" && claim.value !== terms.aprMax && claim.value <= terms.aprMax) {
      // "The maximum APR is 6.99%" or "... is 12.99%": a stated maximum that is
      // not the offer's. Below the floor it is a mismatch; inside the range the
      // check cannot say more than that it differs, so the reviewer reads it.
      // Either way there is no suggested edit: swapping in the offer's lowest
      // rate would write a new false maximum.
      return {
        claim,
        status: claim.value < terms.aprMin ? "mismatch" : "needs_reviewer",
        message: `The ad states a maximum APR of ${percent(claim.value)}. The APR range on the ${terms.campaign} offer ${since} is ${range}.${claim.value < terms.aprMin ? "" : " Please read it."}`,
        suggestion: null,
      };
    }
    if (claim.value < terms.aprMin) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says ${percent(claim.value)} APR. The lowest APR on the ${terms.campaign} offer ${since} is ${percent(terms.aprMin)}.`,
        // An edit is suggested only when the ad states the figure as its lowest
        // rate ("from 6.99% APR"). Then the offer's lowest rate is the field it
        // corresponds to. For any other wording the range is shown and the
        // marketer decides.
        // No edit when the sentence goes on, denies the figure or asks a
        // question: "Rates from 6.99% APR are unavailable" would become a
        // sentence about 8.99% that is still not an offer of it.
        suggestion:
          claim.statesMinimum && !claim.followed && !claim.negated && !claim.question && !claim.afterClause
            ? withNumber(claim, terms.aprMin.toFixed(2))
            : null,
      };
    }
    if (claim.value > terms.aprMax) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says ${percent(claim.value)} APR. The highest APR on the ${terms.campaign} offer ${since} is ${percent(terms.aprMax)}.`,
        suggestion: null,
      };
    }
    // The ad states the figure as its lowest rate, by a label ("lowest",
    // "minimum") or a lead-in ("from", "as low as").
    const saysLowest = claim.endpoint === "minimum" || claim.statesMinimum === true;
    if (saysLowest && claim.value !== terms.aprMin) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states a lowest APR of ${percent(claim.value)}. The APR range on the ${terms.campaign} offer ${since} is ${range}. Please read it.`,
        suggestion: null,
      };
    }
    // A match means two things. The figure equals one end of the offer's
    // range: being somewhere inside it proves nothing ("from 8.99% to 15.99%
    // APR" is false when the highest APR is 35.99%). And the ad's own words
    // state it as that end: "Our APR never exceeds 8.99%" names the offer's
    // lowest rate and says the opposite of the offer.
    const asLowest = (saysLowest || claim.rangeEnd === "low") && claim.endpoint !== "maximum";
    const asHighest = (claim.endpoint === "maximum" || claim.rangeEnd === "high") && !saysLowest;
    const plainly = !claim.negated && !claim.followed && !claim.question && !claim.afterClause;
    if (claim.value === terms.aprMin && asLowest && plainly) {
      return { claim, status: "ok", message: `${percent(claim.value)} APR is the lowest APR on the offer (${range}).`, suggestion: null };
    }
    if (claim.value === terms.aprMax && asHighest && plainly) {
      return { claim, status: "ok", message: `${percent(claim.value)} APR is the highest APR on the offer (${range}).`, suggestion: null };
    }
    if (claim.value === terms.aprMin || claim.value === terms.aprMax) {
      const which = claim.value === terms.aprMin ? "lowest" : "highest";
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad says ${percent(claim.value)} APR. That is the ${which} APR on the offer (${range}), but the check could not read the ad's wording as stating it as the ${which} rate. Please read the claim.`,
        suggestion: null,
      };
    }
    return {
      claim,
      status: "needs_reviewer",
      message: `The ad says ${percent(claim.value)} APR. That is inside the offer's range of ${range}, but it is not the lowest or the highest rate on the offer. Please read the claim.`,
      suggestion: null,
    };
  }
  if (claim.kind === "fee" && claim.value !== null) {
    if (terms.feePct === null) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states a ${percent(claim.value)} fee. The ${terms.campaign} offer sheet lists no origination fee to compare it with.`,
        suggestion: null,
      };
    }
    if (claim.value !== terms.feePct) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says a ${percent(claim.value)} fee. The ${terms.campaign} offer ${since} lists a ${percent(terms.feePct)} origination fee.`,
        // Swapping the figure is safe only when the sentence says nothing else about the fee.
        suggestion: claim.plain ? withNumber(claim, String(terms.feePct)) : null,
      };
    }
    if (!claim.plain) {
      return {
        claim,
        status: "needs_reviewer",
        message: `The ad states a ${percent(claim.value)} origination fee, which is the figure on the offer, but its sentence says more than that. Please read it.`,
        suggestion: null,
      };
    }
    return {
      claim,
      status: "ok",
      message: `A ${percent(claim.value)} fee matches the offer's origination fee.`,
      suggestion: null,
    };
  }
  if (claim.kind === "no_fee") {
    if (terms.feePct !== null && terms.feePct > 0) {
      return {
        claim,
        status: "mismatch",
        message: `The ad says "${claim.quote}". The ${terms.campaign} offer ${since} lists a ${percent(terms.feePct)} origination fee.`,
        // "No fees for late payments" is not a statement about the origination
        // fee alone: replacing its first words would write a new false sentence.
        suggestion: claim.plain ? `A ${String(terms.feePct)}% origination fee applies` : null,
      };
    }
    return {
      claim,
      // A match only when the sentence says nothing more: "No origination fee
      // unless you refinance" is not what a fee of zero on the offer says.
      status: terms.feePct === 0 && claim.plain ? "ok" : "needs_reviewer",
      message:
        terms.feePct === 0
          ? claim.plain
            ? "The offer sheet lists no origination fee."
            : `The offer sheet lists no origination fee, but the sentence around "${claim.quote}" says more than that. Please read it.`
          : `The ${terms.campaign} offer sheet does not state an origination fee, so "${claim.quote}" cannot be confirmed from it.`,
      suggestion: null,
    };
  }
  return {
    claim,
    status: "needs_reviewer",
    message: claim.heldSentence
      ? `"${claim.quote}" mentions a rate or a fee that the automatic check could not compare with the offer. Please read it.`
      : `The ad states "${claim.quote}" and the automatic check could not read it as a rate or a fee to compare. Please read it.`,
    suggestion: null,
  };
}

/**
 * The request the app drafts for a claim that does not match the offer. It is
 * about that one claim and nothing else. When a reviewer sends it unedited,
 * the revision view knows exactly which figure was asked for.
 */
export function draftRequest(check: Check): string {
  if (check.status !== "mismatch") return "";
  if (check.claim.kind === "no_fee") return `${check.message} Please remove this sentence or state the fee.`;
  return check.suggestion ? `${check.message} Please change it to ${check.suggestion}.` : check.message;
}

export type CopyAnalysis = {
  claims: Claim[];
  checks: Check[];
  hidden: HiddenTextFinding[];
  mismatches: number;
  /** Everything still open for the reviewer: mismatches, every claim held as "needs the reviewer", and hidden-text findings. */
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
/** The longest passage a request can be anchored to, whether picked from a chip or selected in the ad. */
export const MAX_ANCHOR_CHARS = 200;
