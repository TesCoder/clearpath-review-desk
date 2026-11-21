import { describe, expect, it } from "vitest";
import { analyzeCopy, type OfferTerms } from "../checks";
import { findingsBeyondChecks, summarizeAi } from "./display";
import type { AiFinding, AiReview } from "./types";

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

function setup(copy: string) {
  const checks = analyzeCopy(copy, terms).checks;
  const finding = (quote: string, kind: AiFinding["kind"]): AiFinding => {
    const start = copy.indexOf(quote);
    return { quote, start, end: start + quote.length, kind, why: "w", suggestedComment: "c" };
  };
  return { checks, finding };
}
const review = (findings: AiFinding[], status: AiReview["status"] = "complete"): AiReview => ({
  status,
  findings,
  dropped: 0,
  missedByModel: [],
  reason: null,
  model: "fake",
  addressesReviewer: false,
  answered: true,
});

describe("an AI warning is not hidden by a number it overlaps", () => {
  const COPY = "Everyone qualifies for our lowest rate of 8.99% APR.";
  const { checks, finding } = setup(COPY);

  it("the code check passes the rate in this sentence", () => {
    expect(checks.map((c) => [c.claim.quote, c.status])).toEqual([["8.99% APR", "ok"]]);
  });

  it("keeps an eligibility warning, quoting the whole sentence or the short phrase", () => {
    for (const quote of [COPY, "Everyone qualifies"]) {
      const f = finding(quote, "approval_or_eligibility");
      expect(findingsBeyondChecks(review([f]), checks), quote).toEqual([f]);
    }
  });

  it("keeps a speed, savings or other finding on the same words as the rate", () => {
    for (const kind of ["speed", "savings_or_comparison", "superlative", "other", "credit_impact"] as const) {
      const f = finding("lowest rate of 8.99% APR", kind);
      expect(findingsBeyondChecks(review([f]), checks), kind).toEqual([f]);
    }
  });

  it("keeps a rate finding on a figure the code check passed: the AI may know more than range membership", () => {
    const f = finding("8.99% APR", "rate");
    expect(findingsBeyondChecks(review([f]), checks)).toEqual([f]);
  });
});

describe("a stated maximum inside the range", () => {
  const COPY = "The maximum APR is 12.99%.";
  const { checks, finding } = setup(COPY);

  it("the AI's warning about the maximum is shown, and the queue counts it", () => {
    const f = finding(COPY, "rate");
    expect(findingsBeyondChecks(review([f]), checks)).toEqual([f]);
    expect(summarizeAi(review([f]), checks)).toEqual({ state: "read", toRead: 1 });
    const short = finding("12.99%", "rate");
    expect(findingsBeyondChecks(review([short]), checks)).toEqual([short]);
  });

  it("the code check itself holds that figure for the reviewer", () => {
    expect(checks.map((c) => c.status)).toEqual(["needs_reviewer"]);
  });
});

describe("the one case a finding is left out", () => {
  const COPY = "Rates from 6.99% APR.";
  const { checks, finding } = setup(COPY);

  it("a rate finding whose words are all inside the figure the code check already flags in red", () => {
    expect(checks[0].status).toBe("mismatch");
    expect(checks[0].claim.quote).toBe("6.99% APR");
    expect(findingsBeyondChecks(review([finding("6.99% APR", "rate")]), checks)).toEqual([]);
    expect(findingsBeyondChecks(review([finding("6.99%", "rate")]), checks)).toEqual([]);
    // Punctuation around the figure is not a word: the model often quotes the full stop.
    expect(findingsBeyondChecks(review([finding("6.99% APR.", "rate")]), checks)).toEqual([]);
  });

  it("the same for a fee: the live model's quote of the hero ad's second version", () => {
    const v2 = setup("Compare ClearPath personal loans. Rates from 8.99% APR. No origination fee.");
    expect(v2.checks.find((c) => c.status === "mismatch")?.claim.quote).toBe("No origination fee");
    expect(findingsBeyondChecks(review([v2.finding("No origination fee.", "fee")]), v2.checks)).toEqual([]);
    const more = v2.finding("Rates from 8.99% APR. No origination fee.", "fee");
    expect(findingsBeyondChecks(review([more]), v2.checks)).toEqual([more]);
  });

  it("a finding made only of punctuation outside any flag is not treated as a repeat", () => {
    const dot = { quote: ".", start: COPY.length - 1, end: COPY.length, kind: "rate" as const, why: "w", suggestedComment: "c" };
    expect(findingsBeyondChecks(review([dot]), checks)).toEqual([dot]);
  });

  it("but not a finding that quotes more than the flagged words: it is shown, at the cost of a repeated row", () => {
    const f = finding("Rates from 6.99% APR", "rate");
    expect(findingsBeyondChecks(review([f]), checks)).toEqual([f]);
  });

  it("and not a finding of another kind on the same words", () => {
    const f = finding("6.99% APR", "other");
    expect(findingsBeyondChecks(review([f]), checks)).toEqual([f]);
  });
});

describe("a separate promise beside a flagged figure", () => {
  // The number is wrong, and "for life" is a second claim the number check knows nothing about.
  const COPY = "Fixed APR from 6.99% for life.";
  const { checks, finding } = setup(COPY);

  it("the code check flags the rate against the floor", () => {
    expect(checks.filter((c) => c.status === "mismatch").length).toBe(1);
  });

  it("an AI note that overlaps the flagged figure is shown beside it, and the queue counts it", () => {
    const flagged = checks.find((c) => c.status === "mismatch")!.claim.quote;
    for (const quote of ["6.99% for life", "APR from 6.99% for life", COPY, "for life", "Fixed APR from 6.99%"]) {
      if (quote === flagged) continue;
      for (const kind of ["rate", "fee", "other", "savings_or_comparison"] as const) {
        const f = finding(quote, kind);
        expect(findingsBeyondChecks(review([f]), checks), `${quote} as ${kind}`).toEqual([f]);
        expect(summarizeAi(review([f]), checks), `${quote} as ${kind}`).toEqual({ state: "read", toRead: 1 });
      }
    }
  });

  it("the other words still count when they are written in styled letters, another script, a symbol or an emoji", () => {
    for (const tail of ["\u{1D5F3}\u{1D5FC}\u{1D5FF} \u{1D5F9}\u{1D5F6}\u{1D5F3}\u{1D5F2}", "навсегда", "永久", "\u{1F512}", "+ $0", "\u2122"]) {
      const copy = `Rates from 6.99% APR ${tail}.`;
      const s = setup(copy);
      expect(s.checks.find((c) => c.status === "mismatch")?.claim.quote, tail).toBe("6.99% APR");
      const f = s.finding(`6.99% APR ${tail}`, "rate");
      expect(findingsBeyondChecks(review([f]), s.checks), tail).toEqual([f]);
    }
  });

  it("both are on screen together: the mismatch from code and the note from the AI", () => {
    const note = finding("6.99% for life", "rate");
    const duplicate = finding(checks.find((c) => c.status === "mismatch")!.claim.quote, "rate");
    expect(findingsBeyondChecks(review([duplicate, note]), checks)).toEqual([note]);
    expect(checks.some((c) => c.status === "mismatch")).toBe(true);
  });
});

describe("what the queue says about the AI's read", () => {
  const { checks, finding } = setup("Everyone qualifies for our lowest rate of 8.99% APR.");

  it("says so when the AI has not run", () => {
    expect(summarizeAi(null, checks)).toEqual({ state: "not_run" });
  });

  it("counts every finding that is shown", () => {
    const r = review([finding("Everyone qualifies", "approval_or_eligibility"), finding("8.99% APR", "rate")]);
    expect(summarizeAi(r, checks)).toEqual({ state: "read", toRead: 2 });
  });

  it("carries an incomplete review through", () => {
    expect(summarizeAi(review([], "incomplete"), checks)).toEqual({ state: "incomplete", toRead: 0 });
  });
});
