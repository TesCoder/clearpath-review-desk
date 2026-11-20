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

  it("a short rate finding on a figure the code check already flags in red", () => {
    expect(checks[0].status).toBe("mismatch");
    expect(findingsBeyondChecks(review([finding("6.99% APR", "rate")]), checks)).toEqual([]);
    expect(findingsBeyondChecks(review([finding("Rates from 6.99% APR", "rate")]), checks)).toEqual([]);
  });

  it("but not a finding of another kind on the same words", () => {
    const f = finding("Rates from 6.99% APR", "other");
    expect(findingsBeyondChecks(review([f]), checks)).toEqual([f]);
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
