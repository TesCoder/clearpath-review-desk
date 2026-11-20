import { describe, expect, it } from "vitest";
import type { OfferTerms } from "./checks";
import { diffWords, hasChanges } from "./diff";
import { reviewRevision } from "./revision";

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
const aprRequest = { anchorText: "6.99% APR", body: "Please change the rate to 8.99% APR." };
const feeRequest = { anchorText: "No origination fee", body: "Remove this sentence or state the fee." };

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
    expect(r.outcomes[0]).toMatchObject({ outcome: "resolved", detail: "The claim was removed." });
    expect(r.newClaims).toEqual([]);
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
