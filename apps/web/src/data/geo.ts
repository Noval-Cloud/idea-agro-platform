import { geoMercator, geoPath, type GeoPermissibleObjects } from "d3-geo";
import seccionales from "./snapshot/seccionales.json";
import outlines from "./snapshot/outlines.json";
import { departmentName } from "./departments";

/*
 * Every map is projected at build time into plain SVG paths, so the browser receives
 * finished geometry and no mapping library.
 */

type Geometry = GeoPermissibleObjects;
type Ring = [number, number][];

/*
 * GEE exports GeoJSON with counter-clockwise outer rings (RFC 7946); d3-geo works on the sphere
 * and reads that as "everything except this polygon". Outer rings become clockwise, holes the opposite.
 */
const signedArea = (ring: Ring) =>
  ring.reduce((sum, [x1, y1], i) => {
    const [x2, y2] = ring[(i + 1) % ring.length];
    return sum + (x2 - x1) * (y2 + y1);
  }, 0);
const orient = (ring: Ring, clockwise: boolean) => (signedArea(ring) > 0 === clockwise ? ring : [...ring].reverse());
const rewindPolygon = (rings: Ring[]) => rings.map((ring, i) => orient(ring, i === 0));

function rewind(geometry: any): Geometry {
  switch (geometry?.type) {
    case "Polygon":
      return { type: "Polygon", coordinates: rewindPolygon(geometry.coordinates) };
    case "MultiPolygon":
      return { type: "MultiPolygon", coordinates: geometry.coordinates.map(rewindPolygon) };
    case "GeometryCollection":
      return { type: "GeometryCollection", geometries: geometry.geometries.map(rewind) } as Geometry;
    default:
      return geometry;
  }
}

const rou = rewind(outlines.rou);

type Point = [number, number];

/** Douglas–Peucker on projected points: drops vertices closer than `tolerance` pixels to the line. */
function simplifyPoints(points: Point[], tolerance: number): Point[] {
  if (points.length <= 3) return points;
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  const sq = tolerance * tolerance;
  while (stack.length) {
    const [start, end] = stack.pop()!;
    const [ax, ay] = points[start];
    const [bx, by] = points[end];
    const dx = bx - ax;
    const dy = by - ay;
    const len = dx * dx + dy * dy || 1;
    let worst = 0;
    let index = -1;
    for (let i = start + 1; i < end; i++) {
      const [px, py] = points[i];
      const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len));
      const ex = ax + t * dx - px;
      const ey = ay + t * dy - py;
      const dist = ex * ex + ey * ey;
      if (dist > worst) {
        worst = dist;
        index = i;
      }
    }
    if (worst > sq && index > 0) {
      keep[index] = 1;
      stack.push([start, index], [index, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/** Polygon rings of any (multi)polygon or collection. */
function rings(geometry: any): Ring[][] {
  switch (geometry?.type) {
    case "Polygon":
      return [geometry.coordinates];
    case "MultiPolygon":
      return geometry.coordinates;
    case "GeometryCollection":
      return geometry.geometries.flatMap(rings);
    default:
      return [];
  }
}

/**
 * A compact SVG path: projected, simplified below a pixel, relative commands rounded to `digits`
 * decimals (whole units by default). Rings that collapse under the tolerance are dropped.
 */
export function compactPath(
  geometry: Geometry,
  projection: (p: Point) => Point | null,
  tolerance = 1.2,
  digits = 0,
): string {
  const scale = 10 ** digits;
  const round = (v: number) => Math.round(v * scale) / scale;
  // Relative pairs after the first `l` need no command letter, and a minus sign is its own separator.
  const pair = (dx: number, dy: number) => `${dx}${dy < 0 ? "" : ","}${dy}`;
  let d = "";
  for (const polygon of rings(geometry)) {
    for (const ring of polygon) {
      const projected = ring.map((p) => projection(p)).filter((p): p is Point => p !== null);
      const simple = simplifyPoints(projected, tolerance);
      if (simple.length < 4) continue;
      // Rounding the absolute points (not the deltas) keeps the outline from drifting.
      let [px, py] = simple[0].map(round) as Point;
      d += `M${pair(px, py)}`;
      let first = true;
      for (const [x, y] of simple.slice(1)) {
        const [rx, ry] = [round(x), round(y)];
        const [dx, dy] = [round(rx - px), round(ry - py)];
        if (dx === 0 && dy === 0) continue;
        d += first ? `l${pair(dx, dy)}` : `${dx < 0 ? "" : " "}${pair(dx, dy)}`;
        first = false;
        px = rx;
        py = ry;
      }
      d += "z";
    }
  }
  return d;
}

/** A projection that fits Uruguay into a box of the given width. */
export function fitUruguay(width: number) {
  const projection = geoMercator().fitWidth(width, rou);
  const path = geoPath(projection).digits(1);
  const [[, y0], [, y1]] = path.bounds(rou);
  return { projection, path, width, height: Math.ceil(y1 - y0) };
}

export const outlinePath = (projection: (p: Point) => Point | null) => compactPath(rou, projection);

/** Anomaly classes for the hero map: three below, usual, three above. */
export const anomalyThresholds = [-0.25, -0.15, -0.05, 0.05, 0.15, 0.25] as const;
export const anomalyClass = (anomaly: number) => {
  const index = anomalyThresholds.findIndex((t) => anomaly < t);
  return index === -1 ? anomalyThresholds.length + 1 : index + 1;
};

export type Sectional = {
  id: string;
  department: string;
  number: number;
  now: number | null;
  average: number | null;
  /** Relative difference from the historical mean, only where the estimate is reliable. */
  anomaly: number | null;
  geometry: Geometry;
};

/*
 * A district is coloured only where the estimate stands on enough grassland and on a plausible
 * historical mean; the rest shows as "not enough data" instead of a misleading extreme.
 */
export const reliability = { minGrassKm2: 25, minAverage: 100 } as const;

export const sectionals: Sectional[] = seccionales.features.map((f) => {
  const { id, dept, section, now, avg, grassKm2 } = f.properties as {
    id: string;
    dept: string;
    section: number;
    now: number | null;
    avg: number | null;
    grassKm2?: number;
  };
  const reliable =
    now !== null && avg !== null && avg >= reliability.minAverage && (grassKm2 ?? 0) >= reliability.minGrassKm2;
  const anomaly = reliable ? (now as number) / (avg as number) - 1 : null;
  return {
    id,
    department: departmentName(dept),
    number: section,
    now,
    average: avg,
    anomaly,
    geometry: rewind(f.geometry),
  };
});

export const sectionalPeriod = seccionales.period;

export const basins = Object.fromEntries(
  Object.entries(outlines.basins).map(([level, fc]) => [Number(level), fc.features.map((f) => rewind(f.geometry))]),
) as Record<1 | 2 | 3, Geometry[]>;

/** Basin counts per level, from the source layers (levels 4 and 5 are not drawn). */
export const basinCounts = { 1: 6, 2: 47, 3: 296, 4: 917, 5: 1426 } as const;
export const padronCount = 102886;

export const padronSample = {
  bbox: outlines.padronesSample.bbox as [number, number, number, number],
  geometries: outlines.padronesSample.features.map((f) => rewind(f.geometry)),
};

/** A projection that fits a bounding box (lon/lat) into a square-ish frame. */
export function fitBox(bbox: [number, number, number, number], width: number) {
  const [west, south, east, north] = bbox;
  const frame: Geometry = {
    type: "Polygon",
    // Clockwise, so d3-geo reads it as the box and not as the rest of the globe.
    coordinates: [
      [
        [west, south],
        [west, north],
        [east, north],
        [east, south],
        [west, south],
      ],
    ],
  };
  const projection = geoMercator().fitWidth(width, frame);
  const path = geoPath(projection).digits(1);
  const [[, y0], [, y1]] = path.bounds(frame);
  return { projection, path, width, height: Math.ceil(y1 - y0), frame };
}
