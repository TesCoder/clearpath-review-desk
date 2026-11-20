import { describe, expect, it } from "vitest";
import { analyzeCopy, findClaims, findHiddenText, normalizeWithMap, type OfferTerms } from "./checks";

const winter: OfferTerms = {
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
const later: OfferTerms = { ...winter, revisionId: "pl-winter-r2", effectiveFrom: "2027-01-01", effectiveTo: null, aprMin: 9.49 };

const V1 = "Compare ClearPath personal loans. Rates from 6.99% APR.";
const V2 = "Compare ClearPath personal loans. Rates from 8.99% APR. No origination fee.";
const V3 = "Compare ClearPath personal loans. Rates from 8.99% APR.";

describe("the hero ad", () => {
  it("version 1: 6.99% is below the 8.99% floor", () => {
    const a = analyzeCopy(V1, winter);
    expect(a.mismatches).toBe(1);
    expect(a.checks[0].claim.quote).toBe("6.99% APR");
    expect(a.checks[0].message).toBe(
      "The ad says 6.99% APR. The lowest APR on the Winter Personal Loan offer from Nov 1, 2026 is 8.99%.",
    );
    expect(a.checks[0].suggestion).toBe("8.99% APR");
  });

  it("version 2: the rate is fixed and the new fee claim is not supported", () => {
    const a = analyzeCopy(V2, winter);
    expect(a.checks.map((c) => [c.claim.kind, c.status])).toEqual([
      ["apr", "ok"],
      ["no_fee", "mismatch"],
    ]);
    expect(a.checks[1].claim.quote).toBe("No origination fee");
    expect(a.checks[1].message).toContain("2.00% origination fee");
  });

  it("version 3: nothing to flag", () => {
    const a = analyzeCopy(V3, winter);
    expect(a.mismatches).toBe(0);
    expect(a.openFlags).toBe(0);
  });

  it("the same words fail in the later offer period", () => {
    expect(analyzeCopy(V3, later).mismatches).toBe(1);
  });
});

describe("claims", () => {
  it("quotes are exact spans of the submitted copy", () => {
    for (const text of [V1, V2, "APR as low as 7.5 percent, with a 2% origination fee."]) {
      for (const c of findClaims(text)) expect(text.slice(c.start, c.end)).toBe(c.quote);
    }
  });

  it("tells a rate from a fee in one sentence", () => {
    const claims = findClaims("Rates from 8.99% APR with a 2% origination fee.");
    expect(claims.map((c) => [c.kind, c.value])).toEqual([
      ["apr", 8.99],
      ["fee", 2],
    ]);
  });

  it("checks both ends of a range", () => {
    const a = analyzeCopy("APR from 8.99% to 39.99%.", winter);
    expect(a.checks.map((c) => c.status)).toEqual(["ok", "mismatch"]);
  });

  it("reads a decimal comma and the word percent", () => {
    expect(findClaims("Rates from 6,99 percent APR.")[0].value).toBe(6.99);
  });

  it("reads a rate written out in words", () => {
    const text = "Compare ClearPath personal loans. Rates starting at six point nine nine percent APR.";
    const a = analyzeCopy(text, winter);
    expect(a.mismatches).toBe(1);
    expect(a.checks[0].claim).toMatchObject({ kind: "apr", value: 6.99, quote: "six point nine nine percent APR" });
    expect(a.checks[0].message).toContain("The ad says 6.99% APR. The lowest APR");
    expect(a.checks[0].suggestion).toBe("8.99% APR");
  });

  it("reads other spelled-out percentages", () => {
    const values = (t: string) => findClaims(t).map((c) => c.value);
    expect(values("APR from eight point nine nine percent.")).toEqual([8.99]);
    expect(values("Rates of twenty-one percent APR.")).toEqual([21]);
    expect(values("Rates of thirty five point nine nine per cent APR.")).toEqual([35.99]);
    expect(values("A two percent origination fee applies.")).toEqual([2]);
    expect(values("Rates from nine point oh five percent APR.")).toEqual([9.05]);
    expect(analyzeCopy("A two percent origination fee applies.", winter).mismatches).toBe(0);
    expect(analyzeCopy("Just a one percent origination fee.", winter).mismatches).toBe(1);
  });

  it("does not read ordinary words as a percentage", () => {
    expect(findClaims("One of the nine best lenders. Point taken.")).toEqual([]);
  });

  it("flags a wrong fee percentage", () => {
    expect(analyzeCopy("Just a 1% origination fee.", winter).mismatches).toBe(1);
  });

  it("catches other ways of saying no fee", () => {
    for (const t of ["Zero fees.", "$0 origination fee", "Borrow without any fees", "0 fees, ever"]) {
      expect(analyzeCopy(t, winter).mismatches, t).toBe(1);
    }
  });

  it("does not treat a late-fee or prepayment claim as the origination fee, and holds it for the reviewer", () => {
    const a = analyzeCopy("No prepayment fee. No late fees.", winter);
    expect(a.claims.map((c) => [c.kind, c.quote])).toEqual([
      ["unclassified", "No prepayment fee"],
      ["unclassified", "No late fees"],
    ]);
    expect(a.mismatches).toBe(0);
    expect(a.checks.every((c) => c.status === "needs_reviewer")).toBe(true);
  });

  it("shows a percentage it cannot classify instead of dropping it", () => {
    const a = analyzeCopy("Save 20% today.", winter);
    expect(a.checks[0].status).toBe("needs_reviewer");
    expect(a.openFlags).toBe(1);
  });
});

describe("hidden text", () => {
  it("still catches a rate split by zero-width characters, and flags them", () => {
    const text = "Rates from 6.​99% A‍PR.";
    const a = analyzeCopy(text, winter);
    expect(a.mismatches).toBe(1);
    expect(a.hidden[0]).toMatchObject({ kind: "invisible", count: 2 });
    const c = a.claims[0];
    expect(text.slice(c.start, c.end)).toBe(c.quote);
  });

  it("reads full-width and non-standard digits", () => {
    expect(analyzeCopy("Rates from ６.９９％ APR.", winter).mismatches).toBe(1);
    const arabic = analyzeCopy("Rates from ٦.٩٩% APR.", winter);
    expect(arabic.mismatches).toBe(1);
    expect(arabic.hidden.some((h) => h.kind === "foreign_digit")).toBe(true);
  });

  it("flags look-alike letters and still shows the number", () => {
    const a = analyzeCopy("Rates from 6.99% АPR.", winter); // Cyrillic A
    expect(a.hidden.some((h) => h.kind === "mixed_script")).toBe(true);
    expect(a.openFlags).toBeGreaterThanOrEqual(2);
    expect(a.mismatches).toBe(1); // "rates" still classifies it
  });

  it("flags direction controls and tag characters", () => {
    const kinds = findHiddenText("a‮b\u{E0041}").map((h) => h.kind);
    expect(kinds).toEqual(["direction", "tag"]);
  });

  it("maps normalized offsets back to the original text", () => {
    const { norm, map } = normalizeWithMap("a​b");
    expect(norm).toBe("ab");
    expect(map).toEqual([0, 2, 3]);
  });

  it("clean copy has no hidden-text findings", () => {
    expect(findHiddenText(V2)).toEqual([]);
  });
});

// The approved forms and the fallback, with the examples from the final review.
// None of these involve a model: this is what the screen shows when the AI
// returns nothing at all.
describe("only a figure read whole is ever called a match", () => {
  const statuses = (text: string) => analyzeCopy(text, winter).checks.map((c) => [c.claim.quote, c.status]);

  it("an ordinary in-range rate still matches, and a low rate still flags", () => {
    expect(statuses("From 8.99% APR.")).toEqual([["8.99% APR", "ok"]]);
    expect(statuses("From 6.99% APR.")).toEqual([["6.99% APR", "mismatch"]]);
    expect(statuses("Rates starting at six point nine nine percent APR.")).toEqual([["six point nine nine percent APR", "mismatch"]]);
  });

  it("a range joined by a dash is held whole, with no match for its upper figure", () => {
    for (const text of ["APRs of 5.99-35.99% for qualified borrowers.", "APRs of 5.99\u201335.99% for qualified borrowers.", "Rates from 5.99 to 35.99% APR."]) {
      const a = analyzeCopy(text, winter);
      expect(a.checks.some((c) => c.status === "ok"), text).toBe(false);
      expect(a.checks.some((c) => c.status === "needs_reviewer" && c.claim.quote.includes("5.99") && c.claim.quote.includes("35.99")), text).toBe(true);
    }
  });

  it("a range with a percent sign on each figure is read, and its low end flags", () => {
    expect(statuses("Rates from 5.99% to 35.99% APR.")).toEqual([
      ["5.99%", "mismatch"],
      ["35.99% APR", "ok"],
    ]);
  });

  it("unusual digits are read by their plain value: a low rate flags, an in-range one is held, never matched", () => {
    const low = analyzeCopy("Rates from \u{1D7DE}.\u{1D7E1}\u{1D7E1}% APR.", winter); // double-struck 6.99
    expect(low.mismatches).toBe(1);
    expect(low.checks[0].message).toContain("The ad says 6.99% APR");
    const inRange = analyzeCopy("Rates from \u{1D7E0}.\u{1D7E1}\u{1D7E1}% APR.", winter); // double-struck 8.99
    expect(inRange.checks.map((c) => c.status)).toEqual(["needs_reviewer"]);
    expect(inRange.hidden.some((h) => h.kind === "foreign_digit")).toBe(true);
  });

  it("an unusual percent sign, or extra spaces before it, is held", () => {
    for (const text of ["Rates from 6.99\u066A APR.", "Rates from 6.99  % APR."]) {
      const a = analyzeCopy(text, winter);
      expect(a.checks.some((c) => c.status === "ok"), text).toBe(false);
      expect(a.checks.some((c) => c.status === "needs_reviewer" && c.claim.quote.includes("6.99")), text).toBe(true);
    }
  });

  it('"no-fee" and other fee wording with no figure is held, even beside a rate that was read', () => {
    for (const text of ["Rates from 8.99% APR on no-fee loans.", "No hidden fees, ever.", "We waive the origination fee for every borrower.", "Fee-free borrowing from 8.99% APR."]) {
      const a = analyzeCopy(text, winter);
      expect(a.checks.some((c) => c.status === "needs_reviewer"), text).toBe(true);
      expect(a.openFlags, text).toBeGreaterThanOrEqual(1);
    }
  });

  it("a rate mentioned with no figure is held", () => {
    expect(statuses("Rates as low as single digits.")).toEqual([["Rates as low as single digits", "needs_reviewer"]]);
  });

  it("a percentage next to the word interest alone is not called an APR", () => {
    expect(statuses("Cut your interest costs by up to 30%.")).toEqual([["30%", "needs_reviewer"]]);
  });

  it("a letter that lower-cases to two characters does not move the highlight", () => {
    const text = "\u0130\u0130\u0130\u0130 Rates from 6.99% APR today.";
    const a = analyzeCopy(text, winter);
    expect(a.checks[0].claim.quote).toBe("6.99% APR");
    expect(text.slice(a.checks[0].claim.start, a.checks[0].claim.end)).toBe("6.99% APR");
  });

  it("every quote is the exact words at its position, on every example here", () => {
    const texts = ["APRs of 5.99-35.99% for qualified borrowers.", "Rates from 6.99\u066A APR.", "Rates from 8.99% APR on no-fee loans.", "\u0130 No hidden fees. 5 to 9 percent rates."];
    for (const t of texts) for (const c of findClaims(t)) expect(t.slice(c.start, c.end)).toBe(c.quote);
  });

  it("clean seeded copy gains no flags", () => {
    for (const text of [
      "Compare ClearPath personal loans. Rates from 8.99% APR.",
      "ClearPath personal loans from 8.99% to 35.99% APR. A 2% origination fee applies. Terms from 24 to 60 months.",
      "Planning a big purchase? ClearPath personal loans start at 8.99% APR. A 2% origination fee applies.",
      "ClearPath personal loans: fixed rates from 8.99% APR. Funds as soon as the next business day.",
    ]) {
      expect(analyzeCopy(text, winter).openFlags, text).toBe(0);
    }
  });
});
