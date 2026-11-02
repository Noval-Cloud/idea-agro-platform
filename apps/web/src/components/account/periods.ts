/** The stretches of time the audit log groups entries in, from today back. */
export type Period =
  | { kind: "today" | "yesterday" | "week" | "month" }
  | { kind: "older"; year: number; month: number };

const day = (at: Date, back = 0) => new Date(at.getFullYear(), at.getMonth(), at.getDate() - back).getTime();

/** Today, yesterday, this week (from Monday), this month, then each earlier month; by calendar days. */
export function periodOf(at: Date, now: Date): Period {
  const moment = at.getTime();
  if (moment >= day(now)) return { kind: "today" };
  if (moment >= day(now, 1)) return { kind: "yesterday" };
  if (moment >= day(now, (now.getDay() + 6) % 7)) return { kind: "week" };
  if (at.getFullYear() === now.getFullYear() && at.getMonth() === now.getMonth()) return { kind: "month" };
  return { kind: "older", year: at.getFullYear(), month: at.getMonth() };
}

export const periodKey = (period: Period) => (period.kind === "older" ? `${period.year}-${period.month}` : period.kind);
