// Where an ad stands, derived from its versions and decisions. Nothing stores
// a status column: the status is always computed from what was decided on.

export type DecisionKind = "approve" | "request_changes";

export type DecisionRecord = {
  versionNumber: number;
  kind: DecisionKind;
  fingerprint: string;
  offerRevisionId: string;
  plannedDate: string; // YYYY-MM-DD
  placement: string;
  createdAt: string; // ISO time
};

export type AssetState = {
  latestVersion: { number: number; fingerprint: string };
  plannedDate: string;
  placement: string;
  /** The offer revision in effect on the planned date, or null if none. */
  currentRevisionId: string | null;
  decisions: DecisionRecord[];
};

export type AssetStatus =
  | "new" // first version, no decision yet
  | "revised" // a newer version answers a request for changes
  | "edited_after_approval" // an approved ad was edited: the new version needs review
  | "rescheduled" // approved, then the date or placement moved
  | "offer_changed" // approved, then a new offer revision took effect for its date
  | "changes_requested" // waiting for the marketer
  | "approved";

export const STATUS_LABEL: Record<AssetStatus, string> = {
  new: "New, waiting for review",
  revised: "Revised, waiting for review",
  edited_after_approval: "Edited after approval, needs review",
  rescheduled: "Rescheduled placement needs review",
  offer_changed: "Offer changed after approval, needs review",
  changes_requested: "Changes requested",
  approved: "Approved",
};

/** Statuses that are the reviewer's turn. */
export const REVIEWER_TURN: AssetStatus[] = ["new", "revised", "edited_after_approval", "rescheduled", "offer_changed"];

function latestFor(decisions: DecisionRecord[], versionNumber: number): DecisionRecord | null {
  const own = decisions
    .filter((d) => d.versionNumber === versionNumber)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return own.length ? own[own.length - 1] : null;
}

/** True when an approval still covers exactly what would be published. */
export function approvalHolds(decision: DecisionRecord, state: AssetState): boolean {
  return (
    decision.kind === "approve" &&
    decision.versionNumber === state.latestVersion.number &&
    decision.fingerprint === state.latestVersion.fingerprint &&
    decision.plannedDate === state.plannedDate &&
    decision.placement === state.placement &&
    decision.offerRevisionId === state.currentRevisionId
  );
}

export function deriveStatus(state: AssetState): AssetStatus {
  const last = latestFor(state.decisions, state.latestVersion.number);
  if (last) {
    if (last.kind === "request_changes") return "changes_requested";
    if (approvalHolds(last, state)) return "approved";
    // Nothing about the ad moved: same words, date and placement. Only the
    // offer terms for that date are no longer the ones it was approved against.
    const onlyOfferMoved =
      last.fingerprint === state.latestVersion.fingerprint &&
      last.plannedDate === state.plannedDate &&
      last.placement === state.placement;
    return onlyOfferMoved ? "offer_changed" : "rescheduled";
  }
  const earlierApproval = state.decisions.some(
    (d) => d.kind === "approve" && d.versionNumber < state.latestVersion.number,
  );
  if (earlierApproval) return "edited_after_approval";
  return state.latestVersion.number > 1 ? "revised" : "new";
}

/** The most recent approval of any version, kept visible after edits and moves. */
export function lastApproval(state: AssetState): DecisionRecord | null {
  const approvals = state.decisions
    .filter((d) => d.kind === "approve")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return approvals.length ? approvals[approvals.length - 1] : null;
}

export type Role = "reviewer" | "marketer";

export type DecisionAttempt = {
  role: Role;
  kind: DecisionKind;
  /** The version number the reviewer was looking at. */
  versionNumber: number;
  /** The fingerprint shown on the reviewer's screen. */
  fingerprint: string;
  /** The date, placement and offer revision shown on the reviewer's screen. */
  plannedDate: string;
  placement: string;
  offerRevisionId: string;
};

/**
 * The server's rule for a decision. Returns null when allowed, or the reason
 * it is refused. The page hiding a button is not what enforces this.
 */
export function refuseDecision(attempt: DecisionAttempt, state: AssetState): string | null {
  if (attempt.role !== "reviewer") {
    return "Only a compliance reviewer can approve or request changes.";
  }
  if (attempt.versionNumber !== state.latestVersion.number) {
    return "A newer version of this ad was submitted. Review the latest version.";
  }
  if (attempt.fingerprint !== state.latestVersion.fingerprint) {
    return "The ad text changed since this page was loaded. Reload and review the current text.";
  }
  if (!state.currentRevisionId) {
    return "No offer terms are in effect on the planned publication date, so there is nothing to check this ad against.";
  }
  // A decision covers a date, a placement and an offer revision. If any of
  // them moved while the page was open, the reviewer was looking at something else.
  if (
    attempt.plannedDate !== state.plannedDate ||
    attempt.placement !== state.placement ||
    attempt.offerRevisionId !== state.currentRevisionId
  ) {
    return "This ad's publication date, placement or offer terms changed since this page was loaded. Reload and review it as it stands now.";
  }
  const status = deriveStatus(state);
  if (!REVIEWER_TURN.includes(status)) {
    return status === "approved"
      ? "This version is already approved."
      : "Changes were already requested on this version. It is waiting for the marketer.";
  }
  return null;
}
