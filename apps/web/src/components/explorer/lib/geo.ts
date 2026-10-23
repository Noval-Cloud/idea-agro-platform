import type { Bounds, PolygonGeometry, Position } from "./data";

/** Outer and inner rings of a (multi)polygon, flattened. */
export const ringsOf = (geometry: PolygonGeometry): Position[][] =>
  geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();

export function bboxOf(geometry: PolygonGeometry): Bounds {
  let [west, south, east, north] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of ringsOf(geometry)) {
    for (const [lng, lat] of ring) {
      west = Math.min(west, lng);
      east = Math.max(east, lng);
      south = Math.min(south, lat);
      north = Math.max(north, lat);
    }
  }
  return [west, south, east, north];
}

export const unionBounds = (boxes: Bounds[]): Bounds => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];

const EARTH_RADIUS = 6_371_008.8;
const rad = (degrees: number) => (degrees * Math.PI) / 180;

/** Spherical area of a ring in m² (Chamberlain & Duquette), sign by orientation. */
function ringArea(ring: Position[]): number {
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    total += rad(lng2 - lng1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return (total * EARTH_RADIUS * EARTH_RADIUS) / 2;
}

/** Area in km²: outer rings minus holes. */
export function areaKm2(geometry: PolygonGeometry): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  let total = 0;
  for (const [outer, ...holes] of polygons) {
    total += Math.abs(ringArea(outer));
    for (const hole of holes) total -= Math.abs(ringArea(hole));
  }
  return total / 1e6;
}

/** A point inside the polygon to anchor its card: the middle of the widest horizontal chord near its center. */
export function anchorOf(geometry: PolygonGeometry): Position {
  const [west, south, east, north] = bboxOf(geometry);
  const lat = (south + north) / 2;
  const crossings: number[] = [];
  for (const ring of ringsOf(geometry)) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [x1, y1] = ring[j];
      const [x2, y2] = ring[i];
      if (y1 > lat !== y2 > lat) crossings.push(x1 + ((lat - y1) / (y2 - y1)) * (x2 - x1));
    }
  }
  crossings.sort((a, b) => a - b);
  let best: Position = [(west + east) / 2, lat];
  let widest = -1;
  for (let i = 0; i + 1 < crossings.length; i += 2) {
    const width = crossings[i + 1] - crossings[i];
    if (width > widest) {
      widest = width;
      best = [(crossings[i] + crossings[i + 1]) / 2, lat];
    }
  }
  return best;
}

/** Folds text for matching: lower case, no accents, single spaces. */
export const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** "CIUDAD DE TACUAREMBÓ" → "Ciudad de Tacuarembó" (Spanish small words stay lower case). */
export function titleCase(text: string) {
  const small = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "al", "en"]);
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => (i > 0 && small.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(" ");
}
