import type { ZoneGeometry } from "./data";
import { importBatches } from "./files";
import type { MyZone } from "./my-zones";

/*
 * The account's side of the reader's zones, through the API. The account code and the client load on demand,
 * so the map's first view never waits for them.
 */

const modules = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** The zones in the account; throws the account's SignedOut when nobody is signed in. */
export async function loadAccountZones(): Promise<MyZone[]> {
  const [{ privately }, { getSavedZoneFeatures }] = await modules();
  const response = await privately((init) => getSavedZoneFeatures(init));
  if (response.status !== 200) throw new Error(`${response.status}`);
  return response.data.features.map((f) => ({
    key: f.id,
    name: f.properties.name,
    source: f.properties.source,
    areaKm2: f.properties.area_ha / 100,
    geometry: f.geometry as ZoneGeometry,
  }));
}

/**
 * Saves the zones to the account, one import at a time. Returns the id each saved zone got, by its key here,
 * and the API's reason when an import is refused: the zones of the imports before it are saved all the same.
 */
export async function saveToAccount(zones: MyZone[]): Promise<{ ids: Map<string, string>; refused?: string }> {
  const [{ privately }, { importSavedZones }] = await modules();
  const ids = new Map<string, string>();
  for (const batch of importBatches(zones)) {
    const body = { zones: batch.map((z) => ({ name: z.name, source: z.source, geometry: z.geometry })) };
    const response = await privately((init) => importSavedZones(body, init));
    if (response.status !== 201)
      return { ids, refused: (response.data as { detail?: string | null }).detail ?? String(response.status) };
    // The API answers with the saved zones in the order they were sent.
    response.data.forEach((saved, i) => ids.set(batch[i].key, saved.id));
  }
  return { ids };
}

export async function deleteFromAccount(id: string): Promise<void> {
  const [{ privately }, { deleteSavedZone }] = await modules();
  const response = await privately((init) => deleteSavedZone(id, init));
  if (response.status !== 204 && response.status !== 404) throw new Error(`${response.status}`);
}
