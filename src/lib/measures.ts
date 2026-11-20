// Measures computed from the event log. Nothing here is stored: each number is
// counted from the events at the moment the page is opened, so it moves as
// soon as someone acts.

import type { AssetStatus } from "./status";

export type LoggedEvent = { type: string; at: string };

export type AdMeasures = {
  /** How many times compliance sent the ad back for changes. */
  timesSentBack: number;
  /** Versions submitted, the first one included. */
  versionsSubmitted: number;
  /** Who needs to act now. */
  withWhom: "reviewer" | "marketer" | "no one";
  /**
   * First submission to the approval that stands now, in milliseconds. Only
   * for ads that are approved as they stand. This is calendar time: it
   * includes every wait between people, not only time spent working.
   */
  submissionToApprovalMs: number | null;
};

export function measureAd(events: LoggedEvent[], status: AssetStatus, hasOfferTerms: boolean): AdMeasures {
  const ordered = [...events].sort((a, b) => a.at.localeCompare(b.at));
  const of = (type: string) => ordered.filter((e) => e.type === type);
  const submissions = [...of("submitted"), ...of("resubmitted")];
  const approvals = of("approved");
  const first = of("submitted")[0] ?? ordered[0];
  const lastApproval = approvals[approvals.length - 1];

  let withWhom: AdMeasures["withWhom"];
  if (status === "approved") withWhom = "no one";
  else if (status === "changes_requested" || !hasOfferTerms) withWhom = "marketer";
  else withWhom = "reviewer";

  return {
    timesSentBack: of("changes_requested").length,
    versionsSubmitted: submissions.length,
    withWhom,
    submissionToApprovalMs:
      status === "approved" && first && lastApproval
        ? Math.max(0, new Date(lastApproval.at).getTime() - new Date(first.at).getTime())
        : null,
  };
}

/** "3 days 4 hours", "5 hours 10 min", "12 min". */
export function formatElapsed(ms: number): string {
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "under a minute";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const part = (n: number, unit: string) => `${n} ${unit}${n === 1 || unit === "min" ? "" : "s"}`;
  if (days > 0) return hours > 0 ? `${part(days, "day")} ${part(hours, "hour")}` : part(days, "day");
  if (hours > 0) return mins > 0 ? `${part(hours, "hour")} ${part(mins, "min")}` : part(hours, "hour");
  return part(mins, "min");
}

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
