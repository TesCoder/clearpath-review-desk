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

  it("flags a wrong fee percentage", () => {
    expect(analyzeCopy("Just a 1% origination fee.", winter).mismatches).toBe(1);
  });

  it("catches other ways of saying no fee", () => {
    for (const t of ["Zero fees.", "$0 origination fee", "Borrow without any fees", "0 fees, ever"]) {
      expect(analyzeCopy(t, winter).mismatches, t).toBe(1);
    }
  });

  it("does not treat a late-fee or prepayment claim as the origination fee", () => {
    expect(findClaims("No prepayment fee. No late fees.")).toEqual([]);
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
