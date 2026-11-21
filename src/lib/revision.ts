// What a reviewer needs to know about a revision without rereading the ad:
// did it answer each earlier request, and did it bring in anything new?
//
// What this file decides: what the screen says about an earlier request.
//
// It has been corrected four times. The first three each narrowed when the
// word "Resolved" was shown wrongly (a reworded claim; a two-part request; an
// unchanged figure elsewhere in the ad). The fourth found two more (a
// different in-range figure than the one requested; the letters "APR" deleted
// with the figure left behind), and the verdict was dropped. The screen no
// longer says "Resolved". It reports what the comparison found, in the exact
// forms listed in RequestOutcome below, and asks the reviewer to confirm
// everything else. Bringing a verdict back would be a product decision.

import { analyzeCopy, draftRequest, normalizeWithMap, type Check, type ClaimKind, type OfferTerms } from "./checks";
import { diffWords, hasAdditions } from "./diff";

export type PriorRequest = { anchorText: string | null; body: string };

export type RequestOutcome = {
  request: PriorRequest;
  /**
   * What the comparison of the two versions found. The screen reports this and
   * no more: it never says a request is "resolved".
   * requested_present: the app's drafted request named a figure, and exactly
   *   that figure is new in this version.
   * removed: the flagged claim was deleted, its figure is gone, nothing was added.
   * check_passes: a new matching figure, under a request in the reviewer's own
   *   words, which may ask for more than a number check can see.
   * not_resolved / unchanged: the flagged claim is still wrong or still there.
   * changed: anything else. The change is shown and the reviewer confirms.
   */
  outcome: "requested_present" | "removed" | "check_passes" | "not_resolved" | "unchanged" | "changed";
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
  const onlyRemovals = !hasAdditions(diffWords(previousBody, currentBody));

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
      const fromDraft = request.body.trim() === draftRequest(flagged);
      const label = fam === "apr" ? "rate" : "fee";
      // Which outcome applies. Each is defined on RequestOutcome above.
      // A figure counts only if it is new in this version, the flagged figure
      // is gone from the ad in every form, and the version brought in nothing
      // the number check had to hold for the reviewer.
      const flaggedValue = flagged.claim.value;
      const figureGone =
        flaggedValue === null ||
        (!numbersIn(currentBody).includes(flaggedValue) && !after.claims.some((c) => c.value === flaggedValue));
      const broughtInHeld = after.checks.some((c) => c.claim.kind === "unclassified" && !seenBefore.has(signature(c)));
      const fresh =
        figureGone && !broughtInHeld ? sameFamily.filter((c) => c.status === "ok" && !seenBefore.has(signature(c))) : [];
      // The figure the drafted request asked for, when it named one.
      const asked = !fromDraft
        ? null
        : flagged.claim.kind === "no_fee" || flagged.claim.kind === "fee"
          ? terms.feePct
          : flagged.suggestion === null || flaggedValue === null
            ? null
            : // An edit is suggested for a rate only when it is stated as the lowest
              // rate and is below the offer's, so the figure asked for is that lowest APR.
              terms.aprMin;
      const arrow = (c: Check) => `${flagged.claim.quote} \u2192 ${c.claim.quote}.`;
      if (fresh.length) {
        const exact = asked === null ? undefined : fresh.find((c) => c.claim.value === asked);
        if (exact) return { request, outcome: "requested_present", detail: `${arrow(exact)} That is the figure the request asked for.` };
        if (fromDraft) {
          return {
            request,
            outcome: "changed",
            detail: `${arrow(fresh[0])} ${asked === null ? "" : `The request asked for ${asked}%. `}The new figure is within the offer, but it is not the one requested. Confirm it answers your request.`,
          };
        }
        return {
          request,
          outcome: "check_passes",
          detail: `The ad now says "${fresh[0].claim.quote}", which matches the offer. That is all the ${label} check can confirm. Confirm the rest of your request.`,
        };
      }
      if (!stillThere && onlyRemovals && figureGone) {
        const fact = "The claim was removed, and nothing was added in its place.";
        return fromDraft
          ? { request, outcome: "removed", detail: fact }
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
