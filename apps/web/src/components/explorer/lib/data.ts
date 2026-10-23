import * as api from "@idea-agro/api-client";
import type { IndicatorId } from "@/data/indicators";

/*
 * Data access, all through the API's generated client. The API speaks snake_case and ISO dates; the loaders
 * here turn its answers into the website's own types.
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

const cache = new Map<string, Promise<unknown>>();

api.setApiBaseUrl(import.meta.env.PUBLIC_API_URL ?? "http://localhost:8080");

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

/** One API call's data, kept for the page's life; any answer but 200 is an error. */
const once = <T>(key: string, call: () => Promise<{ status: number; data: unknown }>): Promise<T> =>
  cached(key, async () => {
    const response = await call();
    if (response.status !== 200) throw new Error(`${response.status} ${key}`);
    return response.data as T;
  });

/** The composite starting on that day, as `b2001-17` (day 17 of 2001), which the charts read. */
function band(day: string): string {
  const date = new Date(`${day}T00:00:00Z`);
  const doy = Math.round((date.getTime() - Date.UTC(date.getUTCFullYear(), 0, 1)) / 86_400_000) + 1;
  return `b${date.getUTCFullYear()}-${doy}`;
}

/** The API's zone properties, in the website's shape. */
const zoneProperties = (p: api.ZoneProperties): ZoneProperties & { parent?: string } => ({
  id: p.id,
  name: p.name ?? "",
  areaKm2: p.area_km2,
  ...(p.department ? { dept: p.department } : {}),
  ...(p.section != null ? { section: p.section } : {}),
  ...(p.parent ? { parent: p.parent } : {}),
});

export const loadManifest = () =>
  cached("catalog", async (): Promise<Manifest> => {
    const catalog = await once<api.Catalog>("catalog:raw", () => api.getCatalog());
    return {
      bounds: catalog.bounds as Bounds,
      size: catalog.size as [number, number],
      liteSize: catalog.lite_size as [number, number],
      indicators: Object.fromEntries(
        Object.entries(catalog.indicators).map(([id, info]) => [
          id,
          {
            kind: info.kind,
            years: info.years,
            ...(info.min != null ? { min: info.min } : {}),
            ...(info.max != null ? { max: info.max } : {}),
            ...(info.classes ? { classes: info.classes } : {}),
          },
        ]),
      ) as Manifest["indicators"],
      padrones: catalog.padrones as Manifest["padrones"],
      seasonal: Object.fromEntries(
        Object.entries(catalog.seasonal).map(([id, days]) => [id, (days ?? []).map(band)]),
      ) as Manifest["seasonal"],
      divisions: catalog.divisions,
      outline: catalog.outline,
    };
  });

export const loadZones = (division: DivisionId) =>
  cached(`zones:${division}`, async (): Promise<ZoneCollection> => {
    const zones = await once<api.ZoneCollection>(`zones:${division}:raw`, () => api.getDivisionZones(division));
    return {
      type: "FeatureCollection",
      features: zones.features.map((f) => ({
        type: "Feature",
        ...(f.id != null ? { id: f.id } : {}),
        properties: zoneProperties(f.properties),
        geometry: f.geometry as PolygonGeometry,
      })),
    };
  });

const loadValues = <T>(division: DivisionId, indicator: IndicatorId) =>
  once<T>(`values:${division}:${indicator}`, () => api.getDivisionValues(division, indicator));
export const loadSeriesStats = (division: DivisionId, indicator: IndicatorId) =>
  loadValues<SeriesStats>(division, indicator);
export const loadSummaryStats = (division: DivisionId, indicator: IndicatorId) =>
  loadValues<SummaryStats>(division, indicator);
export const loadHistogramStats = (division: DivisionId, indicator: "compn" | "divtfe") =>
  loadValues<HistogramStats>(division, indicator);
export const loadZoneSeasonal = (division: DivisionId, id: string) =>
  cached(`seasonal:${division}:${id}`, async (): Promise<ZoneSeasonal> => {
    const response = await api.getZoneSeasonal(division, id);
    if (response.status !== 200) throw new Error(`${response.status} seasonal ${division}/${id}`);
    const { ppna, apar, et } = response.data;
    return { ppna: ppna?.values, apar: apar?.values, et: et?.values };
  });
export type ZoneMeta = { properties: ZoneProperties & { parent?: string }; geometry: PolygonGeometry; bbox: Bounds };
export const loadZoneMeta = (division: DivisionId, id: string) =>
  cached(`zone:${division}:${id}`, async (): Promise<ZoneMeta> => {
    const zone = await once<api.ZoneDetail>(`zone:${division}:${id}:raw`, () => api.getZone(division, id));
    return {
      properties: zoneProperties(zone.properties),
      geometry: zone.geometry as PolygonGeometry,
      bbox: zone.bbox as Bounds,
    };
  });
export const loadSearchIndex = () =>
  cached("search", async (): Promise<SearchEntry[]> => {
    const entries = await once<api.ZoneIndexEntry[]>("search:raw", () => api.getZoneIndex());
    return entries.map((e) => ({
      d: e.division,
      id: e.id,
      label: e.label,
      ...(e.detail ? { detail: e.detail } : {}),
      bbox: e.bbox as Bounds,
    }));
  });
export const loadPadronIndex = () => once<Record<string, number[]>>("padrones", () => api.getPadronIndex());
export const loadPadrones = (department: string) =>
  cached(`padrones:${department}`, async (): Promise<PadronCollection> => {
    const parcels = await once<api.PadronCollection>(`padrones:${department}:raw`, () =>
      api.getPadrones(department as api.Department),
    );
    return {
      type: "FeatureCollection",
      features: parcels.features.map((f) => ({
        type: "Feature",
        ...(f.id != null ? { id: f.id } : {}),
        properties: { padron: f.properties.padron, areaHa: f.properties.area_ha },
        geometry: f.geometry as PolygonGeometry,
      })),
    };
  });

/** Grayscale raster of an indicator for a year (`null` for indicators without a yearly series). */
export const rasterUrl = (indicator: IndicatorId, year: number | null, lite = false) =>
  api.apiUrl(api.getGetMapUrl(indicator, year === null ? "static" : String(year), lite ? { size: "lite" } : undefined));
export const thumbnailUrl = (indicator: IndicatorId, theme: "light" | "dark") =>
  api.apiUrl(api.getGetMapThumbnailUrl(indicator, { theme }));

export const isDivision = (value: string): value is DivisionId =>
  value === "seccionales" || /^cuencas-[1-5]$/.test(value);
