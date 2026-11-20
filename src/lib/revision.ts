// What a reviewer needs to know about a revision without rereading the ad:
// did it answer each earlier request, and did it bring in anything new?
//
// Decision-logic rounds: 3 (llm-first-decision-architecture.mdc section 6).
// Decision counted: whether an earlier request is shown as "Resolved".
// Every round so far has narrowed it: none added a way to be resolved.
//   Round 1, 2026-11-20: a reworded false claim ("we waive the fee") was
//     marked resolved. Narrowed to a verified figure or a pure deletion.
//   Round 2, 2026-11-20: a two-part request was marked resolved when one part
//     was fixed. Narrowed to the app's own drafted, single-claim request.
//   Round 3, 2026-11-20: an unchanged figure elsewhere in the ad was accepted
//     as the correction. Narrowed to a matching figure that is new in the
//     version, with the flagged figure gone and nothing new held.
// The only two ways a request is "Resolved" (both need the app's own drafted
// request, sent unedited):
//   A. the flagged figure is gone, a matching figure of the same kind is new
//      in this version, and the version brought in nothing the check held;
//   B. the flagged claim was deleted and nothing at all was added.
// Everything else asks the reviewer to confirm. Do not add a third way
// without the approver's word.

import { analyzeCopy, draftRequest, normalizeWithMap, type Check, type ClaimKind, type OfferTerms } from "./checks";
import { diffWords } from "./diff";

export type PriorRequest = { anchorText: string | null; body: string };

export type RequestOutcome = {
  request: PriorRequest;
  /**
   * resolved: the whole request is known to be met. Only said when the request
   *   was the app's own drafted comment about one claim, sent unedited, and
   *   that claim now checks out or was deleted with nothing added.
   * check_passes: the flagged figure now checks out or was deleted, but the
   *   reviewer wrote the request in their own words, so it may ask for more
   *   than the number check can see. The reviewer confirms the rest.
   * not_resolved / unchanged: the flagged claim is still wrong or still there.
   * changed: the wording changed in a way the check cannot verify.
   */
  outcome: "resolved" | "check_passes" | "not_resolved" | "unchanged" | "changed";
  detail: string;
};

const family = (kind: ClaimKind) => (kind === "no_fee" ? "fee" : kind);
// Held items have no value to tell them apart, so they are compared by their words.
const signature = (c: Check) => (c.claim.kind === "unclassified" ? `held:${c.claim.quote}` : `${c.claim.kind}:${c.claim.value}`);

/** Every number written in digits in the text, after the same clean-up the number check uses. */
function numbersIn(text: string): number[] {
  const { norm } = normalizeWithMap(text);
  return (norm.match(/\d+(?:[.,]\d+)?/g) ?? []).map((t) => Number(t.replace(",", ".")));
}

export function reviewRevision(
  previousBody: string,
  currentBody: string,
  requests: PriorRequest[],
  terms: OfferTerms,
): { outcomes: RequestOutcome[]; newClaims: Check[] } {
  const before = analyzeCopy(previousBody, terms);
  const after = analyzeCopy(currentBody, terms);

  const seenBefore = new Set(before.checks.map(signature));

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
      // A figure "checks out" only when it can be verified: either the offer
      // data confirms the corrected value, or the claim was deleted and
      // nothing was written in its place. A claim reworded into something
      // the number check cannot read ("we waive the fee") does not check out:
      // the reviewer is asked to confirm.
      // A request written in the reviewer's own words can ask for more than
      // this one figure ("correct the APR and remove guaranteed approval").
      // Code cannot read that, so it says only what it verified and asks the
      // reviewer to confirm the rest. The one exception is the app's own
      // drafted request, sent unedited: it is about this claim and nothing else.
      const onlyAboutThisClaim = request.body.trim() === draftRequest(flagged);
      const label = fam === "apr" ? "rate" : "fee";
      // What counts as a verified correction. All of these, or it is not one:
      //   1. no mismatch of this kind remains (checked just above);
      //   2. the flagged figure is gone from the ad, in any form;
      //   3. a matching figure of this kind is new in this version. A figure
      //      that was already in the ad and did not change proves nothing
      //      about the one that was flagged;
      //   4. this version brought in nothing the number check had to hold for
      //      the reviewer (a range, an unreadable figure, fee wording).
      const flaggedValue = flagged.claim.value;
      const figureGone =
        flaggedValue === null ||
        (!numbersIn(currentBody).includes(flaggedValue) && !after.claims.some((c) => c.value === flaggedValue));
      const broughtInHeld = after.checks.some((c) => c.claim.kind === "unclassified" && !seenBefore.has(signature(c)));
      const verified =
        figureGone && !broughtInHeld ? sameFamily.find((c) => c.status === "ok" && !seenBefore.has(signature(c))) : undefined;
      if (verified) {
        const fact = `The ad now says "${verified.claim.quote}", which matches the offer.`;
        return onlyAboutThisClaim
          ? { request, outcome: "resolved", detail: fact }
          : { request, outcome: "check_passes", detail: `${fact} That is all the ${label} check can confirm. Confirm the rest of your request.` };
      }
      if (!stillThere && onlyRemovals) {
        const fact = "The claim was removed, and nothing was added in its place.";
        return onlyAboutThisClaim
          ? { request, outcome: "resolved", detail: fact }
          : { request, outcome: "check_passes", detail: `${fact} Confirm the rest of your request.` };
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

  const newClaims = after.checks.filter((c) => !seenBefore.has(signature(c)));
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
