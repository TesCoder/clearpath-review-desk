// What a reviewer needs to know about a revision without rereading the ad:
// did it answer each earlier request, and did it bring in anything new?

import { analyzeCopy, type Check, type ClaimKind, type OfferTerms } from "./checks";

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
      if (open.length === 0) {
        return {
          request,
          outcome: "resolved",
          detail: sameFamily.length
            ? `The ad now says "${sameFamily[0].claim.quote}", which matches the offer.`
            : "The claim was removed.",
        };
      }
      return {
        request,
        outcome: stillThere ? "unchanged" : "not_resolved",
        detail: stillThere ? `The ad still says "${anchor}".` : open[0].message,
      };
    }
    if (stillThere) {
      return { request, outcome: "unchanged", detail: `The words you flagged are still in the ad: "${anchor}".` };
    }
    return {
      request,
      outcome: "changed",
      detail: anchor
        ? "The words you flagged are no longer in the ad. Please confirm the change answers your request."
        : "The ad changed. Please confirm the change answers your request.",
    };
  });

  const seen = new Set(before.checks.map(signature));
  const newClaims = after.checks.filter((c) => !seen.has(signature(c)));
  return { outcomes, newClaims };
}
