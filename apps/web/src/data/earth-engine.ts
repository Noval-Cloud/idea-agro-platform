import type { IndicatorId } from "./indicators";

/** How often an asset gains data: a band per 16- or 8-day composite, one per year, or a single map. */
export type EarthEngineCadence = "days16" | "days8" | "yearly" | "fixed";

/** An Earth Engine asset an indicator is computed from, and how its bands are named. */
export type EarthEngineSource = { asset: string; bands?: string; cadence: EarthEngineCadence };

const own = (path: string) => `projects/pastizalesrou/assets/${path}`;

/** What the data job reads for each indicator (`services/jobs`, `earth.py`). */
export const earthEngineSources: Record<IndicatorId, EarthEngineSource[]> = {
  apar: [{ asset: own("apar/apar-16"), bands: "b<year>-<day>", cadence: "days16" }],
  cob: [
    {
      asset: "projects/MapBiomas_Pampa/public/collection2/mapbiomas_pampa_collection2_integration_v1",
      bands: "classification_<year>",
      cadence: "yearly",
    },
  ],
  ppna: [{ asset: own("ppna/ppna-16"), bands: "b<year>-<day>", cadence: "days16" }],
  compn: [{ asset: own("comunidades/ComunidadesPastizal"), cadence: "fixed" }],
  rh: [{ asset: own("rh/rh-16"), bands: "b<year>-<day>", cadence: "days16" }],
  et: [{ asset: own("et/et-8"), bands: "b<year>-<day>", cadence: "days8" }],
  iose: [{ asset: own("iose/iose_Historica"), bands: "b<year>", cadence: "yearly" }],
  divtfe: [{ asset: own("EFT/TFE_17-19"), cadence: "fixed" }],
  csue: [{ asset: own("Soil/RUSLE_agricola_17-19"), cadence: "fixed" }],
  ahppn: [{ asset: own("AHPPN/AHPPN_17-19_sin0"), cadence: "fixed" }],
};

export const earthEngineLink = (asset: string) => `https://code.earthengine.google.com/?asset=${asset}`;
