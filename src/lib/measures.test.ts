import { describe, expect, it } from "vitest";
import { formatElapsed, measureAd, median, type LoggedEvent } from "./measures";

const at = (hours: number) => new Date(Date.UTC(2026, 10, 17, 10) + hours * 3600_000).toISOString();

// The hero ad as seeded: version 1 sent back once, version 2 waiting.
const seeded: LoggedEvent[] = [
  { type: "submitted", at: at(0) },
  { type: "changes_requested", at: at(24) },
  { type: "resubmitted", at: at(72) },
];

describe("measures follow the event log", () => {
  it("the seeded hero ad was sent back once and is with the reviewer", () => {
    expect(measureAd(seeded, "revised", true)).toEqual({
      timesSentBack: 1,
      versionsSubmitted: 2,
      withWhom: "reviewer",
      submissionToApprovalMs: null,
    });
  });

  it("requesting the fee correction adds exactly one", () => {
    const m = measureAd([...seeded, { type: "changes_requested", at: at(74) }], "changes_requested", true);
    expect(m.timesSentBack).toBe(2);
    expect(m.withWhom).toBe("marketer");
    expect(m.submissionToApprovalMs).toBeNull();
  });

  it("approving version 3 leaves the count alone and shows the turnaround", () => {
    const events = [...seeded, { type: "changes_requested", at: at(74) }, { type: "resubmitted", at: at(75) }, { type: "approved", at: at(76) }];
    const m = measureAd(events, "approved", true);
    expect(m.timesSentBack).toBe(2);
    expect(m.versionsSubmitted).toBe(3);
    expect(m.withWhom).toBe("no one");
    expect(m.submissionToApprovalMs).toBe(76 * 3600_000);
    expect(formatElapsed(m.submissionToApprovalMs!)).toBe("3 days 4 hours");
  });

  it("an ad approved and then moved shows no turnaround until it is approved again", () => {
    const events = [{ type: "submitted", at: at(0) }, { type: "approved", at: at(20) }, { type: "rescheduled", at: at(30) }];
    expect(measureAd(events, "rescheduled", true).submissionToApprovalMs).toBeNull();
    expect(measureAd([...events, { type: "approved", at: at(40) }], "approved", true).submissionToApprovalMs).toBe(40 * 3600_000);
  });

  it("an ad on a date with no offer terms is with the marketer", () => {
    expect(measureAd([{ type: "submitted", at: at(0) }], "new", false).withWhom).toBe("marketer");
  });

  it("formats elapsed time and takes a median", () => {
    expect(formatElapsed(12 * 60000)).toBe("12 min");
    expect(formatElapsed(5 * 3600_000 + 10 * 60000)).toBe("5 hours 10 min");
    expect(formatElapsed(24 * 3600_000)).toBe("1 day");
    expect(median([3, 1, 2])).toBe(2);
    expect(median([1, 3])).toBe(2);
    expect(median([])).toBeNull();
  });
});
