import { describe, expect, it } from "vitest";
import type { OfferTerms } from "./checks";
import { coverage, coverageText, termsOn } from "./offers";

const rev = (id: string, from: string, to: string | null, offerId = "pl"): OfferTerms & { offerId: string } => ({
  revisionId: id,
  offerId,
  campaign: "Winter Personal Loan",
  effectiveFrom: from,
  effectiveTo: to,
  aprMin: 8.99,
  aprMax: 35.99,
  feePct: 2,
  termMinMonths: 24,
  termMaxMonths: 60,
  source: "test",
});
const revisions = [rev("r1", "2026-11-01", "2026-12-31"), rev("r2", "2027-01-01", null), rev("x1", "2026-09-01", "2026-09-30", "other"), rev("x2", "2026-11-01", null, "other")];

describe("which offer terms apply", () => {
  it("picks the revision in effect on the date", () => {
    expect(termsOn(revisions, "pl", "2026-12-31")?.revisionId).toBe("r1");
    expect(termsOn(revisions, "pl", "2027-01-01")?.revisionId).toBe("r2");
  });

  it("has none before the offer starts", () => {
    expect(termsOn(revisions, "pl", "2026-06-01")).toBeNull();
  });

  it("joins back-to-back revisions into one range", () => {
    expect(coverage(revisions, "pl")).toEqual([{ from: "2026-11-01", to: null }]);
    expect(coverageText(revisions, "pl")).toBe("Nov 1, 2026 onward");
  });

  it("keeps a gap visible", () => {
    expect(coverageText(revisions, "other")).toBe("Sep 1, 2026 to Sep 30, 2026 and Nov 1, 2026 onward");
  });
});

// A new revision of the offer sheet -------------------------------------------

import { inForceText, parsePercent, refuseRevision, termChanges, withTimeline } from "./offers";

const numbered = (id: string, revision: number, from: string, to: string | null, aprMin = 8.99) => ({
  ...rev(id, from, to),
  revision,
  aprMin,
});
// The seeded sheet: revision 1 for Nov and Dec 2026, revision 2 from Jan 1, 2027.
const sheet = [numbered("r1", 1, "2026-11-01", "2026-12-31"), numbered("r2", 2, "2027-01-01", null, 9.49)];

describe("adding a revision never edits another: the dates in force are derived", () => {
  it("the seeded sheet is unchanged by the derivation", () => {
    const t = withTimeline(sheet);
    expect(t.map((r) => [r.revisionId, r.effectiveFrom, r.effectiveTo])).toEqual([
      ["r1", "2026-11-01", "2026-12-31"],
      ["r2", "2027-01-01", null],
    ]);
    expect(termsOn(t, "pl", "2026-12-08")?.revisionId).toBe("r1");
  });

  it("a revision starting Dec 1 takes over from that date, until the next scheduled revision starts", () => {
    const t = withTimeline([...sheet, numbered("r3", 3, "2026-12-01", null, 9.49)]);
    expect(termsOn(t, "pl", "2026-11-30")?.revisionId).toBe("r1");
    expect(termsOn(t, "pl", "2026-12-01")?.revisionId).toBe("r3");
    expect(termsOn(t, "pl", "2026-12-31")?.revisionId).toBe("r3");
    expect(termsOn(t, "pl", "2027-01-01")?.revisionId).toBe("r2");
    const byId = Object.fromEntries(t.map((r) => [r.revisionId, r]));
    expect(inForceText(byId.r1)).toBe("Nov 1, 2026 to Nov 30, 2026");
    expect(byId.r1.replacedBy).toBe(3);
    expect(inForceText(byId.r3)).toBe("Dec 1, 2026 to Dec 31, 2026");
    expect(byId.r3.replacedBy).toBe(2);
    // The input rows are not modified: the shared row still says what it said.
    expect(sheet[0].effectiveTo).toBe("2026-12-31");
  });

  it("a correction from the same start date replaces the earlier revision on every date, and the earlier one stays on record", () => {
    const t = withTimeline([...sheet, numbered("r3", 3, "2026-11-01", null, 9.25)]);
    expect(termsOn(t, "pl", "2026-11-01")?.revisionId).toBe("r3");
    expect(termsOn(t, "pl", "2026-12-31")?.revisionId).toBe("r3");
    const r1 = t.find((r) => r.revisionId === "r1")!;
    expect(inForceText(r1)).toBeNull();
    expect(r1.replacedBy).toBe(3);
    expect(coverageText(t, "pl")).toBe("Nov 1, 2026 onward");
  });

  it("a revision after an open-ended one ends it the day before", () => {
    const t = withTimeline([...sheet, numbered("r3", 3, "2027-03-01", null)]);
    expect(inForceText(t.find((r) => r.revisionId === "r2")!)).toBe("Jan 1, 2027 to Feb 28, 2027");
    expect(termsOn(t, "pl", "2027-03-01")?.revisionId).toBe("r3");
  });

  it("exactly one revision is in force on every covered date, whatever order they were added in", () => {
    const extra = [numbered("r3", 3, "2026-12-01", null), numbered("r4", 4, "2026-12-15", null), numbered("r5", 5, "2026-12-01", null)];
    for (const order of [[...sheet, ...extra], [...extra].reverse().concat(sheet)]) {
      const t = withTimeline(order);
      for (const date of ["2026-11-01", "2026-11-30", "2026-12-01", "2026-12-14", "2026-12-15", "2026-12-31", "2027-01-01", "2028-06-01"]) {
        expect(t.filter((r) => r.effectiveFrom <= date && (r.effectiveTo === null || date <= r.effectiveTo)).length).toBe(1);
      }
      expect(termsOn(t, "pl", "2026-12-08")?.revisionId).toBe("r5"); // the later correction of Dec 1
      expect(termsOn(t, "pl", "2026-12-20")?.revisionId).toBe("r4");
    }
  });

  it("another offer's revisions are not affected", () => {
    const other = { ...rev("x1", "2026-12-01", null, "other"), revision: 1 };
    const t = withTimeline([...sheet, other]);
    expect(t.find((r) => r.revisionId === "r1")!.effectiveTo).toBe("2026-12-31");
  });
});

describe("the rule for a new revision", () => {
  const inForce = sheet[0];
  const ok = { aprMin: 9.49, aprMax: 35.99, feePct: 2, effectiveFrom: "2026-12-01" };

  it("accepts changed terms on a date in range", () => {
    expect(refuseRevision(ok, inForce)).toBeNull();
    expect(refuseRevision(ok, null)).toBeNull();
  });

  it("refuses the terms already in effect, so approvals are not sent back for nothing", () => {
    expect(refuseRevision({ ...ok, aprMin: 8.99 }, inForce)).toMatch(/already in effect on Dec 1, 2026/);
  });

  it("refuses a lowest APR above the highest, a zero APR, a negative fee and a date out of range", () => {
    expect(refuseRevision({ ...ok, aprMin: 36 }, inForce)).toMatch(/cannot be above/);
    expect(refuseRevision({ ...ok, aprMin: 0 }, inForce)).toMatch(/above 0%/);
    expect(refuseRevision({ ...ok, feePct: -1 }, inForce)).toMatch(/below 0%/);
    expect(refuseRevision({ ...ok, effectiveFrom: "2031-01-01" }, inForce)).toMatch(/between 2026 and 2028/);
    expect(refuseRevision({ ...ok, effectiveFrom: "2026-02-30" }, inForce)).toMatch(/between 2026 and 2028/);
    expect(refuseRevision({ ...ok, aprMin: Number.NaN }, inForce)).toMatch(/up to two decimals/);
  });

  it("reads a typed percentage only as plain digits with up to two decimals", () => {
    expect(parsePercent("9.49")).toBe(9.49);
    expect(parsePercent(" 35 ")).toBe(35);
    for (const bad of ["", "9.499", "100", "-1", "9,49", "1e1", "0x10", "9.49%", "９.４９", "9.49; drop table offers"]) {
      expect(parsePercent(bad)).toBeNull();
    }
  });

  it("lists which terms differ between two revisions", () => {
    const rows = termChanges(sheet[0], sheet[1]);
    expect(rows.filter((r) => r.changed).map((r) => [r.label, r.before, r.after])).toEqual([["Lowest APR", "8.99%", "9.49%"]]);
    expect(rows.length).toBe(4);
  });
});
