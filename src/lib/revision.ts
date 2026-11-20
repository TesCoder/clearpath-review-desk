// What a reviewer needs to know about a revision without rereading the ad:
// did it answer each earlier request, and did it bring in anything new?

import { analyzeCopy, type Check, type ClaimKind, type OfferTerms } from "./checks";
import { diffWords } from "./diff";

export type PriorRequest = { anchorText: string | null; body: string };

export type RequestOutcome = {
  request: PriorRequest;
  outcome: "resolved" | "not_resolved" | "unchanged" | "changed";
  detail: string;
};

const family = (kind: ClaimKind) => (kind === "no_fee" ? "fee" : kind);
const signature = (c: Check) => `${c.claim.kind}:${c.claim.value}`;

export function reviewRevision(
  previousBody: string,
  currentBody: string,
  requests: PriorRequest[],
  terms: OfferTerms,
): { outcomes: RequestOutcome[]; newClaims: Check[] } {
  const before = analyzeCopy(previousBody, terms);
  const after = analyzeCopy(currentBody, terms);

  // True when the revision only took words out.
  const onlyRemovals = !diffWords(previousBody, currentBody).some((p) => p.type === "added" && p.text.trim() !== "");

  const outcomes = requests.map((request): RequestOutcome => {
    const anchor = request.anchorText?.trim() ?? "";
    const stillThere = anchor !== "" && currentBody.includes(anchor);
    // Was the request about a number the code check had flagged?
    const flagged = anchor
      ? before.checks.find(
          (c) => c.status === "mismatch" && (c.claim.quote.includes(anchor) || anchor.includes(c.claim.quote)),
        )
      : undefined;
    if (flagged) {
      const fam = family(flagged.claim.kind);
      const sameFamily = after.checks.filter((c) => family(c.claim.kind) === fam);
      const open = sameFamily.filter((c) => c.status === "mismatch");
      if (open.length > 0) {
        return {
          request,
          outcome: stillThere ? "unchanged" : "not_resolved",
          detail: stillThere ? `The ad still says "${anchor}".` : open[0].message,
        };
      }
      // "Resolved" is said only when it can be verified: either the offer
      // data confirms the corrected value, or the claim was deleted and
      // nothing was written in its place. A claim reworded into something
      // the number check cannot read ("we waive the fee") is not resolved:
      // the reviewer is asked to confirm.
      const verified = sameFamily.find((c) => c.status === "ok");
      if (verified) {
        return { request, outcome: "resolved", detail: `The ad now says "${verified.claim.quote}", which matches the offer.` };
      }
      if (!stillThere && onlyRemovals) {
        return { request, outcome: "resolved", detail: "The claim was removed, and nothing was added in its place." };
      }
      return {
        request,
        outcome: stillThere ? "unchanged" : "changed",
        detail: stillThere
          ? `The ad still says "${anchor}".`
          : "The original wording changed. Confirm the revision addresses your request: the number check cannot verify the new wording.",
      };
    }
    if (stillThere) {
      return { request, outcome: "unchanged", detail: `The words you flagged are still in the ad: "${anchor}".` };
    }
    return {
      request,
      outcome: "changed",
      detail: anchor
        ? "The original wording changed. Confirm the revision addresses your request."
        : "The ad changed. Confirm the revision addresses your request.",
    };
  });

  const seen = new Set(before.checks.map(signature));
  const newClaims = after.checks.filter((c) => !seen.has(signature(c)));
  return { outcomes, newClaims };
}

/**
 * Sentences in the new version that contain added words the number check does
 * not cover. A corrected figure ("8.99%") is covered by its check and is left
 * out; a reworded claim ("We waive the origination fee") is returned whole, so
 * the reviewer reads the sentence and not a fragment of it.
 */
export function addedSentences(previousBody: string, currentBody: string, covered: Array<{ start: number; end: number }>): string[] {
  // Positions in the new version of every added, uncovered letter or digit.
  const uncovered: number[] = [];
  let at = 0;
  for (const part of diffWords(previousBody, currentBody)) {
    if (part.type === "removed") continue;
    if (part.type === "added") {
      for (let i = 0; i < part.text.length; i++) {
        const pos = at + i;
        if (/[\p{L}\p{N}]/u.test(part.text[i]) && !covered.some((c) => pos >= c.start && pos < c.end)) uncovered.push(pos);
      }
    }
    at += part.text.length;
  }
  if (!uncovered.length) return [];

  const out: string[] = [];
  const boundary = /[.!?](?=\s|$)|\n/g;
  let start = 0;
  const take = (end: number) => {
    if (uncovered.some((p) => p >= start && p < end)) {
      const sentence = currentBody.slice(start, end).trim();
      if (sentence) out.push(sentence);
    }
    start = end;
  };
  for (let m = boundary.exec(currentBody); m; m = boundary.exec(currentBody)) take(m.index + m[0].length);
  take(currentBody.length);
  return out;
}
