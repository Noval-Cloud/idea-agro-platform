/**
 * The country's indicators as the platform computes them: the API's `uruguay` zone and its catalog. A deploy build
 * reads them from the API; checks and local builds read `national.json`, which `node scripts/national.ts` writes
 * from the same calls.
 */

export const seasonalIds = ["ppna", "apar", "et", "rh"] as const;
export const nationalIds = [...seasonalIds, "iose", "cob", "compn", "divtfe", "csue", "ahppn"] as const;
type SeasonalId = (typeof seasonalIds)[number];
type NationalId = (typeof nationalIds)[number];

export interface Series {
  /** The first day of each composite. */
  dates: string[];
  values: (number | null)[];
}

export interface National {
  seasonal: Record<SeasonalId, Series>;
  /** A yearly indicator's years and values; one measured once has no years and its statistics as the value. */
  values: Record<NationalId, { years: number[] | null; value: unknown }>;
  /** Each map's years, and its range: the 2nd and 98th percentiles. */
  maps: Record<NationalId, { years: number[] | null; min?: number; max?: number }>;
}

type Json = Record<string, unknown>;

export async function fetchNational(base: string): Promise<National> {
  const get = async (path: string): Promise<Json> => {
    const response = await fetch(new URL(path, base));
    if (!response.ok) throw new Error(`${response.status} ${path}`);
    return (await response.json()) as Json;
  };
  const [catalog, seasonal, ...values] = await Promise.all([
    get("/v1/catalog"),
    get("/v1/zones/uruguay/1/seasonal"),
    ...nationalIds.map((id) => get(`/v1/divisions/uruguay/values/${id}`)),
  ]);
  const maps = catalog.indicators as Record<string, { years: number[] | null; min?: number; max?: number }>;
  return {
    seasonal: Object.fromEntries(
      seasonalIds.map((id) => {
        const series = seasonal[id] as Series | undefined;
        return [id, { dates: series?.dates ?? [], values: series?.values ?? [] }];
      }),
    ) as National["seasonal"],
    values: Object.fromEntries(
      nationalIds.map((id, i) => {
        const file = values[i] as { years: number[] | null; values: Record<string, unknown> };
        return [id, { years: file.years, value: file.values["1"] ?? null }];
      }),
    ) as National["values"],
    maps: Object.fromEntries(
      nationalIds.map((id) => [id, { years: maps[id]?.years ?? null, min: maps[id]?.min, max: maps[id]?.max }]),
    ) as National["maps"],
  };
}
