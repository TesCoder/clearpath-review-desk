// Flags text in ad copy that is written to an AI or to the review process,
// not to a consumer. A flag only: it never removes text, never changes a
// status and never blocks a decision. The protections that matter (numbers
// checked in code, quotes checked word for word, a person approving) do not
// depend on this list, so it does not need to be complete.
//
// Correction rounds on this list: 1 (llm-first-decision-architecture.mdc
// section 6). The patterns did not change. They now run on the cleaned-up
// copy of the text that the number check uses (hidden characters removed,
// compatibility forms folded), because a zero-width character or a soft
// hyphen inside "ignore previous instructions" got past them. A flag is the
// only outcome, so this round can only flag more.

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

/**
 * Each pattern's first match, as a span of the original text. Matching is
 * done on the cleaned-up copy; the span is mapped back, so the highlight sits
 * on the submitted characters, hidden ones inside it included.
 */
export function findInstructionText(text: string): InstructionFinding[] {
  const { norm, map } = normalizeWithMap(text);
  const out: InstructionFinding[] = [];
  for (const [re, reason] of PATTERNS) {
    const m = re.exec(norm);
    if (!m || m[0].length === 0) continue;
    const start = map[m.index];
    // The end of the last matched character in the original, not the start of
    // whatever follows: hidden characters after the match are left out.
    const last = map[m.index + m[0].length - 1];
    const end = last + (text.codePointAt(last)! > 0xffff ? 2 : 1);
    out.push({ quote: text.slice(start, end), start, end, reason });
  }
  return out.sort((a, b) => a.start - b.start);
}
