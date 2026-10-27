import copy from "./national.json";
import { fetchNational, type National, type Series } from "./national-source";

/*
 * The country's series, as the platform computes them for its `uruguay` zone. Composites are keyed by their bands'
 * names in Earth Engine: `b<year>-<day of year>` for one that starts that day.
 */

const api = import.meta.env.PUBLIC_API_URL;
// A deploy build reads the API, and fails if it cannot; checks and local builds read the committed copy.
const national: National = api?.startsWith("https://") ? await fetchNational(api) : (copy as National);

type BandRecord = Record<string, number>;

/** Start date of a composite: day `doy` of `year`, in UTC. */
export const compositeDate = (year: number, doy: number) => new Date(Date.UTC(year, 0, doy));

const dayOfYear = (date: Date) => Math.round((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;

function bands(series: Series): BandRecord {
  const record: BandRecord = {};
  series.dates.forEach((day, i) => {
    const value = series.values[i];
    const date = new Date(`${day}T00:00:00Z`);
    if (value !== null && value !== undefined) record[`b${date.getUTCFullYear()}-${dayOfYear(date)}`] = value;
  });
  return record;
}

export const ppnaRecord = bands(national.seasonal.ppna);
const aparRecord = bands(national.seasonal.apar);

const doysEvery = (step: number) => Array.from({ length: Math.ceil(365 / step) }, (_, i) => 1 + i * step);

/**
 * The growing year runs July to June. As in the platform, it takes the second half of one year's
 * composites and the first half of the next one's.
 */
export function productiveYear(step: 16 | 8) {
  const doys = doysEvery(step);
  const middle = Math.ceil(doys.length / 2);
  return [
    ...doys.slice(middle).map((doy) => ({ doy, yearOffset: 0 })),
    ...doys.slice(0, middle).map((doy) => ({ doy, yearOffset: 1 })),
  ];
}

const ppnaYear = productiveYear(16);

export const latestBand = Object.keys(ppnaRecord).reduce((latest, band) => {
  const [y, d] = band.slice(1).split("-").map(Number);
  const [ly, ld] = latest.slice(1).split("-").map(Number);
  return y > ly || (y === ly && d > ld) ? band : latest;
});
const [latestYear, latestDoy] = latestBand.slice(1).split("-").map(Number);
export const latestDate = compositeDate(latestYear, latestDoy);

/** The growing year that contains the latest composite, and the last complete one. */
export const currentYearStart = latestDoy >= ppnaYear[0].doy ? latestYear : latestYear - 1;
export const lastCompleteYearStart = currentYearStart - 1;

type YearValue = { start: number; value: number };

/** An indicator's yearly values as the platform computes them: seasonal ones summed over each productive year. */
function yearly(id: keyof National["values"]): YearValue[] {
  const { years, value } = national.values[id];
  const values = (value ?? []) as (number | null)[];
  return (years ?? [])
    .map((start, i) => ({ start, value: values[i] ?? null }))
    .filter((d): d is YearValue => d.value !== null);
}

/** Total grass production of each complete growing year (kg DM/ha). */
export const ppnaAnnual = yearly("ppna");
/** Evapotranspiration of each complete growing year (mm). */
export const etAnnual = yearly("et");
/** Water yield of each complete growing year (mm). */
export const rhAnnual = yearly("rh");
export const ioseAnnual = yearly("iose").map((d) => ({ year: d.start, value: d.value }));
/** Natural grassland as a share of the mapped country, per year of MapBiomas Pampa. */
export const grasslandShare = yearly("cob").map((d) => ({ year: d.start, value: d.value }));
export const firstYearStart = ppnaAnnual[0]?.start ?? lastCompleteYearStart;

function yearValues(record: BandRecord, start: number, layout: { doy: number; yearOffset: number }[]) {
  return layout.map(({ doy, yearOffset }) => {
    const value = record[`b${start + yearOffset}-${doy}`];
    return value === undefined ? null : value;
  });
}

/** Each composite's mean over the complete growing years. */
function average(record: BandRecord, layout: { doy: number; yearOffset: number }[]) {
  const years = ppnaAnnual.map((d) => yearValues(record, d.start, layout));
  return layout.map((_, i) => {
    const values = years.map((year) => year[i]).filter((v): v is number => v !== null);
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
}

export type SeasonalPoint = { index: number; doy: number; yearOffset: number };
export const seasonalLayout: SeasonalPoint[] = ppnaYear.map((p, index) => ({ index, ...p }));

export const ppnaSeasonal = {
  average: average(ppnaRecord, ppnaYear),
  lastYear: yearValues(ppnaRecord, lastCompleteYearStart, ppnaYear),
  currentYear: yearValues(ppnaRecord, currentYearStart, ppnaYear),
};

export const aparSeasonal = {
  average: average(aparRecord, ppnaYear),
  lastYear: yearValues(aparRecord, lastCompleteYearStart, ppnaYear),
};

const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);

/** Each grassland community's share of the mapped communities, largest first. */
export const communityShares = (() => {
  const counts = (national.values.compn.value ?? {}) as Record<string, number>;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return Object.entries(counts)
    .map(([cls, count]) => ({ cls, share: total ? count / total : 0 }))
    .sort((a, b) => b.share - a.share);
})();

/** The country's mean and central half (25th to 75th percentile) of an indicator measured once. */
export const nationalSummary = (id: "divtfe" | "csue" | "ahppn") =>
  national.values[id].value as { mean: number | null; p25: number | null; p75: number | null } | null;

/** A map's range: the 2nd and 98th percentiles of its years. */
export const mapRange = (id: keyof National["maps"]) => national.maps[id];
/** The year the maps show: the latest complete growing year. */
export const mapYear = (national.maps.ppna.years ?? []).at(-1) ?? lastCompleteYearStart;

export const ppnaStats = (() => {
  const lastTotal = sum(ppnaSeasonal.lastYear);
  const averageTotal = sum(ppnaSeasonal.average);
  const peak = ppnaSeasonal.lastYear.reduce<number>(
    (best, v, i, all) => ((v ?? -Infinity) > (all[best] ?? -Infinity) ? i : best),
    0,
  );
  const low = ppnaSeasonal.lastYear.reduce<number>(
    (best, v, i, all) => ((v ?? Infinity) < (all[best] ?? Infinity) ? i : best),
    0,
  );
  return {
    lastTotal,
    averageTotal,
    delta: lastTotal / averageTotal - 1,
    peak: { index: peak, value: ppnaSeasonal.lastYear[peak] ?? 0 },
    low: { index: low, value: ppnaSeasonal.lastYear[low] ?? 0 },
  };
})();
