import type { ProjectOut, ProjectSummary } from "@idea-agro/api-client";
import { isDivision, loadPadrones, loadZoneMeta, type DivisionId, type ZoneGeometry } from "./data";

/*
 * The reader's projects on the map, through the API. Projects hold references to zones: saved zones are drawn
 * from the project (so members see each other's), predefined zones and parcels from the public data.
 */

const modules = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** A zone of a project, ready for the map. */
export type ProjectZone = {
  /** The item's key: `saved:<id>`, `<division>:<id>` or `padron:<department>:<number>`. */
  key: string;
  kind: "saved" | "division" | "padron";
  /** The saved zone's id, the division's zone id, or `<department>:<number>`. */
  id: string;
  division?: DivisionId;
  name: string;
  areaKm2: number;
  geometry: ZoneGeometry;
};

export async function loadProjects(): Promise<ProjectSummary[]> {
  const [{ privately }, { listProjects }] = await modules();
  const response = await privately((init) => listProjects(init));
  if (response.status !== 200) throw new Error(`${response.status}`);
  return response.data;
}

export async function loadProject(id: string): Promise<ProjectOut> {
  const [{ privately }, { getProject }] = await modules();
  const response = await privately((init) => getProject(id, init));
  if (response.status !== 200) throw new Error(`${response.status}`);
  return response.data;
}

/** At most this many outlines are asked for at once. */
const PARALLEL = 6;

async function inTurns<T, R>(items: T[], each: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await each(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, items.length) }, worker));
  return out;
}

/** The project's zones with their outlines; a zone whose outline cannot be read is left out. */
export async function projectZones(
  project: ProjectOut,
  names: { padron: (n: number) => string },
): Promise<ProjectZone[]> {
  const [{ privately }, { getProjectZoneGeometry }] = await modules();
  const zones = await inTurns(project.items, async (item): Promise<ProjectZone | null> => {
    try {
      if (item.kind === "saved") {
        if (!item.zone) return null;
        const zone = item.zone;
        const outline = await privately((init) => getProjectZoneGeometry(project.id, zone.id, init));
        if (outline.status !== 200) return null;
        return {
          key: `saved:${zone.id}`,
          kind: "saved",
          id: zone.id,
          name: zone.name,
          areaKm2: zone.area_ha / 100,
          geometry: outline.data as ZoneGeometry,
        };
      }
      if (item.kind === "division") {
        if (!isDivision(item.division)) return null;
        const meta = await loadZoneMeta(item.division, item.zone_id);
        return {
          key: `${item.division}:${item.zone_id}`,
          kind: "division",
          id: item.zone_id,
          division: item.division,
          name: meta.properties.name || item.zone_id,
          areaKm2: meta.properties.areaKm2,
          geometry: meta.geometry,
        };
      }
      const parcels = await loadPadrones(item.department);
      const parcel = parcels.features.find((f) => f.properties.padron === item.padron);
      if (!parcel) return null;
      return {
        key: `padron:${item.department}:${item.padron}`,
        kind: "padron",
        id: `${item.department}:${item.padron}`,
        name: names.padron(item.padron),
        areaKm2: parcel.properties.areaHa / 100,
        geometry: parcel.geometry,
      };
    } catch {
      return null;
    }
  });
  return zones.filter((z): z is ProjectZone => z !== null);
}

/** Adds saved zones to a project; returns how many it could not add. */
export async function addSavedZones(projectId: string, zoneIds: string[]): Promise<number> {
  const [{ privately }, { addProjectItem }] = await modules();
  const results = await inTurns(zoneIds, (id) =>
    privately((init) => addProjectItem(projectId, { kind: "saved", zone_id: id }, init)).then(
      (r) => r.status === 200,
      () => false,
    ),
  );
  return results.filter((added) => !added).length;
}

/** Creates a project; returns its id. */
export async function createProject(name: string): Promise<string> {
  const [{ privately }, { createProject: create }] = await modules();
  const response = await privately((init) => create({ name }, init));
  if (response.status !== 201)
    throw new Error((response.data as { detail?: string | null }).detail ?? `${response.status}`);
  return response.data.id;
}
