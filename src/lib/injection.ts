// Flags text in ad copy that is written to an AI or to the review process,
// not to a consumer. A flag only: it never removes text, never changes a
// status and never blocks a decision. The protections that matter (numbers
// checked in code, quotes checked word for word, a person approving) do not
// depend on this list, so it does not need to be complete.
//
// Correction rounds on this list: 0.

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

export function findInstructionText(text: string): InstructionFinding[] {
  const out: InstructionFinding[] = [];
  for (const [re, reason] of PATTERNS) {
    const m = re.exec(text);
    if (m) out.push({ quote: m[0], start: m.index, end: m.index + m[0].length, reason });
  }
  return out.sort((a, b) => a.start - b.start);
}
