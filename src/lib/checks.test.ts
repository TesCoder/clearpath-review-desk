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

  it("reads the word percent, and holds a figure written with a comma", () => {
    expect(findClaims("Rates from 6.99 percent APR.")[0].value).toBe(6.99);
    // "8,990%" is not 8.99%. A comma figure is never read: it is held whole.
    for (const t of ["Rates from 6,99 percent APR.", "Rates from 8,99% APR.", "Rates from 8,990% APR.", "Rates from 35,99% APR."]) {
      const a = analyzeCopy(t, winter);
      expect(a.checks.some((c) => c.status === "ok"), t).toBe(false);
      expect(a.checks.every((c) => c.status === "needs_reviewer"), t).toBe(true);
    }
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

// Round 4: the offer sheet states one fee, so only the origination fee is compared.
describe("a fee figure is compared only when the ad names the origination fee", () => {
  const checks = (text: string) => analyzeCopy(text, winter).checks;

  it("a prepayment fee is held, with no suggested edit", () => {
    const c = checks("Rates from 8.99% APR. A 0% prepayment fee applies.");
    expect(c.map((x) => [x.claim.quote, x.status, x.suggestion])).toEqual([
      ["8.99% APR", "ok", null],
      ["0%", "needs_reviewer", null],
    ]);
  });

  it("the origination fee is still compared, both ways round, with its fix", () => {
    for (const text of ["0% origination fee", "A 0% origination fee applies.", "Origination fee of 0%.", "The origination fee is 0%."]) {
      const c = checks(text).find((x) => x.status === "mismatch");
      expect(c, text).toBeTruthy();
      expect(c!.suggestion, text).toContain("2");
    }
    expect(checks("A 2% origination fee applies.").map((x) => x.status)).toEqual(["ok"]);
  });

  it("late, annual and unnamed fees are held, never matched and never given a fix", () => {
    for (const text of ["A 2% late fee applies.", "Annual fee of 2%.", "A 2% fee applies.", "Origination and late fees of 5% may apply."]) {
      const all = checks(text);
      expect(all.some((x) => x.status === "ok"), text).toBe(false);
      expect(all.some((x) => x.status === "mismatch"), text).toBe(false);
      expect(all.every((x) => x.suggestion === null), text).toBe(true);
      expect(all.some((x) => x.status === "needs_reviewer"), text).toBe(true);
    }
  });

  it("both fees in one sentence: both are held, because the sentence says more than the origination fee", () => {
    const c = checks("A 2% origination fee and a 0% prepayment fee apply.");
    expect(c.map((x) => [x.claim.quote, x.status])).toEqual([
      ["2%", "needs_reviewer"],
      ["0%", "needs_reviewer"],
    ]);
  });
});

// Round 5: an edit is suggested only when the wording says which offer field the figure is.
describe("a suggested edit needs the wording to identify the offer field", () => {
  const one = (text: string) => analyzeCopy(text, winter).checks;

  it("a stated lowest rate below the floor still flags, with its edit", () => {
    for (const text of ["Rates from 6.99% APR.", "APR as low as 6.99%.", "Rates starting at 6.99% APR."]) {
      const c = one(text)[0];
      expect([c.status, c.suggestion?.includes("8.99")], text).toEqual(["mismatch", true]);
    }
  });

  it("a stated maximum below the floor flags with no edit, and the corrected-looking result is never a match", () => {
    const wrong = one("The maximum APR is 6.99%.")[0];
    expect(wrong.status).toBe("mismatch");
    expect(wrong.suggestion).toBeNull();
    expect(wrong.message).toBe("The ad states a maximum APR of 6.99%. The APR range on the Winter Personal Loan offer from Nov 1, 2026 is 8.99% to 35.99%.");
    // What the old one-click edit produced:
    const edited = analyzeCopy("The maximum APR is 8.99%.", winter);
    expect(edited.checks[0].status).toBe("needs_reviewer");
    expect(edited.openFlags).toBe(1);
  });

  it("a stated maximum inside the range is held; the offer's own maximum matches", () => {
    expect(one("The maximum APR is 12.99%.")[0].status).toBe("needs_reviewer");
    expect(one("APR up to 12.99%.")[0].status).toBe("needs_reviewer");
    expect(one("Maximum APR is 35.99%.")[0].status).toBe("ok");
    expect(one("Rates from 8.99% to 35.99% APR.").map((c) => c.status)).toEqual(["ok", "ok"]);
  });

  it("a stated lowest rate that is not the offer's is held", () => {
    expect(one("Our lowest rate is 12.49% APR.")[0].status).toBe("needs_reviewer");
    expect(one("Everyone qualifies for our lowest rate of 8.99% APR.")[0].status).toBe("ok");
  });

  it("a low rate with no lead-in flags, with no edit", () => {
    const c = one("Your rate could be 6.99% APR.")[0];
    expect([c.status, c.suggestion]).toEqual(["mismatch", null]);
  });

  it("a rate above the ceiling flags, with no edit", () => {
    const c = one("APR up to 39.99%.")[0];
    expect([c.status, c.suggestion]).toEqual(["mismatch", null]);
  });

  it("an interest rate beside an APR is held, and nothing is offered as an edit", () => {
    const all = one("Interest rate 6.99%, APR 8.99%.");
    expect(all.every((c) => c.suggestion === null)).toBe(true);
    expect(all.some((c) => c.status === "mismatch")).toBe(false);
    expect(all.some((c) => c.status === "needs_reviewer")).toBe(true);
  });
});

// Round 6: a match means the figure equals the offer's term, read whole, in a sentence that says nothing more.
const checks = (text: string) => analyzeCopy(text, winter).checks;

describe("a rate is a match only when it equals the offer's lowest or highest APR", () => {
  const status = (t: string) => checks(t).map((c) => c.status);

  it("the offer's own figures still match, alone or as a range", () => {
    expect(status("Rates from 8.99% APR.")).toEqual(["ok"]);
    expect(status("ClearPath personal loans from 8.99% to 35.99% APR.")).toEqual(["ok", "ok"]);
    expect(status("Maximum APR is 35.99%.")).toEqual(["ok"]);
    expect(checks("Rates from 8.99% APR.")[0].message).toBe("8.99% APR is the lowest APR on the offer (8.99% to 35.99%).");
  });

  it("a false top of a range is held, however it is written", () => {
    for (const t of [
      "ClearPath personal loans from 8.99% to 15.99% APR.",
      "8.99% - 15.99% APR",
      "APR between 8.99% and 15.99%",
      "Rates never exceed 15.99% APR.",
      "12.99% APR maximum.",
      "Your rate could be 12.99% APR.",
    ]) {
      const c = checks(t);
      expect(c.some((x) => x.status === "needs_reviewer"), t).toBe(true);
      expect(c.filter((x) => x.claim.value === 15.99 || x.claim.value === 12.99).every((x) => x.status !== "ok"), t).toBe(true);
      expect(analyzeCopy(t, winter).openFlags, t).toBeGreaterThanOrEqual(1);
    }
  });

  it("a stated lowest rate that is not the offer's is held, with a lead-in or a label, before or after the figure", () => {
    for (const t of ["Rates from 12.99% APR.", "Rates as low as 12.99% APR.", "Rates from 35.99% APR.", "12.99% APR minimum."]) {
      expect(status(t), t).toEqual(["needs_reviewer"]);
    }
  });

  it("the offer's lowest rate stated as a maximum, or its highest stated as a minimum, is not a match", () => {
    expect(status("The maximum APR is 8.99%.")).toEqual(["needs_reviewer"]);
    expect(status("8.99% APR maximum.")).toEqual(["needs_reviewer"]);
    expect(status("35.99% APR minimum.")).toEqual(["needs_reviewer"]);
  });

  it("a rate outside the range is still a mismatch, and the lowest-rate edit is still offered", () => {
    expect(checks("Rates from 6.99% APR.")[0]).toMatchObject({ status: "mismatch", suggestion: "8.99% APR" });
    expect(checks("APR up to 39.99%.")[0]).toMatchObject({ status: "mismatch", suggestion: null });
  });
});

describe("a figure is read only as a whole number", () => {
  it("a leading decimal point, a longer number and a larger written-out number are held, never matched", () => {
    for (const t of ["Our APR is .12%.", "Our APR is 1012.99%.", "Our APR is 1,012.99%.", "One hundred twelve percent APR.", "One hundred and twelve percent APR.", "Twenty one hundred nine percent APR."]) {
      const a = analyzeCopy(t, winter);
      expect(a.checks.some((c) => c.status === "ok"), t).toBe(false);
      expect(a.openFlags, t).toBeGreaterThanOrEqual(1);
    }
  });

  it("the held quote is the number as written", () => {
    expect(checks("Our APR is .12%.").map((c) => c.claim.quote)).toEqual([".12%"]);
    expect(checks("Our APR is 1012.99%.").map((c) => c.claim.quote)).toEqual(["1012.99%"]);
  });

  it("ordinary figures are read as before", () => {
    expect(checks("APR 0.12%.")[0]).toMatchObject({ status: "mismatch" });
    expect(checks("Rates from six point nine nine percent APR.")[0].claim.value).toBe(6.99);
    expect(checks("Rates from eight point nine nine percent APR.")[0].status).toBe("ok");
    expect(checks("Twenty-one percent APR.")[0].claim.value).toBe(21);
  });
});

describe("a fee is a match, and an edit is offered, only when the sentence says nothing more", () => {
  it("the plain statements still match", () => {
    for (const t of ["A 2% origination fee applies.", "A 2% origination fee is charged.", "Origination fee of 2%.", "The origination fee is 2%.", "Just a 2% origination fee.", "With an origination fee of 2%."]) {
      expect(checks(t).find((c) => c.claim.kind === "fee")?.status, t).toBe("ok");
    }
  });

  it("a fee sentence that says more is held, though the figure is the offer's", () => {
    for (const t of ["A 2% origination fee applies for late payments.", "The 2% origination fee is waived for new customers.", "We never charge the 2% origination fee."]) {
      const c = checks(t);
      expect(c.some((x) => x.status === "ok"), t).toBe(false);
      expect(c.some((x) => x.status === "needs_reviewer"), t).toBe(true);
    }
  });

  it('"No fees for late payments" is flagged with no edit, so the one-click fix cannot write a false sentence', () => {
    const c = checks("No fees for late payments.");
    expect(c[0]).toMatchObject({ status: "mismatch", suggestion: null });
  });

  it("a no-fee claim that is the whole sentence keeps its edit", () => {
    expect(checks("No origination fee.")[0]).toMatchObject({ status: "mismatch", suggestion: "A 2% origination fee applies" });
    expect(checks("Rates from 8.99% APR. No fees!")[1]).toMatchObject({ status: "mismatch", suggestion: "A 2% origination fee applies" });
    expect(checks("Loans from 6.99% APR with no fees.").find((x) => x.claim.kind === "no_fee")).toMatchObject({ status: "mismatch", suggestion: null });
  });

  it("a wrong fee figure in a sentence that says more is flagged with no edit", () => {
    expect(checks("A 5% origination fee applies for late payments.")[0]).toMatchObject({ status: "mismatch", suggestion: null });
    expect(checks("A 5% origination fee applies.")[0]).toMatchObject({ status: "mismatch", suggestion: "2%" });
  });
});

describe("hidden characters are recognized by kind, not only from a list", () => {
  const kinds: Array<[string, string]> = [
    ["a variation selector", "\u{E0100}"],
    ["a control character", "\u0001"],
    ["delete", "\u007F"],
    ["a C1 control", "\u0080"],
    ["an interlinear annotation mark", "\uFFF9"],
    ["a Mongolian variation selector", "\u180F"],
    ["a musical format mark", "\u{1D173}"],
    ["a private-use character", "\uE000"],
    ["a line separator", "\u2028"],
  ];
  for (const [name, ch] of kinds) {
    it(`${name} is flagged, and a rate split by it is still read`, () => {
      const a = analyzeCopy(`Rates from 6.${ch}99% APR.`, winter);
      expect(a.hidden.map((h) => h.kind)).toEqual(["invisible"]);
      expect(a.mismatches).toBe(1);
    });
  }

  it("line breaks, tabs and ordinary spaces are not hidden text", () => {
    expect(findHiddenText("Rates from 8.99% APR.\nA 2% origination fee applies.\r\n\tApply today.")).toEqual([]);
    expect(findHiddenText("Rates from 8.99%\u00A0APR.")).toEqual([]);
  });
});

describe("a match needs wording that states it, not only the right figure (round 7)", () => {
  const status = (t: string, quote: string) => checks(t).find((c) => c.claim.quote.startsWith(quote))?.status;

  it("a fee is held when anything else is in its sentence, and no edit is offered", () => {
    for (const t of [
      "Only returning borrowers pay a 2% origination fee.",
      "If you are a returning borrower, a 2% origination fee applies.",
      "Rates from 8.99% APR with a 2% origination fee.",
    ]) {
      expect(status(t, "2%"), t).toBe("needs_reviewer");
    }
    const wrong = checks("Only returning borrowers pay a 1% origination fee.")[0];
    expect(wrong).toMatchObject({ status: "mismatch", suggestion: null });
  });

  it("the offer's lowest or highest rate is held unless the ad states it as that end", () => {
    for (const [t, quote] of [
      ["Our APR never exceeds 8.99%.", "8.99%"],
      ["APR is at least 35.99%.", "35.99%"],
      ["8.99% APR.", "8.99%"],
      ["35.99% APR.", "35.99%"],
      ["APR is never as low as 8.99%.", "8.99%"],
      ["Rates are not from 8.99% APR.", "8.99%"],
      ["APR between 8.99% and 35.99%.", "35.99%"],
    ]) {
      expect(status(t, quote), t).toBe("needs_reviewer");
    }
    expect(checks("Our APR never exceeds 8.99%.")[0].message).toMatch(/could not read the ad's wording as stating it as the lowest rate/);
  });

  it("stated as the lowest, as the highest, or as the two ends of a range, it still matches", () => {
    for (const [t, quote] of [
      ["Rates from 8.99% APR.", "8.99%"],
      ["Rates as low as 8.99% APR.", "8.99%"],
      ["ClearPath personal loans start at 8.99% APR.", "8.99%"],
      ["The lowest APR is 8.99%.", "8.99%"],
      ["Rates up to 35.99% APR.", "35.99%"],
      ["The maximum APR is 35.99%.", "35.99%"],
      ["APR from 8.99% to 35.99%.", "8.99%"],
      ["APR from 8.99% to 35.99%.", "35.99%"],
      ["8.99% - 35.99% APR", "8.99%"],
      ["8.99% - 35.99% APR", "35.99%"],
    ]) {
      expect(status(t, quote), t).toBe("ok");
    }
  });

  it("a suggested edit never carries a hidden character or half a number into the ad", () => {
    const c = checks("Rates from 6.\u200B99% APR.").find((x) => x.status === "mismatch");
    expect(c?.suggestion).toBe("8.99% APR");
    expect(checks("Rates from 6.99% APR.")[0].suggestion).toBe("8.99% APR");
    expect(checks("Just a 1% origination fee.")[0].suggestion).toBe("2%");
  });
});

describe("a match depends on the shape of the sentence too (round 8)", () => {
  const greens = (t: string) => checks(t).filter((c) => c.status === "ok").length;
  const edits = (t: string) => checks(t).filter((c) => c.suggestion).length;

  it("a rate is held when the sentence goes on after the figure", () => {
    for (const t of [
      "Rates from 8.99% APR for the first six months.",
      "Rates from 8.99% APR if you apply today.",
      "Rates from 8.99% APR are a thing of the past.",
      "Rates rise from 8.99% APR to 35.99% APR after six months.",
      "You could save up to 35.99% on our APR.",
      "Rates from 8.99% APR, with a 2% origination fee.",
    ]) {
      expect(greens(t), t).toBe(0);
    }
  });

  it("no edit is offered on a wrong rate when the sentence goes on, denies it, or asks", () => {
    for (const t of [
      "Rates from 6.99% APR are unavailable.",
      "Rates from 6.99% APR for the first year only.",
      "Rates are not from 6.99% APR.",
      "Rates from 6.99% APR?",
    ]) {
      expect(edits(t), t).toBe(0);
      expect(checks(t).some((c) => c.status === "mismatch"), t).toBe(true);
    }
    expect(edits("Rates from 6.99% APR.")).toBe(1);
  });

  it("a contraction of not, or cannot, before the figure holds it", () => {
    for (const t of [
      "Our rates don't start at 8.99% APR.",
      "Your APR can't go up to 35.99%.",
      "Rates won't be as low as 8.99% APR.",
      "Rates cannot start at 8.99% APR.",
      "Our rates don\u2019t start at 8.99% APR.",
    ]) {
      expect(greens(t), t).toBe(0);
    }
  });

  it("a question is never a match", () => {
    for (const t of ["Rates from 8.99% APR? Not here.", "A 2% origination fee?", "No origination fee?"]) {
      expect(greens(t), t).toBe(0);
      expect(edits(t), t).toBe(0);
    }
  });

  it("a claim split over two lines is one sentence: no edit, no match", () => {
    const late = checks("No fees\nfor late payments");
    expect(late[0]).toMatchObject({ status: "mismatch", suggestion: null });
    const returning = checks("A 1% origination fee applies\nonly to returning borrowers.");
    expect(returning[0]).toMatchObject({ status: "mismatch", suggestion: null });
    expect(greens("A 2% origination fee applies\nonly to returning borrowers.")).toBe(0);
    expect(greens("Rates from 8.99% APR\nfor the first six months")).toBe(0);
  });

  it("lines that end in punctuation, or are split by a blank line, are still separate sentences", () => {
    expect(greens("Rates from 8.99% APR.\nA 2% origination fee applies.")).toBe(2);
    expect(greens("Rates from 8.99% APR\n\nA 2% origination fee applies")).toBe(2);
    expect(checks("Great loans.\nNo origination fee.").find((c) => c.claim.kind === "no_fee")?.suggestion).toBe("A 2% origination fee applies");
  });

  it("a figure with a minus sign is held, and the dash of a range is not a minus sign", () => {
    const signed = analyzeCopy("The minimum APR is -8.99%.", winter);
    expect(signed.checks.some((c) => c.status === "ok")).toBe(false);
    expect(signed.checks.every((c) => c.status === "needs_reviewer")).toBe(true);
    expect(greens("8.99%-35.99% APR")).toBe(2);
    expect(greens("8.99% - 35.99% APR")).toBe(2);
  });

  it('"may apply" is weaker than the offer, so it is held', () => {
    expect(checks("A 2% origination fee may apply.")[0].status).toBe("needs_reviewer");
  });

  it("with no fee on the offer, a no-fee claim is a match only when the sentence says nothing more", () => {
    const free = { ...winter, feePct: 0 };
    expect(analyzeCopy("No origination fee.", free).checks[0].status).toBe("ok");
    expect(analyzeCopy("No origination fee unless you refinance.", free).checks[0].status).toBe("needs_reviewer");
  });

  it("a comma before the figure means a clause came first: held, and no edit (round 9)", () => {
    for (const t of [
      "If you have an 800 credit score, rates start at 8.99% APR.",
      "For existing VIP members only, APR is as low as 8.99%.",
      "Unless you miss a payment, rates are from 8.99% APR.",
      "Except in Texas and California, rates start at 8.99% APR.",
      "Competitors charge 24.99%, while our rates start at 8.99% APR.",
      "In theory, rates start at 8.99% APR.",
    ]) {
      expect(greens(t), t).toBe(0);
    }
    expect(edits("If you qualify, rates from 6.99% APR.")).toBe(0);
    // The comma inside a number is not a clause.
    expect(greens("Borrow $5,000 or more with rates from 8.99% APR.")).toBe(1);
  });

  it("a colon or a semicolon at the end of a line does not end the sentence (round 9)", () => {
    for (const t of [
      "Rates from 8.99% APR:\nOnly for 12-month secured loans.",
      "Rates from 8.99% APR;\nAdjusts monthly thereafter.",
      "A 2% origination fee applies:\nUnless waived for autopay borrowers.",
      "A 2% origination fee is charged;\nPlus a 5% application fee.",
    ]) {
      expect(greens(t), t).toBe(0);
    }
  });

  it("an ad pasted as a list is held line by line: not red, not green (round 10)", () => {
    // What each figure is comes from its own line: the fee is a fee, not an APR.
    const two = checks("Rates from 8.99% APR\n2% origination fee");
    expect(two.map((c) => [c.claim.kind, c.status])).toEqual([["apr", "needs_reviewer"], ["fee", "needs_reviewer"]]);
    const four = checks("ClearPath Personal Loans\nRates from 8.99% APR\n2% origination fee\nApply today");
    expect(four.some((c) => c.status === "mismatch")).toBe(false);
    expect(four.some((c) => c.status === "ok")).toBe(false);
    // "100% online" on its own line is not read as an APR because another line mentions rates.
    const online = checks("Fast funding\n100% online\nRates from 8.99% APR");
    expect(online.some((c) => c.status === "mismatch")).toBe(false);
    // Each amber line quotes its own line, not the whole ad.
    expect(two.every((c) => !c.claim.quote.includes("\n"))).toBe(true);
    // With a full stop on each line, or a blank line between them, each line is its own sentence.
    expect(greens("Rates from 8.99% APR.\nA 2% origination fee applies.")).toBe(2);
    expect(greens("Rates from 8.99% APR\n\nA 2% origination fee applies")).toBe(2);
    // A wrong fee on its own line is still flagged, as a fee.
    const wrong = checks("Rates from 8.99% APR\n1% origination fee");
    expect(wrong.find((c) => c.claim.kind === "fee")).toMatchObject({ status: "mismatch", suggestion: null });
  });

  it('"?!" ends a question too (round 10)', () => {
    for (const t of ["Rates from 8.99% APR?!", "A 2% origination fee applies?!", "Rates from 8.99% APR!?"]) {
      expect(greens(t), t).toBe(0);
    }
    expect(edits("Rates from 6.99% APR?!")).toBe(0);
  });

  it("what is read around a figure stays on its own line or in its own statement (round 11)", () => {
    // A headline above a blank line says nothing about a rate in the next paragraph.
    expect(edits("6.99% APR.")).toBe(0);
    expect(edits("Two options to choose from\n\n6.99% APR.")).toBe(0);
    const amount = checks("Borrow up to $5,000\n\nRates from 8.99% APR.");
    expect(amount.map((c) => c.status)).toEqual(["ok"]);
    // The dash that starts a bulleted line is not the dash of a range.
    expect(greens("- 8.99% APR\n- 35.99% APR")).toBe(0);
    expect(greens("8.99% APR -\n35.99% APR")).toBe(0);
    expect(greens("8.99% - 35.99% APR")).toBe(2);
    // "APR" on the next line is not this figure's label.
    const table = checks("Interest rate: 7.00%\nAPR: 8.99%");
    expect(table.filter((c) => c.status === "mismatch")).toHaveLength(0);
    expect(table.some((c) => /7\.00% APR/.test(c.message))).toBe(false);
    const split = checks("Rates from 8.99%\nAPR.");
    expect(split.every((c) => c.status === "needs_reviewer")).toBe(true);
    expect(split.some((c) => /unusual characters/.test(c.message))).toBe(false);
    // Nor is "Maximum" on the next line.
    const next = checks("Rates from 8.99% APR\nMaximum loan amount $50,000");
    expect(next.some((c) => /states a maximum APR/.test(c.message))).toBe(false);
    expect(next.filter((c) => c.status === "ok")).toHaveLength(0);
  });

  it("an amber message says what was held (round 11, wording only)", () => {
    const both = checks("Borrow up to $50,000 with rates from 8.99% APR.").find((c) => c.claim.kind === "apr")!;
    expect(both.status).toBe("needs_reviewer");
    expect(both.message).not.toMatch(/states a maximum APR/);
    for (const c of checks("Rates from 8.99% APR\n2% origination fee")) {
      expect(c.status).toBe("needs_reviewer");
      expect(c.message).toMatch(/says more than that, on this line or the next/);
    }
    // A stated maximum that is not the offer's keeps its own message.
    expect(checks("The maximum APR is 12.99%.")[0].message).toMatch(/states a maximum APR of 12\.99%/);
  });

  it("what a shape rule cannot see is still a match: stated as a limit in the README", () => {
    // Kept as tests so the limit is written down where the code is, not discovered.
    // The last line of a list has nothing after it, so a plain rate there is a match.
    expect(greens("2% origination fee\nRates from 8.99% APR")).toBe(1);
    expect(greens("A 2% origination fee applies. Only on your second loan.")).toBe(1);
    expect(greens("Nobody pays rates from 8.99% APR.")).toBe(1);
    expect(greens("Rates after the introductory period are from 8.99% APR.")).toBe(1);
    expect(greens("Promotional teaser rates from 8.99% APR.")).toBe(1);
  });

  it("two red false alarms on true ads: stated as a limit in the README", () => {
    // A fee straight after "APR" on the same line: nearness is counted from the start of the figure.
    expect(checks("Rates from 8.99% APR, 2% origination fee.").some((c) => c.status === "mismatch" && /2\.00% APR/.test(c.message))).toBe(true);
    expect(checks("Rates from 8.99% APR. A 2% origination fee applies.").every((c) => c.status === "ok")).toBe(true);
    // A fee whose name wraps to the next line is read on its own line, where only "rates" is.
    expect(checks("Enjoy low rates and a 2%\norigination fee.").some((c) => c.status === "mismatch" && /2\.00% APR/.test(c.message))).toBe(true);
  });
});
