import { getZoneSeasonal, setApiBaseUrl } from "@idea-agro/api-client";
import type { IndicatorId } from "@/data/indicators";

/*
 * Data access. A zone's seasonal series come from the API through its generated client; the rest are
 * prototype files extracted from Earth Engine into `public/explorer` (see the README), which the API
 * replaces fetcher by fetcher, keeping the same shapes.
 */

export type Bounds = [west: number, south: number, east: number, north: number];
export type Position = [number, number];
export type PolygonGeometry =
  | { type: "Polygon"; coordinates: Position[][] }
  | { type: "MultiPolygon"; coordinates: Position[][][] };

export type IndicatorManifest = {
  kind: "continuous" | "binary" | "categorical";
  years: number[] | null;
  min?: number;
  max?: number;
  classes?: number[];
};

export type Manifest = {
  bounds: Bounds;
  size: [number, number];
  liteSize: [number, number];
  indicators: Record<IndicatorId, IndicatorManifest>;
  padrones: Record<string, { name: string; count: number; bbox: Bounds }>;
  seasonal: Record<SeasonalId, string[]>;
  /** Number of zones in each predefined division. */
  divisions: Partial<Record<DivisionId, number>>;
  /** The country outline as an SVG path, in the rasters' Web Mercator frame. */
  outline: { width: number; height: number; d: string };
};

/** Predefined divisions with precomputed indicators. */
export const basinGrades = [1, 2, 3, 4, 5] as const;
export type BasinGrade = (typeof basinGrades)[number];
export type DivisionId = "seccionales" | `cuencas-${BasinGrade}`;
export type SeasonalId = "ppna" | "apar" | "et";

export type ZoneProperties = {
  id: string;
  areaKm2: number;
  name: string;
  dept?: string;
  section?: number;
};
export type ZoneFeature = { type: "Feature"; id?: number; properties: ZoneProperties; geometry: PolygonGeometry };
export type ZoneCollection = { type: "FeatureCollection"; features: ZoneFeature[] };

export type PadronFeature = {
  type: "Feature";
  id?: number;
  properties: { padron: number; areaHa: number };
  geometry: PolygonGeometry;
};
export type PadronCollection = { type: "FeatureCollection"; features: PadronFeature[] };

/** Yearly means per zone (aligned with `years`), or a static summary per zone. */
export type SeriesStats = { years: number[]; values: Record<string, (number | null)[]> };
export type SummaryStats = {
  years: null;
  values: Record<string, { mean: number | null; p25: number | null; p75: number | null }>;
};
export type HistogramStats = { years: null; values: Record<string, Record<string, number> | null> };

export type SearchEntry = {
  /** Division of the zone, or "department" for a place to fly to. */
  d: DivisionId | "department";
  id: string;
  label: string;
  detail?: string;
  bbox: Bounds;
};

/** Seasonal (16-day or 8-day) series of one zone, aligned with `manifest.seasonal`. */
export type ZoneSeasonal = Partial<Record<SeasonalId, (number | null)[]>>;

const base = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/explorer`;
const cache = new Map<string, Promise<unknown>>();

setApiBaseUrl(import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080");

/** Loads once per key; a failed load is forgotten so the next call retries. */
function cached<T>(key: string, load: () => Promise<T>): Promise<T> {
  let request = cache.get(key) as Promise<T> | undefined;
  if (!request) {
    request = load();
    request.catch(() => cache.delete(key));
    cache.set(key, request);
  }
  return request;
}

export const fetchJson = <T>(path: string): Promise<T> =>
  cached(path, () =>
    fetch(`${base}/${path}`).then((response) => {
      if (!response.ok) throw new Error(`${response.status} ${path}`);
      return response.json() as Promise<T>;
    }),
  );

export const loadManifest = () => fetchJson<Manifest>("manifest.json");
export const loadZones = (division: DivisionId) => fetchJson<ZoneCollection>(`zones/${division}.json`);
export const loadSeriesStats = (division: DivisionId, indicator: IndicatorId) =>
  fetchJson<SeriesStats>(`stats/${division}/${indicator}.json`);
export const loadSummaryStats = (division: DivisionId, indicator: IndicatorId) =>
  fetchJson<SummaryStats>(`stats/${division}/${indicator}.json`);
export const loadHistogramStats = (division: DivisionId, indicator: "compn" | "divtfe") =>
  fetchJson<HistogramStats>(`stats/${division}/${indicator}.json`);
export const loadZoneSeasonal = (division: DivisionId, id: string) =>
  cached(`api/seasonal/${division}/${id}`, async (): Promise<ZoneSeasonal> => {
    const response = await getZoneSeasonal(division, id);
    if (response.status !== 200) throw new Error(`${response.status} seasonal ${division}/${id}`);
    const { ppna, apar, et } = response.data;
    return { ppna: ppna?.values, apar: apar?.values, et: et?.values };
  });
export type ZoneMeta = { properties: ZoneProperties & { parent?: string }; geometry: PolygonGeometry; bbox: Bounds };
export const loadZoneMeta = (division: DivisionId, id: string) => fetchJson<ZoneMeta>(`zones/${division}/${id}.json`);
export const loadSearchIndex = () => fetchJson<SearchEntry[]>("search.json");
export const loadPadronIndex = () => fetchJson<Record<string, number[]>>("padrones/index.json");
export const loadPadrones = (department: string) => fetchJson<PadronCollection>(`padrones/${department}.json`);

/** Grayscale raster of an indicator for a year (`null` for indicators without a yearly series). */
export const rasterUrl = (indicator: IndicatorId, year: number | null, lite = false) =>
  `${base}/rasters/${indicator}/${lite ? "lite/" : ""}${year ?? "static"}.webp`;
export const thumbnailUrl = (indicator: IndicatorId, theme: "light" | "dark") =>
  `${base}/thumbs/${indicator}-${theme}.webp`;

export const isDivision = (value: string): value is DivisionId =>
  value === "seccionales" || /^cuencas-[1-5]$/.test(value);
