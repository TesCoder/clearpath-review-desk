// Which AI findings are shown beside the code checks. Shared by the review
// screen and the queue, so the two never disagree about what is left to read.

import type { Check } from "../checks";
import type { AiFinding, AiReview } from "./types";

/**
 * A finding is left out only when the code check has already flagged the same
 * words as not matching the offer: the reviewer is being shown that problem in
 * red, and a second row would repeat it. In every other case the finding is
 * shown, including when it quotes a figure the code check passed. A number
 * inside the offer's range can still be a false claim ("The maximum APR is
 * 12.99%"), and the code check only establishes that it is inside the range.
 */
export function findingsBeyondChecks(review: AiReview | null, checks: Check[]): AiFinding[] {
  const alreadyFlagged = (f: AiFinding) =>
    (f.kind === "rate" || f.kind === "fee") &&
    checks.some(
      (c) =>
        c.status === "mismatch" &&
        f.start < c.claim.end &&
        c.claim.start < f.end &&
        f.end - f.start <= c.claim.end - c.claim.start + 30,
    );
  return (review?.findings ?? []).filter((f) => !alreadyFlagged(f));
}

/** What the queue says about the AI's read of an ad. */
export type AiSummary =
  | { state: "not_run" }
  | { state: "incomplete"; toRead: number }
  | { state: "read"; toRead: number };

export function summarizeAi(review: AiReview | null, checks: Check[]): AiSummary {
  if (!review) return { state: "not_run" };
  const toRead = findingsBeyondChecks(review, checks).length;
  return review.status === "incomplete" ? { state: "incomplete", toRead } : { state: "read", toRead };
}
