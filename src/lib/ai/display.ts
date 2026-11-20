// Which AI findings are shown beside the code checks. Shared by the review
// screen and the queue, so the two never disagree about what is left to read.

import type { Check } from "../checks";
import type { AiFinding, AiReview } from "./types";

/**
 * A finding is left out only when it says nothing beyond a flag already on
 * screen: it is a rate or fee finding, and every letter and digit it quotes
 * is inside words the code check has flagged as not matching the offer. The
 * reviewer is being shown that figure in red, and a second row would repeat
 * it. Punctuation around the figure does not count ("6.99% APR.").
 *
 * In every other case the finding is shown. That includes a finding that
 * quotes a flagged figure together with any other word ("6.99% for life"):
 * the other words may be a separate promise the number check knows nothing
 * about. It also includes a finding on a figure the code check passed: a
 * number inside the offer's range can still be a false claim ("The maximum
 * APR is 12.99%"). No list of harmless words is kept here, so the cost is a
 * repeated row when the AI quotes the lead-in too ("Rates from 6.99% APR").
 *
 * Rule changes: 2. Each one showed more and hid less.
 */
export function findingsBeyondChecks(review: AiReview | null, checks: Check[]): AiFinding[] {
  const flagged = checks.filter((c) => c.status === "mismatch").map((c) => c.claim);
  const inFlagged = (at: number) => flagged.some((c) => at >= c.start && at < c.end);
  const alreadyFlagged = (f: AiFinding) => {
    if (f.kind !== "rate" && f.kind !== "fee") return false;
    let inside = 0;
    for (let i = 0; i < f.quote.length; i++) {
      if (inFlagged(f.start + i)) inside++;
      else if (/[\p{L}\p{N}]/u.test(f.quote[i])) return false; // a word the red flag does not cover
    }
    return inside > 0;
  };
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
