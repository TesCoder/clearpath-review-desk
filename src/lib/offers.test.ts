import { describe, expect, it } from "vitest";
import type { OfferTerms } from "./checks";
import { coverage, coverageText, termsOn } from "./offers";

const rev = (id: string, from: string, to: string | null, offerId = "pl"): OfferTerms & { offerId: string } => ({
  revisionId: id,
  offerId,
  campaign: "Winter Personal Loan",
  effectiveFrom: from,
  effectiveTo: to,
  aprMin: 8.99,
  aprMax: 35.99,
  feePct: 2,
  termMinMonths: 24,
  termMaxMonths: 60,
  source: "test",
});
const revisions = [rev("r1", "2026-11-01", "2026-12-31"), rev("r2", "2027-01-01", null), rev("x1", "2026-09-01", "2026-09-30", "other"), rev("x2", "2026-11-01", null, "other")];

describe("which offer terms apply", () => {
  it("picks the revision in effect on the date", () => {
    expect(termsOn(revisions, "pl", "2026-12-31")?.revisionId).toBe("r1");
    expect(termsOn(revisions, "pl", "2027-01-01")?.revisionId).toBe("r2");
  });

  it("has none before the offer starts", () => {
    expect(termsOn(revisions, "pl", "2026-06-01")).toBeNull();
  });

  it("joins back-to-back revisions into one range", () => {
    expect(coverage(revisions, "pl")).toEqual([{ from: "2026-11-01", to: null }]);
    expect(coverageText(revisions, "pl")).toBe("Nov 1, 2026 onward");
  });

  it("keeps a gap visible", () => {
    expect(coverageText(revisions, "other")).toBe("Sep 1, 2026 to Sep 30, 2026 and Nov 1, 2026 onward");
  });
});
