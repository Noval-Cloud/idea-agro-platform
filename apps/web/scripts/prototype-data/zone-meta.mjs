// Per-zone files for the zone page and the country outline for its locator map.
// Usage: node zone-meta.mjs <web repo>
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
const [WEB] = process.argv.slice(2);
const OUT = WEB + "/public/explorer";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const manifest = readJson(`${OUT}/manifest.json`);
const rings = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
for (const div of process.argv.includes("--outline") ? [] : Object.keys(manifest.divisions)) {
  mkdirSync(`${OUT}/zones/${div}`, { recursive: true });
  for (const f of readJson(`${OUT}/zones/${div}.json`).features) {
    let b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const r of rings(f.geometry))
      for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
    writeFileSync(
      `${OUT}/zones/${div}/${f.properties.id}.json`,
      JSON.stringify({ properties: f.properties, geometry: f.geometry, bbox: b }),
    );
  }
  console.log("zone files", div);
}
// Country outline in the same Web Mercator frame as the rasters, 200 units wide.
const [W, S, E, N] = manifest.bounds;
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const width = 200;
const height = Math.round((width * (merc(N) - merc(S))) / (((E - W) * Math.PI) / 180));
const px = ([lng, lat]) => [((lng - W) / (E - W)) * width, ((merc(N) - merc(lat)) / (merc(N) - merc(S))) * height];
const simplify = (pts, tol) => {
  if (pts.length < 3) return pts;
  const keep = Array.from({ length: pts.length }, () => false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0,
      idx = -1;
    const [x1, y1] = pts[a],
      [x2, y2] = pts[b];
    for (let i = a + 1; i < b; i++) {
      const [x, y] = pts[i];
      const d = Math.abs((y2 - y1) * x - (x2 - x1) * y + x2 * y1 - y2 * x1) / (Math.hypot(x2 - x1, y2 - y1) || 1);
      if (d > max) {
        max = d;
        idx = i;
      }
    }
    if (max > tol) {
      keep[idx] = true;
      stack.push([a, idx], [idx, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
};
// The six grade 1 basins tile the whole country: drawn with matching fill and stroke they make its silhouette.
const basins = readJson(`${OUT}/zones/cuencas-1.json`).features;
// A closed ring starts and ends on the same point, so it is simplified as two halves.
const simplifyRing = (pts, tol) => {
  const far = pts.reduce(
    (best, p, i) =>
      Math.hypot(p[0] - pts[0][0], p[1] - pts[0][1]) > Math.hypot(pts[best][0] - pts[0][0], pts[best][1] - pts[0][1])
        ? i
        : best,
    0,
  );
  return [...simplify(pts.slice(0, far + 1), tol), ...simplify(pts.slice(far), tol).slice(1)];
};
const d = basins
  .flatMap((f) => rings(f.geometry))
  .map((ring) => simplifyRing(ring.map(px), 0.9))
  .filter((r) => r.length > 3)
  .map((r) => "M" + r.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join("L") + "Z")
  .join("");
manifest.outline = { width, height, d };
writeFileSync(`${OUT}/manifest.json`, JSON.stringify(manifest));
console.log("outline", d.length, "chars", width, height);
