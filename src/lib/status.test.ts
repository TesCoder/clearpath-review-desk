import { describe, expect, it } from "vitest";
import { REVIEWER_TURN, STATUS_LABEL, deriveStatus, lastApproval, refuseDecision, type AssetState, type DecisionRecord } from "./status";

const base: AssetState = {
  latestVersion: { number: 1, fingerprint: "aaa" },
  plannedDate: "2026-12-08",
  placement: "Comparison site listing",
  currentRevisionId: "pl-winter-r1",
  decisions: [],
};

function decision(over: Partial<DecisionRecord>): DecisionRecord {
  return {
    versionNumber: 1,
    kind: "approve",
    fingerprint: "aaa",
    offerRevisionId: "pl-winter-r1",
    plannedDate: "2026-12-08",
    placement: "Comparison site listing",
    createdAt: "2026-11-20T10:00:00Z",
    ...over,
  };
}

describe("status", () => {
  it("a first version with no decision is new", () => {
    expect(deriveStatus(base)).toBe("new");
  });

  it("a request for changes waits for the marketer", () => {
    expect(deriveStatus({ ...base, decisions: [decision({ kind: "request_changes" })] })).toBe("changes_requested");
  });

  it("a new version after a request is revised and back with the reviewer", () => {
    const s = { ...base, latestVersion: { number: 2, fingerprint: "bbb" }, decisions: [decision({ kind: "request_changes" })] };
    expect(deriveStatus(s)).toBe("revised");
  });

  it("an approval holds for the exact version, date, placement and offer revision", () => {
    expect(deriveStatus({ ...base, decisions: [decision({})] })).toBe("approved");
  });

  it("an edit after approval creates a version that needs review, and the old approval stays on record", () => {
    const s = { ...base, latestVersion: { number: 2, fingerprint: "bbb" }, decisions: [decision({})] };
    expect(deriveStatus(s)).toBe("edited_after_approval");
    expect(lastApproval(s)?.versionNumber).toBe(1);
  });

  it("moving the date goes back to review even though no word changed", () => {
    const s = { ...base, plannedDate: "2027-01-12", currentRevisionId: "pl-winter-r2", decisions: [decision({})] };
    expect(deriveStatus(s)).toBe("rescheduled");
  });

  it("moving the placement goes back to review", () => {
    expect(deriveStatus({ ...base, placement: "Email newsletter", decisions: [decision({})] })).toBe("rescheduled");
  });

  it("a later approval of the rescheduled placement holds again", () => {
    const s = {
      ...base,
      plannedDate: "2027-01-12",
      currentRevisionId: "pl-winter-r2",
      decisions: [
        decision({}),
        decision({ plannedDate: "2027-01-12", offerRevisionId: "pl-winter-r2", createdAt: "2026-11-21T10:00:00Z" }),
      ],
    };
    expect(deriveStatus(s)).toBe("approved");
  });
});

describe("a version that answers a request, when an older version was once approved", () => {
  // Version 1 approved, version 2 sent back, version 3 sent in.
  const s: AssetState = {
    ...base,
    latestVersion: { number: 3, fingerprint: "ccc" },
    decisions: [
      decision({}),
      decision({ versionNumber: 2, kind: "request_changes", fingerprint: "bbb", createdAt: "2026-11-21T10:00:00Z" }),
    ],
  };

  it("is revised, so it takes its place among the revised ads in the queue", () => {
    expect(deriveStatus(s)).toBe("revised");
  });

  it("an edit straight after an approval is still an edit after approval", () => {
    expect(deriveStatus({ ...base, latestVersion: { number: 2, fingerprint: "bbb" }, decisions: [decision({})] })).toBe("edited_after_approval");
  });

  it("the old approval stays on record", () => {
    expect(lastApproval(s)?.versionNumber).toBe(1);
  });
});

describe("the offer changes after approval", () => {
  // The ad is untouched: same words, date and placement. A new offer revision now covers its date.
  const moved: AssetState = { ...base, currentRevisionId: "pl-winter-r3", decisions: [decision({})] };

  it("the approval stops holding, with its own status, and it is the reviewer's turn", () => {
    expect(deriveStatus({ ...base, decisions: [decision({})] })).toBe("approved");
    expect(deriveStatus(moved)).toBe("offer_changed");
    expect(REVIEWER_TURN).toContain("offer_changed");
    expect(STATUS_LABEL.offer_changed).toBe("Offer changed after approval, needs review");
  });

  it("the earlier approval stays on record", () => {
    expect(lastApproval(moved)?.offerRevisionId).toBe("pl-winter-r1");
  });

  it("approving again against the new revision holds", () => {
    const again: AssetState = {
      ...moved,
      decisions: [decision({}), decision({ offerRevisionId: "pl-winter-r3", createdAt: "2026-11-21T10:00:00Z" })],
    };
    expect(deriveStatus(again)).toBe("approved");
  });

  it("a second offer change sends it back again", () => {
    const twice: AssetState = {
      ...moved,
      currentRevisionId: "pl-winter-r4",
      decisions: [decision({}), decision({ offerRevisionId: "pl-winter-r3", createdAt: "2026-11-21T10:00:00Z" })],
    };
    expect(deriveStatus(twice)).toBe("offer_changed");
  });

  it("a moved date is still reported as a move, even when the revision differs too", () => {
    const s: AssetState = { ...base, plannedDate: "2027-01-12", currentRevisionId: "pl-winter-r2", decisions: [decision({})] };
    expect(deriveStatus(s)).toBe("rescheduled");
  });

  it("a request for changes and an unapproved ad are not affected by an offer change", () => {
    expect(deriveStatus({ ...base, currentRevisionId: "pl-winter-r3", decisions: [decision({ kind: "request_changes" })] })).toBe("changes_requested");
    expect(deriveStatus({ ...base, currentRevisionId: "pl-winter-r3" })).toBe("new");
  });

  it("the reviewer can decide on it, against the revision that applies now and no other", () => {
    const attempt = {
      role: "reviewer" as const,
      kind: "approve" as const,
      versionNumber: 1,
      fingerprint: "aaa",
      plannedDate: "2026-12-08",
      placement: "Comparison site listing",
      offerRevisionId: "pl-winter-r3",
    };
    expect(refuseDecision(attempt, moved)).toBeNull();
    // A page loaded before the offer changed still shows the old revision: refused.
    expect(refuseDecision({ ...attempt, offerRevisionId: "pl-winter-r1" }, moved)).toMatch(/offer terms changed/);
  });
});

describe("the server's rule for decisions", () => {
  const attempt = {
    role: "reviewer" as const,
    kind: "approve" as const,
    versionNumber: 1,
    fingerprint: "aaa",
    plannedDate: "2026-12-08",
    placement: "Comparison site listing",
    offerRevisionId: "pl-winter-r1",
  };

  it("allows a reviewer to decide on the current version", () => {
    expect(refuseDecision(attempt, base)).toBeNull();
  });

  it("refuses a marketer", () => {
    expect(refuseDecision({ ...attempt, role: "marketer" }, base)).toMatch(/Only a compliance reviewer/);
  });

  it("refuses a version that is no longer the latest", () => {
    const s = { ...base, latestVersion: { number: 2, fingerprint: "bbb" } };
    expect(refuseDecision(attempt, s)).toMatch(/newer version/);
  });

  it("refuses when the fingerprint on the page is not the stored one", () => {
    expect(refuseDecision({ ...attempt, fingerprint: "zzz" }, base)).toMatch(/text changed/);
  });

  it("refuses when the date, placement or offer revision moved while the page was open", () => {
    const moved = { ...base, plannedDate: "2027-01-05", currentRevisionId: "pl-winter-r2" };
    expect(refuseDecision(attempt, moved)).toMatch(/changed since this page was loaded/);
    expect(refuseDecision(attempt, { ...base, placement: "Social post" })).toMatch(/changed since this page was loaded/);
    expect(refuseDecision({ ...attempt, offerRevisionId: "pl-winter-r2" }, base)).toMatch(/changed since this page was loaded/);
  });

  it("refuses a second decision on an approved version", () => {
    expect(refuseDecision(attempt, { ...base, decisions: [decision({})] })).toMatch(/already approved/);
  });

  it("refuses when no offer terms are in effect on the date", () => {
    expect(refuseDecision(attempt, { ...base, currentRevisionId: null })).toMatch(/No offer terms/);
  });
});
