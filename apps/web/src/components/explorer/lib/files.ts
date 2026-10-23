import type { PolygonGeometry } from "./data";
import { areaKm2 } from "./geo";

/** A polygon the reader brought: from a file, drawn on the map, or saved to their account. */
export type CustomZone = { key: string; name: string; areaKm2: number; geometry: PolygonGeometry };
/** File and drawn layers live in the session until saved; the saved one comes from the account. */
export type CustomLayer = { key: string; name: string; source: "file" | "drawn" | "saved"; zones: CustomZone[] };

type AnyGeoJson = {
  type: string;
  features?: AnyGeoJson[];
  geometry?: AnyGeoJson | null;
  geometries?: AnyGeoJson[];
  coordinates?: unknown;
  properties?: Record<string, unknown> | null;
};

/** Every polygon in a GeoJSON object, with a name when the source has one. */
function polygons(input: AnyGeoJson | AnyGeoJson[]): { name?: string; geometry: PolygonGeometry }[] {
  if (Array.isArray(input)) return input.flatMap(polygons);
  if (input.type === "FeatureCollection") return (input.features ?? []).flatMap(polygons);
  if (input.type === "Feature") {
    const name = ["name", "Name", "NOMBRE", "nombre", "title"]
      .map((k) => input.properties?.[k])
      .find((v): v is string | number => (typeof v === "string" && v !== "") || typeof v === "number");
    return input.geometry
      ? polygons(input.geometry).map((p) => ({ ...p, name: p.name ?? (name === undefined ? undefined : String(name)) }))
      : [];
  }
  if (input.type === "GeometryCollection") return (input.geometries ?? []).flatMap(polygons);
  if (input.type === "Polygon" || input.type === "MultiPolygon")
    return [{ geometry: input as unknown as PolygonGeometry }];
  return [];
}

/** The files zones can come from: GeoJSON, KML, KMZ and zipped Shapefiles. */
export const zoneFileTypes = ".geojson,.json,.kml,.kmz,.zip";

async function fromKml(text: string): Promise<AnyGeoJson> {
  const { kml } = await import("@tmcw/togeojson");
  return kml(new DOMParser().parseFromString(text, "text/xml")) as AnyGeoJson;
}

/** A KMZ is a zip whose main document is its first KML file. */
async function fromKmz(file: File): Promise<AnyGeoJson> {
  const { unzipSync } = await import("fflate");
  const files = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => entry.name.toLowerCase().endsWith(".kml"),
  });
  const document = Object.keys(files).sort()[0];
  if (!document) throw new Error(`No KML inside ${file.name}`);
  return fromKml(new TextDecoder().decode(files[document]));
}

export async function readZoneFile(file: File, unnamed: (n: number) => string): Promise<CustomZone[]> {
  const name = file.name.toLowerCase();
  let data: AnyGeoJson | AnyGeoJson[];
  if (name.endsWith(".zip")) {
    const { default: shp } = await import("shpjs");
    data = (await shp(await file.arrayBuffer())) as AnyGeoJson | AnyGeoJson[];
  } else if (name.endsWith(".kmz")) {
    data = await fromKmz(file);
  } else if (name.endsWith(".kml")) {
    data = await fromKml(await file.text());
  } else {
    data = JSON.parse(await file.text()) as AnyGeoJson;
  }
  return polygons(data).map((p, i) => ({
    key: `${file.name}-${i}`,
    name: p.name ?? unnamed(i + 1),
    areaKm2: areaKm2(p.geometry),
    geometry: p.geometry,
  }));
}

/** The API takes at most this many zones, and this many bytes, in one import. */
const IMPORT_ZONES = 100;
const IMPORT_BYTES = 4_500_000;

/** Splits zones into imports the API accepts. */
export function importBatches<Z>(zones: Z[]): Z[][] {
  const batches: Z[][] = [];
  let batch: Z[] = [];
  let bytes = 0;
  for (const zone of zones) {
    const size = JSON.stringify(zone).length;
    if (batch.length && (batch.length === IMPORT_ZONES || bytes + size > IMPORT_BYTES)) {
      batches.push(batch);
      batch = [];
      bytes = 0;
    }
    batch.push(zone);
    bytes += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
