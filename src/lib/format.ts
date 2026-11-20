const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-12-08" to "Dec 8, 2026". Plain dates have no time zone to get wrong. */
export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function timeAgo(isoTime: string, now: number = Date.now()): string {
  const minutes = Math.max(0, Math.round((now - new Date(isoTime).getTime()) / 60000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** A moment in Pacific time, for approval stamps. */
export function formatMoment(isoTime: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(isoTime));
}

/** Today plus a number of days, as YYYY-MM-DD. */
export function isoDatePlusDays(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString().slice(0, 10);
}
