/** A date filter: a stretch up to now, or a range of calendar days with either end open. */
export type DatePreset = "today" | "week" | "month";
export type DateValue = { preset: DatePreset } | { from: string; to: string };

export const datePresets: DatePreset[] = ["today", "week", "month"];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** As the address keeps it: `week`, or `2026-10-01~2026-10-15` with either side empty. */
export function decodeDates(value: string): DateValue | null {
  const preset = datePresets.find((p) => p === value);
  if (preset) return { preset };
  const [from = "", to = ""] = value.split("~");
  const range = { from: DAY.test(from) ? from : "", to: DAY.test(to) ? to : "" };
  return range.from || range.to ? range : null;
}

export const encodeDates = (value: DateValue | null) =>
  !value ? "" : "preset" in value ? value.preset : `${value.from}~${value.to}`;

const start = (day: string) => {
  const [year, month, date] = day.split("-").map(Number);
  return new Date(year, month - 1, date);
};
const midnight = (at: Date, back = 0) => new Date(at.getFullYear(), at.getMonth(), at.getDate() - back);

/** The times a filter covers, in local time: from the start of its first day to the start of the day after its last. */
export function dateBounds(value: DateValue, now: Date): { since?: Date; until?: Date } {
  if ("preset" in value) {
    // The week starts on Monday, as the audit's timeline does.
    const back = value.preset === "today" ? 0 : value.preset === "week" ? (now.getDay() + 6) % 7 : now.getDate() - 1;
    return { since: midnight(now, back) };
  }
  const until = value.to ? start(value.to) : undefined;
  until?.setDate(until.getDate() + 1);
  return { since: value.from ? start(value.from) : undefined, until };
}

/** A day as a date input holds it, in local time. */
export const dayOf = (at: Date) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`;
