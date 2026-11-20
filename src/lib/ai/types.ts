// What the claim-finding model is asked for, and what the app keeps after
// checking it. The model only suggests. It cannot approve, reject or change
// anything, and it has no tools.

export const FINDING_KINDS = [
  "rate",
  "fee",
  "approval_or_eligibility",
  "credit_impact",
  "speed",
  "savings_or_comparison",
  "superlative",
  "other",
] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

/** One raw finding as the model returns it. */
export type ModelFinding = {
  quote: string;
  kind: FindingKind;
  why: string;
  suggested_comment: string;
};

export type ModelOutput = {
  findings: ModelFinding[];
  /** The model's own report that the copy contains text addressed to an AI or a reviewer. */
  copy_addresses_reviewer: boolean;
};

export type ModelFailure = "refusal" | "truncated" | "invalid" | "unavailable" | "not_configured";

export class ModelError extends Error {
  constructor(
    public readonly failure: ModelFailure,
    message: string,
  ) {
    super(message);
  }
}

export type ModelRequest = { system: string; user: string };

/** The seam tests use to put a fake model in place of the real one. */
export type ClaimModel = { name: string; find(request: ModelRequest): Promise<ModelOutput> };

/** A finding that survived the word-for-word quote check. */
export type AiFinding = {
  quote: string;
  start: number;
  end: number;
  kind: FindingKind;
  why: string;
  suggestedComment: string;
};

export type AiReview = {
  /**
   * complete: the model answered and every quote it cited is in the copy.
   * incomplete: the model failed, cited words that are not in the copy, or
   *   left out a claim the code check found. Never shown as "no issues".
   * unavailable: the model could not be reached or is not set up.
   */
  status: "complete" | "incomplete" | "unavailable";
  findings: AiFinding[];
  /** Findings dropped because their quote is not in the copy. */
  dropped: number;
  /** Explicit rate or fee claims the code found that the model did not report. */
  missedByModel: string[];
  reason: string | null;
  model: string;
};

export const PROMPT_VERSION = "2026-11-20.1";
