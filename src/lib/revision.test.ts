import { describe, expect, it } from "vitest";
import type { OfferTerms } from "./checks";
import { diffWords, hasChanges } from "./diff";
import { analyzeCopy, draftRequest } from "./checks";
import { addedSentences, reviewRevision } from "./revision";
import { HERO_V1, HERO_V1_REQUEST } from "./seed";

const terms: OfferTerms = {
  revisionId: "pl-winter-r1",
  campaign: "Winter Personal Loan",
  effectiveFrom: "2026-11-01",
  effectiveTo: "2026-12-31",
  aprMin: 8.99,
  aprMax: 35.99,
  feePct: 2,
  termMinMonths: 24,
  termMaxMonths: 60,
  source: "test",
};
const V1 = "Compare ClearPath personal loans. Rates from 6.99% APR.";
const V2 = "Compare ClearPath personal loans. Rates from 8.99% APR. No origination fee.";
const V3 = "Compare ClearPath personal loans. Rates from 8.99% APR.";
// The requests the app drafts for these two claims, as a reviewer sends them unedited.
const aprRequest = { anchorText: "6.99% APR", body: draftRequest(analyzeCopy(V1, terms).checks[0]) };
const feeRequest = { anchorText: "No origination fee", body: draftRequest(analyzeCopy(V2, terms).checks[1]) };

describe("reviewing a revision", () => {
  it("version 2 resolves the APR request and brings in a new unsupported claim", () => {
    const r = reviewRevision(V1, V2, [aprRequest], terms);
    expect(r.outcomes[0].outcome).toBe("resolved");
    expect(r.outcomes[0].detail).toBe('The ad now says "8.99% APR", which matches the offer.');
    expect(r.newClaims.map((c) => [c.claim.quote, c.status])).toEqual([
      ["8.99% APR", "ok"],
      ["No origination fee", "mismatch"],
    ]);
  });

  it("version 3 resolves the fee request by removing the claim, with nothing new", () => {
    const r = reviewRevision(V2, V3, [feeRequest], terms);
    expect(r.outcomes[0]).toMatchObject({ outcome: "resolved", detail: "The claim was removed, and nothing was added in its place." });
    expect(r.newClaims).toEqual([]);
  });

  it("a reworded false claim is never marked resolved", () => {
    const waiver = "Compare ClearPath personal loans. Rates from 8.99% APR. We waive the origination fee for every borrower.";
    const r = reviewRevision(V2, waiver, [feeRequest], terms);
    expect(r.outcomes[0].outcome).toBe("changed");
    expect(r.outcomes[0].detail).toContain("Confirm the revision addresses your request");
  });

  it("the same request is resolved when the sentence is deleted, and not when it is reworded", () => {
    const deleted = reviewRevision(V2, V3, [feeRequest], terms).outcomes[0].outcome;
    const reworded = reviewRevision(V2, V3 + " Fee-free for all.", [feeRequest], terms).outcomes[0].outcome;
    expect([deleted, reworded]).toEqual(["resolved", "changed"]);
  });

  it("a removed claim with other words added elsewhere asks for confirmation", () => {
    const r = reviewRevision(V2, "Compare ClearPath personal loans today. Rates from 8.99% APR.", [feeRequest], terms);
    expect(r.outcomes[0].outcome).toBe("changed");
  });

  it("a corrected fee that the offer confirms is resolved", () => {
    const r = reviewRevision(V2, V3 + " A 2% origination fee applies.", [feeRequest], terms);
    expect(r.outcomes[0]).toMatchObject({ outcome: "resolved", detail: 'The ad now says "2%", which matches the offer.' });
  });

  it("the drafted requests are about one claim each", () => {
    expect(aprRequest.body).toBe(
      "The ad says 6.99% APR. The lowest APR on the Winter Personal Loan offer from Nov 1, 2026 is 8.99%. Please change it to 8.99% APR.",
    );
    expect(feeRequest.body).toContain("Please remove this sentence or state the fee.");
  });

  it("the seeded request on the hero ad is the drafted request, so the demo's Resolved is earned", () => {
    expect(HERO_V1_REQUEST.anchor).toBe("6.99% APR");
    expect(HERO_V1_REQUEST.body).toBe(draftRequest(analyzeCopy(HERO_V1, terms).checks[0]));
  });

  describe("a request in the reviewer's own words is never marked resolved by a number check", () => {
    it("two-part request, only the rate fixed: the rate check passes, the rest is the reviewer's to confirm", () => {
      const r = reviewRevision(
        "Rates from 6.99% APR. Guaranteed approval.",
        "Rates from 8.99% APR. Guaranteed approval.",
        [{ anchorText: "6.99% APR", body: "Correct the APR and remove guaranteed approval." }],
        terms,
      );
      expect(r.outcomes[0].outcome).toBe("check_passes");
      expect(r.outcomes[0].detail).toBe(
        'The ad now says "8.99% APR", which matches the offer. That is all the rate check can confirm. Confirm the rest of your request.',
      );
    });

    it("a drafted request with more typed after it is no longer the draft", () => {
      const r = reviewRevision(V1, V2, [{ anchorText: "6.99% APR", body: aprRequest.body + " Also remove the word Compare." }], terms);
      expect(r.outcomes[0].outcome).toBe("check_passes");
    });

    it("even a short single-topic request in the reviewer's words gets the careful label", () => {
      const r = reviewRevision(V1, V2, [{ anchorText: "6.99% APR", body: "Correct the APR." }], terms);
      expect(r.outcomes[0].outcome).toBe("check_passes");
    });

    it("a deleted claim under an own-words request is reported as removed, not resolved", () => {
      const r = reviewRevision(V2, V3, [{ anchorText: "No origination fee", body: "Remove the fee line and add the full APR range." }], terms);
      expect(r.outcomes[0].outcome).toBe("check_passes");
      expect(r.outcomes[0].detail).toBe("The claim was removed, and nothing was added in its place. Confirm the rest of your request.");
    });

    it("a still-wrong figure is still reported as not resolved", () => {
      const r = reviewRevision(V1, V1.replace("6.99", "7.99"), [{ anchorText: "6.99% APR", body: "Correct the APR and remove guaranteed approval." }], terms);
      expect(r.outcomes[0].outcome).toBe("not_resolved");
    });
  });

  it("says so when the flagged words are still there", () => {
    const r = reviewRevision(V1, V1 + " Apply today.", [aprRequest], terms);
    expect(r.outcomes[0].outcome).toBe("unchanged");
  });

  it("says so when the number changed but still does not match", () => {
    const r = reviewRevision(V1, V1.replace("6.99", "7.99"), [aprRequest], terms);
    expect(r.outcomes[0].outcome).toBe("not_resolved");
    expect(r.outcomes[0].detail).toContain("7.99% APR");
  });

  it("asks the reviewer to confirm a change it cannot check", () => {
    const r = reviewRevision("Best loans ever. Apply now.", "Apply now.", [{ anchorText: "Best loans ever", body: "Remove." }], terms);
    expect(r.outcomes[0].outcome).toBe("changed");
  });
});

describe("word differences", () => {
  it("shows the replaced rate and the added sentence", () => {
    const parts = diffWords(V1, V2).filter((p) => p.type !== "same");
    expect(parts).toEqual([
      { type: "removed", text: "6.99%" },
      { type: "added", text: "8.99%" },
      { type: "added", text: " No origination fee." },
    ]);
  });

  it("reports no changes for identical text", () => {
    expect(hasChanges(diffWords(V3, V3))).toBe(false);
  });

  it("rebuilds both versions from the parts", () => {
    const parts = diffWords(V2, V3);
    expect(parts.filter((p) => p.type !== "added").map((p) => p.text).join("")).toBe(V2);
    expect(parts.filter((p) => p.type !== "removed").map((p) => p.text).join("")).toBe(V3);
  });
});

describe("added wording the number check does not cover", () => {
  // Only figures the check actually read count as covered.
  const spans = (text: string) => analyzeCopy(text, terms).claims.filter((c) => c.kind !== "unclassified");

  it("returns the whole reworded sentence", () => {
    const waiver = "Compare ClearPath personal loans. Rates from 8.99% APR. We waive the origination fee for every borrower.";
    expect(addedSentences(V2, waiver, spans(waiver))).toEqual(["We waive the origination fee for every borrower."]);
  });

  it("leaves out a corrected figure and a new claim the check already covers", () => {
    expect(addedSentences(V1, V2, spans(V2))).toEqual([]);
  });

  it("returns nothing when words were only removed", () => {
    expect(addedSentences(V2, V3, spans(V3))).toEqual([]);
  });

  it("returns a new sentence with no number in it", () => {
    const next = V3 + " Funds as soon as the next business day.";
    expect(addedSentences(V3, next, spans(next))).toEqual(["Funds as soon as the next business day."]);
  });
});
