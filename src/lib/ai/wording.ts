// What the marketer is shown when they check a draft's wording before
// submitting. It is the reviewer's AI read of the same text, through the same
// pipeline (review.ts), shown with the same rule for which findings appear
// (display.ts). It is advice: nothing here can stop a submission, approve an
// ad, or change what the reviewer sees.

import type { Check } from "../checks";
import { findingsBeyondChecks } from "./display";
import type { AiReview, FindingKind } from "./types";

export type WordingNote = { quote: string; start: number; end: number; kind: FindingKind; why: string; suggestion: string };

export type WordingResult = {
  /**
   * notes: the AI pointed at wording in the draft.
   * nothing: it answered and pointed at nothing. Never worded as "fine".
   * incomplete: its answer cannot be read as a full account of the draft.
   * unavailable: it did not run.
   */
  state: "notes" | "nothing" | "incomplete" | "unavailable";
  notes: WordingNote[];
  reason: string | null;
  /** The model's own report that the draft contains text addressed to an AI or to the reviewer. */
  addressesReviewer: boolean;
};

export function wordingResult(review: AiReview, checks: Check[]): WordingResult {
  const notes: WordingNote[] = findingsBeyondChecks(review, checks).map((f) => ({
    quote: f.quote,
    start: f.start,
    end: f.end,
    kind: f.kind,
    why: f.why,
    suggestion: f.suggestedComment,
  }));
  const state =
    review.status === "unavailable" ? "unavailable" : review.status === "incomplete" ? "incomplete" : notes.length ? "notes" : "nothing";
  return {
    state,
    notes: state === "unavailable" ? [] : notes,
    reason: review.reason,
    addressesReviewer: review.addressesReviewer,
  };
}

/** What is kept with a submitted version when its exact text went through the wording check first. */
export type WordingRecord = { state: "notes" | "nothing" | "incomplete"; notes: number };

/** The sentence the reviewer reads about it. */
export function wordingRecordText(record: WordingRecord): string {
  const n = record.notes;
  const lead = "The marketer ran the AI wording check on this exact text before submitting.";
  const count = `${n} note${n === 1 ? "" : "s"}`;
  if (record.state === "incomplete") {
    return `${lead} The check was incomplete${n ? ` and showed ${count}` : ""}, and the ad was submitted as it is.`;
  }
  if (n === 0) return `${lead} It pointed at nothing in the wording.`;
  return `${lead} It showed ${count}, and the ad was submitted as it is.`;
}
