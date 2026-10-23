const DAY = 86_400_000;

/**
 * One tick per month, placed mid-month on a series of composites that start on `start` and
 * repeat every `stepDays`, so months sit evenly even though composites do not align with them.
 */
export function monthTicks(start: Date, stepDays: number, count: number, formatMonth: (date: Date) => string) {
  const ticks: { index: number; label: string; minor: boolean }[] = [];
  for (let m = 0; m < 12; m++) {
    const mid = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 15));
    const index = (mid.getTime() - start.getTime()) / (stepDays * DAY);
    if (index < 0 || index > count - 1) continue;
    ticks.push({ index, label: formatMonth(mid), minor: m % 2 === 1 });
  }
  return ticks;
}
