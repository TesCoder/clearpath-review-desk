// Which AI findings are shown beside the code checks. Shared by the review
// screen and the queue, so the two never disagree about what is left to read.

import type { Claim } from "../checks";
import type { AiFinding, AiReview } from "./types";

/**
 * A finding is left out only when it is a short rate or fee finding about the
 * same words a code check already covers. Anything longer or of another kind
 * is shown, so a claim such as "Guaranteed approval at 6.99% APR" is never
 * hidden by the number inside it.
 */
export function findingsBeyondChecks(review: AiReview | null, claims: Claim[]): AiFinding[] {
  const sameWords = (f: AiFinding) =>
    (f.kind === "rate" || f.kind === "fee") &&
    claims.some((c) => f.start < c.end && c.start < f.end && f.end - f.start <= c.end - c.start + 30);
  return (review?.findings ?? []).filter((f) => !sameWords(f));
}

/** What the queue says about the AI's read of an ad. */
export type AiSummary =
  | { state: "not_run" }
  | { state: "incomplete"; toRead: number }
  | { state: "read"; toRead: number };

export function summarizeAi(review: AiReview | null, claims: Claim[]): AiSummary {
  if (!review) return { state: "not_run" };
  const toRead = findingsBeyondChecks(review, claims).length;
  return review.status === "incomplete" ? { state: "incomplete", toRead } : { state: "read", toRead };
}
