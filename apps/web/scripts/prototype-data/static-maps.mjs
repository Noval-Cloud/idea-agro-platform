// Static national maps for the landing and the indicator atlas, drawn from the explorer's rasters
// so every page shows the same values on the same color scale.
// Usage: node scripts/prototype-data/static-maps.mjs <web repo>
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";

import { resolve } from "node:path";

const WEB = resolve(process.argv[2] ?? ".");
const sharp = createRequire(WEB + "/package.json")("sharp");
const OUT = WEB + "/src/assets/maps";
const DATA = WEB + "/public/explorer";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const manifest = readJson(`${DATA}/manifest.json`);
const theme = readJson(`${WEB}/src/design/generated/map-theme.json`);
const ramps = readJson(`${WEB}/src/design/generated/data-ramps.json`);
const WIDTH = 960;
const families = {
  apar: "productivity",
  ppna: "productivity",
  cob: "ecosystem",
  compn: "ecosystem",
  rh: "water",
  et: "water",
  iose: "ecosystem",
  divtfe: "ecosystem",
  csue: "soil",
  ahppn: "human",
};
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const decode = async (file) => {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
};

// The country's land (any MapBiomas class) gives the silhouette where an indicator has no data.
const country = await decode(`${DATA}/rasters/cob/2021.webp`);

/** Mean gray level per pixel over several years (valid pixels only); gray is linear in the value. */
async function meanOf(id, years) {
  const rasters = await Promise.all(years.map((y) => decode(`${DATA}/rasters/${id}/${y}.webp`)));
  const { width, height } = rasters[0];
  const data = Buffer.alloc(width * height * 4);
  for (let p = 0; p < width * height; p++) {
    let sum = 0;
    let n = 0;
    for (const r of rasters)
      if (r.data[p * 4 + 3] >= 128) {
        sum += r.data[p * 4];
        n++;
      }
    if (n) data.set([Math.round(sum / n), 0, 0, 255], p * 4);
  }
  return { data, width, height };
}

async function render(raster, paint, file) {
  for (const t of ["light", "dark"]) {
    const land = hex(ramps[t].land);
    const out = Buffer.alloc(raster.width * raster.height * 4);
    for (let p = 0; p < raster.width * raster.height; p++) {
      const inCountry = country.data[p * 4 + 3] >= 128;
      const rgb = raster.data[p * 4 + 3] >= 128 ? paint(raster.data[p * 4], t) : null;
      if (rgb) out.set([...rgb, 255], p * 4);
      else if (inCountry) out.set([...land, 255], p * 4);
    }
    await sharp(out, { raw: { width: raster.width, height: raster.height, channels: 4 } })
      .resize({ width: file.includes("community") ? 420 : WIDTH })
      .webp({ quality: 82 })
      .toFile(`${OUT}/${file}-${t}.webp`);
  }
  console.log("map", file);
}

// Lookup tables are built once per family and theme (the per-pixel loops only index them).
const luts = {};
const lut = (family, t) => (luts[`${family}-${t}`] ??= theme[t].luts[family].map(hex));
const strong = (family, t) => lut(family, t)[Math.round(0.72 * (lut(family, t).length - 1))];

for (const [id, ind] of Object.entries(manifest.indicators)) {
  const family = families[id];
  if (ind.kind === "categorical") {
    const raster = await decode(`${DATA}/rasters/${id}/static.webp`);
    for (const k of ind.classes)
      await render(raster, (g, t) => (Math.round(g / 51) === k ? strong(family, t) : null), `community-${k}`);
    continue;
  }
  // RH is shown as the mean of its years (as the atlas says); the others as their latest year.
  const raster =
    id === "rh"
      ? await meanOf(id, ind.years)
      : await decode(`${DATA}/rasters/${id}/${ind.years ? ind.years[ind.years.length - 1] : "static"}.webp`);
  const paint =
    ind.kind === "binary"
      ? (g, t) => (g >= 128 ? strong(family, t) : null)
      : (g, t) => lut(family, t)[Math.round((g / 255) * (lut(family, t).length - 1))];
  await render(raster, paint, id);
}

// The atlas legends read the same fixed scale as the explorer (RH is stored per month there: ×12 in the legend).
const statsFile = `${WEB}/src/data/snapshot/map-stats.json`;
const stats = readJson(statsFile);
for (const [id, s] of Object.entries(stats.stats)) {
  const ind = manifest.indicators[id];
  if (ind?.min === undefined) continue;
  const factor = id === "rh" ? 12 : 1;
  s.p2 = +(ind.min / factor).toFixed(4);
  s.p98 = +(ind.max / factor).toFixed(4);
}
writeFileSync(statsFile, JSON.stringify(stats) + "\n");
console.log("map stats");
