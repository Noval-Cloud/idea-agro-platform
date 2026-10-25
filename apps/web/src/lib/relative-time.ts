import { intlLocale, type Locale } from "@/i18n/core";

const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ["second", 45],
  ["minute", 45 * 60],
  ["hour", 22 * 3600],
  ["day", 7 * 86400],
  ["week", 30 * 86400],
  ["month", 330 * 86400],
];
const seconds: Record<Intl.RelativeTimeFormatUnit, number> = {
  second: 1,
  seconds: 1,
  minute: 60,
  minutes: 60,
  hour: 3600,
  hours: 3600,
  day: 86400,
  days: 86400,
  week: 7 * 86400,
  weeks: 7 * 86400,
  month: 30 * 86400,
  months: 30 * 86400,
  quarter: 91 * 86400,
  quarters: 91 * 86400,
  year: 365 * 86400,
  years: 365 * 86400,
};

/** How long ago a moment was, in the locale's words: "hace 3 días", "ayer". */
export const relativeTimeFormat = (locale: Locale) => {
  const format = new Intl.RelativeTimeFormat(intlLocale[locale], { numeric: "auto" });
  return (value: string, now = Date.now()) => {
    const elapsed = (new Date(value).getTime() - now) / 1000;
    const unit = steps.find(([, limit]) => Math.abs(elapsed) < limit)?.[0] ?? "year";
    // Under a minute reads as "now".
    return format.format(unit === "second" ? 0 : Math.round(elapsed / seconds[unit]), unit);
  };
};
