/** The years a zone's productive-year view draws, as the page keeps them and its URL carries them. */

/** The compared slots; each has its own colour token (`--ia-viz-compare-<family>-<slot>`). */
export const slots = [1, 2] as const;
export type Slot = (typeof slots)[number];

/** A year compared with the main one; its slot keeps its colour while it is shown. */
export interface Compared {
  year: number;
  slot: Slot;
}

export interface Years {
  /** The main year; null is the current one. */
  main: number | null;
  compared: Compared[];
  /** The year the map was showing; "back to the map" returns to it. */
  map: number | null;
}

const asYear = (value: string | null | undefined) => {
  const year = Number(value);
  return value && Number.isInteger(year) && year > 1900 ? year : null;
};

/**
 * `main` is a year drawn instead of the current one. `year` lists the compared years by slot, an empty place being a
 * free slot; the explorer sends the map's year there, which becomes `map` until the page writes its own.
 */
export function readYears(params: URLSearchParams): Years {
  const main = asYear(params.get("main"));
  const listed = (params.get("year") ?? "").split(",").slice(0, slots.length);
  const compared: Compared[] = [];
  listed.forEach((value, i) => {
    const year = asYear(value);
    if (year !== null && year !== main && !compared.some((c) => c.year === year))
      compared.push({ year, slot: slots[i] });
  });
  const map = params.has("map") ? asYear(params.get("map")) : asYear(listed[0]);
  return { main, compared, map };
}

export function writeYears(params: URLSearchParams, { main, compared, map }: Years): void {
  if (main === null) params.delete("main");
  else params.set("main", String(main));
  const listed: string[] = slots.map((slot) => String(compared.find((c) => c.slot === slot)?.year ?? ""));
  while (listed.length && listed[listed.length - 1] === "") listed.pop();
  if (listed.length) params.set("year", listed.join(","));
  else params.delete("year");
  if (map === null) params.delete("map");
  else params.set("map", String(map));
}

/** Adds a year in a free slot; when none is free, a year this view does not draw gives its slot up. */
export function compare(now: Compared[], year: number, drawn: (year: number) => boolean): Compared[] {
  if (now.some((c) => c.year === year)) return now;
  const kept = now.length < slots.length ? now : now.filter((c) => drawn(c.year));
  const free = slots.find((slot) => !kept.some((c) => c.slot === slot));
  return free === undefined ? kept : [...kept, { year, slot: free }];
}
