import { describe, expect, it } from "vitest";
import { deriveStatus, lastApproval, refuseDecision, type AssetState, type DecisionRecord } from "./status";

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

describe("the server's rule for decisions", () => {
  const attempt = { role: "reviewer" as const, kind: "approve" as const, versionNumber: 1, fingerprint: "aaa" };

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

  it("refuses a second decision on an approved version", () => {
    expect(refuseDecision(attempt, { ...base, decisions: [decision({})] })).toMatch(/already approved/);
  });

  it("refuses when no offer terms are in effect on the date", () => {
    expect(refuseDecision(attempt, { ...base, currentRevisionId: null })).toMatch(/No offer terms/);
  });
});
