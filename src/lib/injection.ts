// Flags text in ad copy that is written to an AI or to the review process,
// not to a consumer. A flag only: it never removes text, never changes a
// status and never blocks a decision. The protections that matter (numbers
// checked in code, quotes checked word for word, a person approving) do not
// depend on this list, so it does not need to be complete.
//
// This list has been corrected twice. The patterns did not change either time.
//   1. They also run on the cleaned-up copy of the text that the number check
//      uses (hidden characters removed, compatibility forms folded), because
//      a zero-width character or a soft hyphen inside "ignore previous
//      instructions" got past them.
//   2. Round 1 ran them on the cleaned-up copy only, and that lost a flag:
//      in "Ignore[zero-width space]xyz previous instructions" the hidden
//      character ends the word "Ignore" in the submitted text, and removing
//      it makes the word "Ignorexyz". Now they run on both, and a flag from
//      either is kept. So every flag the submitted text alone would give is
//      still given: this is by construction, and a test checks it.
// Two rounds is where this list stops being widened. What stands behind it
// does not depend on a pattern: hidden characters are flagged in their own
// right, the model reports text addressed to it, and a person reads the ad.

import { normalizeWithMap } from "./checks";

const PATTERNS: Array<[RegExp, string]> = [
  [/\b(?:ignore|disregard|forget)\b[^.\n]{0,40}\b(?:instructions?|rules?|prompt|above|previous|prior)\b/i, "tells the reader to ignore instructions"],
  [/\b(?:system prompt|as an ai|you are an? (?:ai|assistant|language model|llm|reviewer))\b/i, "addresses an AI"],
  [/\b(?:note|message|attention)\s+(?:to|for)\s+(?:the\s+)?(?:ai|assistant|model|reviewer|compliance)\b/i, "addresses the reviewer or an AI"],
  [/\b(?:do not|don't|never)\s+(?:flag|report|mention|list|include)\b/i, "asks for something not to be reported"],
  [/\b(?:report|return|find|list|output)\s+(?:no|zero|0)\s+(?:claims?|findings?|issues?|problems?|risks?)\b/i, "asks for no findings"],
  [/\b(?:pre-?approved|already approved|approved)\s+by\s+(?:legal|compliance|clearpath|the reviewer)\b/i, "claims an approval inside the copy"],
  [/\bapprove\s+this\s+(?:ad|copy|version|submission)\b/i, "asks for approval"],
  [/<\/?\s*(?:ad_copy|system|assistant|instructions?|untrusted|data)[\w-]*\s*>/i, "contains markup that imitates the review system"],
];

export type InstructionFinding = { quote: string; start: number; end: number; reason: string };

type Span = { start: number; end: number };

/** Each pattern's first match in the text exactly as submitted. This is the whole check as it was before round 1. */
export function instructionTextAsSubmitted(text: string): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  for (const [re, reason] of PATTERNS) {
    const m = re.exec(text);
    if (m) out.push({ quote: m[0], start: m.index, end: m.index + m[0].length, reason });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** Each pattern's first match in the cleaned-up copy, as a span of the submitted text. */
function instructionTextCleanedUp(text: string): Map<string, Span> {
  const { norm, map } = normalizeWithMap(text);
  const out = new Map<string, Span>();
  for (const [re, reason] of PATTERNS) {
    const m = re.exec(norm);
    if (!m || m[0].length === 0) continue;
    const start = map[m.index];
    // The end of the last matched character in the original, not the start of
    // whatever follows: hidden characters after the match are left out.
    const last = map[m.index + m[0].length - 1];
    out.set(reason, { start, end: last + (text.codePointAt(last)! > 0xffff ? 2 : 1) });
  }
  return out;
}

/**
 * Text addressed to an AI or to the review process. The patterns are tried on
 * the text as submitted and on its cleaned-up copy, and a flag from either is
 * kept. Where both find the same reason on overlapping words, one flag is
 * shown, on the longer span. Every span is in the submitted text, so the
 * highlight sits on the submitted characters, hidden ones inside it included.
 */
export function findInstructionText(text: string): InstructionFinding[] {
  const out = instructionTextAsSubmitted(text);
  for (const [reason, span] of instructionTextCleanedUp(text)) {
    const same = out.find((f) => f.reason === reason);
    const asFinding = { ...span, quote: text.slice(span.start, span.end), reason };
    if (!same) out.push(asFinding);
    else if (same.start < span.end && span.start < same.end) {
      // The same words found twice. Keep the longer span.
      if (span.end - span.start > same.end - same.start) out[out.indexOf(same)] = asFinding;
    } else out.push(asFinding); // the same reason in two different places: both are shown
  }
  return out.sort((a, b) => a.start - b.start);
}
