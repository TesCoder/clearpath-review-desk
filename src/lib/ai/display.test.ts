import { describe, expect, it } from "vitest";
import { findClaims } from "../checks";
import { findingsBeyondChecks, summarizeAi } from "./display";
import type { AiFinding, AiReview } from "./types";

const COPY = "Everyone qualifies for our lowest rate of 8.99% APR.";
const claims = findClaims(COPY); // one claim: "8.99% APR", which matches the offer

function finding(quote: string, kind: AiFinding["kind"]): AiFinding {
  const start = COPY.indexOf(quote);
  return { quote, start, end: start + quote.length, kind, why: "w", suggestedComment: "c" };
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
  it("the code check reads the rate in this sentence", () => {
    expect(claims.map((c) => c.quote)).toEqual(["8.99% APR"]);
  });

  it("keeps an eligibility warning that quotes the whole sentence", () => {
    const f = finding(COPY, "approval_or_eligibility");
    expect(findingsBeyondChecks(review([f]), claims)).toEqual([f]);
  });

  it("keeps an eligibility warning that quotes the short phrase", () => {
    const f = finding("Everyone qualifies", "approval_or_eligibility");
    expect(findingsBeyondChecks(review([f]), claims)).toEqual([f]);
  });

  it("keeps a speed, savings or other finding on the same words as the rate", () => {
    for (const kind of ["speed", "savings_or_comparison", "superlative", "other", "credit_impact"] as const) {
      const f = finding("lowest rate of 8.99% APR", kind);
      expect(findingsBeyondChecks(review([f]), claims), kind).toEqual([f]);
    }
  });

  it("leaves out only a short rate finding about the same figure the code already checked", () => {
    expect(findingsBeyondChecks(review([finding("8.99% APR", "rate")]), claims)).toEqual([]);
    expect(findingsBeyondChecks(review([finding("rate of 8.99% APR", "rate")]), claims)).toEqual([]);
  });

  it("keeps a rate finding that quotes far more than the figure", () => {
    const f = finding(COPY, "rate");
    expect(findingsBeyondChecks(review([f]), claims)).toEqual([f]);
  });
});

describe("what the queue says about the AI's read", () => {
  it("says so when the AI has not run", () => {
    expect(summarizeAi(null, claims)).toEqual({ state: "not_run" });
  });

  it("counts findings beyond the code checks", () => {
    const r = review([finding("Everyone qualifies", "approval_or_eligibility"), finding("8.99% APR", "rate")]);
    expect(summarizeAi(r, claims)).toEqual({ state: "read", toRead: 1 });
  });

  it("carries an incomplete review through", () => {
    expect(summarizeAi(review([], "incomplete"), claims)).toEqual({ state: "incomplete", toRead: 0 });
  });
});
