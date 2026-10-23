import series from "./snapshot/series.json";

/*
 * National series from the snapshot. Band names follow the GEE assets: `b<year>-<day of year>`
 * for a composite that starts that day (16-day for PPNA/APAR, 8-day for ET), `b<day>` for the
 * historical average of that composite, `b<year>` for yearly values.
 */

type BandRecord = Record<string, number>;

export const ppnaRecord = series.ppna as BandRecord;
const ppnaAverage = series.ppnaAvg as BandRecord;
const aparRecord = series.apar as BandRecord;
const aparAverage = series.aparAvg as BandRecord;
const etRecord = series.et as BandRecord;
const rhYearly = series.rh as BandRecord;
const ioseYearly = series.iose as BandRecord;

/** Start date of a composite: day `doy` of `year`, in UTC. */
export const compositeDate = (year: number, doy: number) => new Date(Date.UTC(year, 0, doy));

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
const etYear = productiveYear(8);

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
export const firstYearStart = 2001;

function yearValues(record: BandRecord, start: number, layout: { doy: number; yearOffset: number }[]) {
  return layout.map(({ doy, yearOffset }) => {
    const value = record[`b${start + yearOffset}-${doy}`];
    return value === undefined ? null : value;
  });
}

export type SeasonalPoint = { index: number; doy: number; yearOffset: number };
export const seasonalLayout: SeasonalPoint[] = ppnaYear.map((p, index) => ({ index, ...p }));

export const ppnaSeasonal = {
  average: ppnaYear.map(({ doy }) => ppnaAverage[`b${doy}`] ?? null),
  lastYear: yearValues(ppnaRecord, lastCompleteYearStart, ppnaYear),
  currentYear: yearValues(ppnaRecord, currentYearStart, ppnaYear),
};

export const aparSeasonal = {
  average: ppnaYear.map(({ doy }) => aparAverage[`b${doy}`] ?? null),
  lastYear: yearValues(aparRecord, lastCompleteYearStart, ppnaYear),
};

const sum = (values: (number | null)[]) => values.reduce<number>((total, v) => total + (v ?? 0), 0);
const complete = (values: (number | null)[]) => values.every((v) => v !== null);

/** Total grass production of each complete growing year (kg DM/ha). */
export const ppnaAnnual = Array.from({ length: lastCompleteYearStart - firstYearStart + 1 }, (_, i) => {
  const start = firstYearStart + i;
  const values = yearValues(ppnaRecord, start, ppnaYear);
  return { start, value: complete(values) ? sum(values) : null };
}).filter((d): d is { start: number; value: number } => d.value !== null);

/** Evapotranspiration of each complete growing year (mm): 8-day composites store mm per day. */
export const etAnnual = Array.from({ length: lastCompleteYearStart - firstYearStart + 1 }, (_, i) => {
  const start = firstYearStart + i;
  const values = yearValues(etRecord, start, etYear);
  return { start, value: complete(values) ? sum(values) * 8 : null };
}).filter((d): d is { start: number; value: number } => d.value !== null);

const yearly = (record: BandRecord, factor = 1) =>
  Object.entries(record)
    .map(([band, value]) => ({ year: Number(band.slice(1)), value: value * factor }))
    .sort((a, b) => a.year - b.year);

/** The RH asset stores the mean monthly yield; ×12 gives mm per year, as the platform reports it. */
export const rhAnnual = yearly(rhYearly, 12);
export const ioseAnnual = yearly(ioseYearly);

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

/** Share of the country with PPNA data: the asset is masked to grasslands. */
export const grasslandCoverage = series.coverage.area / series.coverage.total;
