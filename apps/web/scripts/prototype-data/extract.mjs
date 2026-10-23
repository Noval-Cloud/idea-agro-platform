// One-off extraction of prototype data for the explorer (map) and zone pages.
// Usage: node extract.mjs <old inia repo (node_modules + key)> <web repo> <phase> [...]
// Phases: scale rasters zones stats seasonal padrones. Outputs land in <web>/public/explorer.
// Everything is resumable: files that already exist are skipped.
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
const require = createRequire(import.meta.url);
const [ROOT, WEB, ...phases] = process.argv.slice(2);
const sharp = createRequire(WEB + "/package.json")("sharp");
const ee = require(ROOT + "/node_modules/@google/earthengine");
const key = require(ROOT + "/apps/inia-server/src/config/credentials/gee-key.json");
const OUT = WEB + "/public/explorer";
// Intermediate files (seasonal series by division) stay out of the published folder.
const RAW = WEB + "/.cache/prototype-data/";
for (const d of [OUT, RAW]) mkdirSync(d, { recursive: true });

const P = "projects/pastizalesrou/assets/";
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const ev = (o) => new Promise((res, rej) => o.evaluate((v, e) => (e ? rej(new Error(String(e))) : res(v))));
const thumb = (img, params) =>
  new Promise((res, rej) => img.getThumbURL(params, (url, e) => (e ? rej(new Error(String(e))) : res(url))));
const retry = async (label, fn, tries = 4) => {
  for (let i = 1; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= tries) throw e;
      log("retry", label, i, String(e.message).slice(0, 160));
      await new Promise((r) => setTimeout(r, 4000 * i));
    }
  }
};
const writeJson = (path, obj) => {
  mkdirSync(path.slice(0, path.lastIndexOf("/")), { recursive: true });
  writeFileSync(path, JSON.stringify(obj));
};
const readJson = (path) => JSON.parse(readFileSync(path, "utf8"));
const round = (v, d) => (v == null || Number.isNaN(v) ? null : +(+v).toFixed(d));

await new Promise((res, rej) => ee.data.authenticateViaPrivateKey(key, () => ee.initialize(null, null, res, rej), rej));
log("GEE ready");

const ROU = ee.FeatureCollection(P + "general/limite_oficial_rou_km2").geometry();
// Bounds of the country (lon/lat), padded a little so outlines never touch the image edge.
const BOUNDS = [-58.46, -34.99, -53.16, -30.07];
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
const WIDTH = 1600;
const HEIGHT = Math.round(
  (WIDTH * (mercY(BOUNDS[3]) - mercY(BOUNDS[1]))) / (((BOUNDS[2] - BOUNDS[0]) * Math.PI) / 180),
);
const RECT = ee.Geometry.Rectangle(BOUNDS, "EPSG:4326", false);

const ppna = ee.Image(P + "ppna/ppna-16");
const apar = ee.Image(P + "apar/apar-16");
const et = ee.Image(P + "et/et-8");
const rhAnnual = ee.Image(P + "rh/rh_PromedioAnual");
const iose = ee.Image(P + "iose/iose_Historica");
const mb = ee.Image("projects/MapBiomas_Pampa/public/collection2/mapbiomas_pampa_collection2_integration_v1");
const cpur = ee.Image("users/bagnato/PronosticoForrajero/ComunidadesDePastizal/ComunidadesPastizal");
const eft = ee.Image(P + "EFT/TFE_17-19");
const soil = ee.Image(P + "Soil/RUSLE_agricola_17-19");
const ahppn = ee.Image(P + "AHPPN/AHPPN_17-19_sin0");

const [ppnaBands, aparBands, etBands] = await Promise.all([
  ev(ppna.bandNames()),
  ev(apar.bandNames()),
  ev(et.bandNames()),
]);
// Productive year Y runs from mid July of Y to mid July of Y+1.
const yearBands = (bands, year, perYear) => {
  const middle = Math.ceil(365 / ((365 / perYear) * 2));
  return bands.filter((b) => {
    const [y, doy] = b.slice(1).split("-").map(Number);
    const idx = Math.round((doy - 1) / (365 / perYear));
    return (y === year && idx >= middle) || (y === year + 1 && idx < middle);
  });
};
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

const indicators = {
  ppna: {
    kind: "continuous",
    years: range(2001, 2025),
    annual: (y) => ppna.select(yearBands(ppnaBands, y, 23)).reduce(ee.Reducer.sum()),
    scale: 500,
  },
  apar: {
    kind: "continuous",
    years: range(2001, 2025),
    annual: (y) => apar.select(yearBands(aparBands, y, 23)).reduce(ee.Reducer.sum()),
    scale: 500,
  },
  et: {
    kind: "continuous",
    years: range(2001, 2025),
    annual: (y) =>
      et
        .select(yearBands(etBands, y, 46))
        .reduce(ee.Reducer.sum())
        .multiply(8),
    scale: 500,
  },
  rh: {
    kind: "continuous",
    years: range(2003, 2021),
    annual: (y) => rhAnnual.select("b" + y).multiply(12),
    scale: 1000,
  },
  iose: { kind: "continuous", years: range(2000, 2021), annual: (y) => iose.select("b" + y), scale: 500 },
  cob: { kind: "binary", years: range(1985, 2021), annual: (y) => mb.select("classification_" + y).eq(12), scale: 500 },
  compn: { kind: "categorical", classes: [1, 2, 3, 4, 5], image: cpur.updateMask(cpur.gt(0)) },
  divtfe: { kind: "continuous", image: eft.toInt().entropy(ee.Kernel.square({ radius: 4 })) },
  csue: { kind: "continuous", image: soil },
  ahppn: { kind: "continuous", image: ahppn.multiply(100) },
};
const imageAt = (id, year) => {
  const ind = indicators[id];
  return (year == null ? ind.image : ind.annual(year)).rename("v").clip(ROU);
};

const manifestPath = `${OUT}/manifest.json`;
const manifest = existsSync(manifestPath) ? readJson(manifestPath) : {};
manifest.bounds = BOUNDS;
manifest.size = [WIDTH, HEIGHT];
manifest.indicators ??= {};
const saveManifest = () => writeJson(manifestPath, manifest);

// Fixed color scale per indicator across all its years (p2 of the lowest year, p98 of the highest),
// so a time-lapse shows real change instead of a rescaled image.
if (phases.includes("scale")) {
  for (const [id, ind] of Object.entries(indicators)) {
    if (manifest.indicators[id]?.min != null || ind.kind !== "continuous") {
      manifest.indicators[id] = {
        ...manifest.indicators[id],
        kind: ind.kind,
        years: ind.years ?? null,
        classes: ind.classes,
      };
      continue;
    }
    const years = ind.years ?? [null];
    const pct = await retry("scale " + id, () =>
      ev(
        ee.List(
          years.map((y) =>
            imageAt(id, y).reduceRegion({
              reducer: ee.Reducer.percentile([2, 98]),
              geometry: ROU,
              scale: 3000,
              maxPixels: 1e10,
              bestEffort: true,
            }),
          ),
        ),
      ),
    );
    const min = Math.min(...pct.map((p) => p.v_p2));
    const max = Math.max(...pct.map((p) => p.v_p98));
    manifest.indicators[id] = { kind: ind.kind, years: ind.years ?? null, min: round(min, 4), max: round(max, 4) };
    log("scale", id, min, max);
    saveManifest();
  }
  saveManifest();
}

// Grayscale rasters (value → 0..255, mask → transparent) in Web Mercator over BOUNDS.
// The browser colors them with the theme's ramp, so one file serves light and dark.
if (phases.includes("rasters")) {
  const jobs = [];
  for (const [id, ind] of Object.entries(indicators)) for (const y of ind.years ?? [null]) jobs.push([id, y]);
  // Productivity first: it drives the time-lapse.
  jobs.sort((a, b) => (a[0] === "ppna" ? -1 : 0) - (b[0] === "ppna" ? -1 : 0));
  let i = 0;
  const worker = async () => {
    while (i < jobs.length) {
      const [id, y] = jobs[i++];
      const file = `${OUT}/rasters/${id}/${y ?? "static"}.webp`;
      if (existsSync(file)) continue;
      const ind = manifest.indicators[id];
      const img = imageAt(id, y);
      const vis =
        ind.kind === "continuous"
          ? img.visualize({ min: ind.min, max: ind.max, palette: ["000000", "ffffff"] })
          : ind.kind === "binary"
            ? img.visualize({ min: 0, max: 1, palette: ["000000", "ffffff"] })
            : img.visualize({ min: 0, max: 5, palette: ["000000", "ffffff"] });
      const buf = await retry(`raster ${id} ${y}`, async () => {
        const url = await thumb(vis, {
          region: RECT,
          dimensions: `${WIDTH}x${HEIGHT}`,
          crs: "EPSG:3857",
          format: "png",
        });
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`);
        return Buffer.from(await r.arrayBuffer());
      });
      mkdirSync(`${OUT}/rasters/${id}`, { recursive: true });
      const lossless = ind.kind !== "continuous";
      await sharp(buf)
        .webp(lossless ? { lossless: true } : { quality: 85, alphaQuality: 100 })
        .toFile(file);
      log("raster", id, y ?? "static", (buf.length / 1024).toFixed(0) + "KB png");
    }
  };
  await Promise.all([worker(), worker(), worker()]);
}

// Zone geometries for the predefined divisions (lon/lat, simplified).
const fixName = (s) =>
  s
    .replace("BARIIO", "BARRIO")
    .replace("CANEL�N", "CANELÓN")
    .replace("GO�I", "GOÑI")
    .replace("ORDO�EZ", "ORDÓÑEZ")
    .replace("ESPA�A", "ESPAÑA")
    .replace("CA�ITAS", "CAÑITAS")
    .replace("TACUAREMB�", "TACUAREMBÓ")
    .replace("BATOV�", "BATOVÍ")
    .replace("L�PEZ", "LÓPEZ")
    .replace("CARAGUAT�", "CARAGUATÁ")
    .replace("MART�NEZ", "MARTÍNEZ")
    .replace("RINC�N", "RINCÓN")
    .replace("CA�ADA", "CAÑADA");
const quantize = (geom) => {
  const q = (c) => (typeof c[0] === "number" ? [round(c[0], 5), round(c[1], 5)] : c.map(q));
  if (geom.type === "GeometryCollection") {
    const polys = geom.geometries
      .filter((g) => g.type === "Polygon" || g.type === "MultiPolygon")
      .flatMap((g) => (g.type === "Polygon" ? [g.coordinates] : g.coordinates));
    return { type: "MultiPolygon", coordinates: q(polys) };
  }
  return { type: geom.type, coordinates: q(geom.coordinates) };
};
const divisions = {
  seccionales: { fc: () => ee.FeatureCollection(P + "Seccionales_Policiales"), id: "CODIGOSECC", maxError: 60 },
  "cuencas-1": {
    fc: () => ee.FeatureCollection(P + "cuencas/Cuencas_G1"),
    id: "codcuenca",
    name: "nombrec1",
    maxError: 250,
  },
  "cuencas-2": {
    fc: () => ee.FeatureCollection(P + "cuencas/Cuencas_G2"),
    id: "codcuenca",
    name: "nombrec2",
    maxError: 150,
  },
  "cuencas-3": {
    fc: () => ee.FeatureCollection(P + "cuencas/Cuencas_G3"),
    id: "codcuenca",
    name: "nombrec3",
    maxError: 100,
  },
  "cuencas-4": {
    fc: () => ee.FeatureCollection(P + "cuencas/Cuencas_G4"),
    id: "codcuenca",
    name: "nombrec4",
    maxError: 80,
  },
  "cuencas-5": { fc: () => ee.FeatureCollection(P + "cuencas/Cuencas_G5"), id: "codcuenca", maxError: 60 },
};
if (phases.includes("zones")) {
  for (const [div, d] of Object.entries(divisions)) {
    const file = `${OUT}/zones/${div}.json`;
    if (existsSync(file)) continue;
    const fc = d.fc().map((f) => f.simplify(d.maxError).set("areaKm2", f.geometry().area(100).divide(1e6)));
    const size = await ev(fc.size());
    const features = [];
    for (let offset = 0; offset < size; offset += 400) {
      const page = await retry(`zones ${div} ${offset}`, () => ev(ee.FeatureCollection(fc.toList(400, offset))));
      features.push(...page.features);
    }
    const out = features.map((f) => {
      const p = f.properties;
      const base = { id: String(p[d.id]), areaKm2: round(p.areaKm2, 1) };
      const props =
        div === "seccionales"
          ? { ...base, dept: p.DEPARTAMEN, section: p.SECCION, name: fixName(p.NOMBRE_1 || p.NOMBRE || "") }
          : { ...base, name: d.name ? (p[d.name] ?? "") : "" };
      return { type: "Feature", id: Number(p[d.id]), properties: props, geometry: quantize(f.geometry) };
    });
    writeJson(file, { type: "FeatureCollection", features: out });
    log("zones", div, out.length, (JSON.stringify(out).length / 1024).toFixed(0) + "KB");
  }
}

// Per-zone yearly means for every time-series indicator, plus the static ones.
if (phases.includes("stats")) {
  for (const [div, d] of Object.entries(divisions)) {
    const zones = ee.FeatureCollection(d.fc()).select([d.id]);
    for (const [id, ind] of Object.entries(indicators)) {
      const file = `${OUT}/stats/${div}/${id}.json`;
      if (existsSync(file)) continue;
      let image,
        reducer = ee.Reducer.mean(),
        scale = ind.scale ?? 500;
      if (ind.years) {
        image = ee.Image.cat(
          ind.years.map((y) => {
            const img = ind.annual(y);
            return (
              ind.kind === "binary" ? img.unmask(0).updateMask(mb.select("classification_" + y).gt(0)) : img
            ).rename("y" + y);
          }),
        );
      } else if (id === "compn") {
        image = cpur.updateMask(cpur.gt(0)).rename("v");
        reducer = ee.Reducer.frequencyHistogram();
        scale = 250;
      } else {
        // Static indicators, the windowed diversity (entropy in bits) included: the same raster the map shows.
        image = ind.image.rename("v");
        reducer = ee.Reducer.mean().combine(ee.Reducer.percentile([25, 75]), null, true);
      }
      const res = await retry(
        `stats ${div} ${id}`,
        () => ev(image.reduceRegions({ collection: zones, reducer, scale, tileScale: 4 })),
        3,
      );
      // Single-band reductions name their outputs after the reducer (mean, p25, p75, histogram).
      const values = {};
      for (const f of res.features) {
        const p = f.properties;
        const zid = String(p[d.id]);
        if (ind.years) values[zid] = ind.years.map((y) => round(p["y" + y], 4));
        else if (id === "compn") values[zid] = p.histogram ?? null;
        else values[zid] = { mean: round(p.mean, 4), p25: round(p.p25, 4), p75: round(p.p75, 4) };
      }
      writeJson(file, { years: ind.years ?? null, values });
      log("stats", div, id, Object.keys(values).length);
    }
  }
}

// Seasonal (16-day) series per zone for productivity, radiation and evapotranspiration.
if (phases.includes("seasonal")) {
  const sources = {
    ppna: { image: ppna, bands: ppnaBands, step: 100 },
    apar: { image: apar, bands: aparBands, step: 100 },
    et: { image: et, bands: etBands, step: 160 },
  };
  for (const [div, d] of Object.entries(divisions)) {
    const zones = ee.FeatureCollection(d.fc()).select([d.id]);
    for (const [id, s] of Object.entries(sources)) {
      const file = `${RAW}/seasonal-${div}-${id}.json`;
      if (existsSync(file)) continue;
      const values = {};
      for (let from = 0; from < s.bands.length; from += s.step) {
        const chunk = s.bands.slice(from, from + s.step);
        const res = await retry(
          `seasonal ${div} ${id} ${from}`,
          () =>
            ev(
              s.image
                .select(chunk)
                .reduceRegions({ collection: zones, reducer: ee.Reducer.mean(), scale: 1000, tileScale: 4 }),
            ),
          3,
        );
        for (const f of res.features) {
          const zid = String(f.properties[d.id]);
          (values[zid] ??= []).push(...chunk.map((b) => round(f.properties[b], 2)));
        }
        log("seasonal", div, id, from + chunk.length, "/", s.bands.length);
      }
      writeJson(file, { bands: s.bands, values });
    }
  }
  // Split into one small file per zone for the zone page.
  manifest.seasonal = { ppna: ppnaBands, apar: aparBands, et: etBands };
  saveManifest();
  for (const div of Object.keys(divisions)) {
    const per = {};
    for (const id of Object.keys(sources)) {
      const file = `${RAW}/seasonal-${div}-${id}.json`;
      if (!existsSync(file)) continue;
      for (const [zid, v] of Object.entries(readJson(file).values)) (per[zid] ??= {})[id] = v;
    }
    for (const [zid, v] of Object.entries(per)) writeJson(`${OUT}/series/${div}/${zid}.json`, v);
    log("series files", div, Object.keys(per).length);
  }
}

// Rural parcels, one file per department (loaded by the map only when zoomed in).
if (phases.includes("padrones")) {
  const pad = ee.FeatureCollection(P + "padrones/padrones_ajustado");
  const depts = await ev(pad.aggregate_array("NOMDEPTO").distinct());
  const index = {};
  for (const dept of depts) {
    const slug = dept
      .toLowerCase()
      .normalize("NFD")
      .replace(/[^a-z]+/g, "-")
      .replace(/^-|-$/g, "");
    const file = `${OUT}/padrones/${slug}.json`;
    const fc = pad.filter(ee.Filter.eq("NOMDEPTO", dept)).map((f) => f.simplify(12));
    const size = await ev(fc.size());
    index[slug] = { name: dept, count: size };
    if (existsSync(file)) continue;
    const features = [];
    for (let offset = 0; offset < size; offset += 1500) {
      const page = await retry(`padrones ${dept} ${offset}`, () =>
        ev(ee.FeatureCollection(fc.toList(1500, offset)).select(["PADRON", "area_ha"])),
      );
      for (const f of page.features) {
        features.push({
          type: "Feature",
          id: features.length,
          properties: { padron: f.properties.PADRON, areaHa: round(f.properties.area_ha, 1) },
          geometry: quantize(f.geometry),
        });
      }
      log("padrones", dept, features.length, "/", size);
    }
    writeJson(file, { type: "FeatureCollection", features });
  }
  manifest.padrones = index;
  saveManifest();
}
log("done", phases.join(" "));
