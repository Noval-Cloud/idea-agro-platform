import type { PolygonGeometry } from "./data";

/*
 * Until it is saved to the account, a zone the reader uploaded or drew reaches the zone page through this
 * browser session (the zone page opens in the same tab or a new one of the same session).
 */
const KEY = "ia-custom-zones";
type Stored = { key: string; name: string; geometry: PolygonGeometry };

function readAll(): Record<string, Stored> {
  try {
    return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Record<string, Stored>;
  } catch {
    return {};
  }
}

export function saveCustomZone(zone: Stored) {
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ ...readAll(), [zone.key]: zone }));
  } catch {
    // Storage can be unavailable (private mode, blocked site data): the zone page then says it is not found.
  }
}

export const readCustomZone = (key: string): Stored | null => readAll()[key] ?? null;
