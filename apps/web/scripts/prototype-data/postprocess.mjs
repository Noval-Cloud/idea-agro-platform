// Local post-processing of the extracted explorer data (no Earth Engine calls).
// Usage: node postprocess.mjs <web repo> [rasters] [zones] [padrones] [thumbs]
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
const [WEB, ...steps] = process.argv.slice(2);
const require = createRequire(WEB + "/package.json");
const sharp = require("sharp");
const OUT = WEB + "/public/explorer";
const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const writeJson = (p, o) => {
  mkdirSync(p.slice(0, p.lastIndexOf("/")), { recursive: true });
  writeFileSync(p, JSON.stringify(o));
};
const manifest = readJson(`${OUT}/manifest.json`);
const LITE_WIDTH = 800;
const all = steps.length === 0;

// 1. Rasters: full (1600 px) and lite (800 px, for the time-lapse). Re-encoding is idempotent via a marker.
if (all || steps.includes("rasters")) {
  for (const id of readdirSync(`${OUT}/rasters`)) {
    const kind = manifest.indicators[id].kind;
    const dir = `${OUT}/rasters/${id}`;
    mkdirSync(`${dir}/lite`, { recursive: true });
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".webp"))) {
      const src = `${dir}/${file}`;
      const lite = `${dir}/lite/${file}`;
      if (existsSync(lite)) continue;
      const lossless = kind !== "continuous";
      const input = readFileSync(src);
      if (!lossless) {
        await sharp(input)
          .webp({ quality: 70, alphaQuality: 100, effort: 6 })
          .toFile(src + ".tmp");
        renameSync(src + ".tmp", src);
      }
      // Nearest-neighbour keeps categorical classes and the no-data mask exact.
      await sharp(input)
        .resize({ width: LITE_WIDTH, kernel: lossless ? "nearest" : "lanczos3" })
        .webp(lossless ? { lossless: true } : { quality: 60, alphaQuality: 100, effort: 6 })
        .toFile(lite);
    }
    console.log("rasters", id);
  }
  const meta = await sharp(`${OUT}/rasters/ppna/lite/2025.webp`).metadata();
  manifest.liteSize = [meta.width, meta.height];
}

// 2. Zones: tighter coordinates and a search index (with department extents from the districts).
const fold = (s) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
const slug = (s) => fold(s).replace(/ /g, "-");
const departmentNames = {
  ARTIGAS: "Artigas",
  CANELONES: "Canelones",
  "CERRO LARGO": "Cerro Largo",
  COLONIA: "Colonia",
  DURAZNO: "Durazno",
  FLORES: "Flores",
  FLORIDA: "Florida",
  LAVALLEJA: "Lavalleja",
  MALDONADO: "Maldonado",
  MONTEVIDEO: "Montevideo",
  PAYSANDU: "Paysandú",
  "RIO NEGRO": "Río Negro",
  RIVERA: "Rivera",
  ROCHA: "Rocha",
  SALTO: "Salto",
  "SAN JOSE": "San José",
  SORIANO: "Soriano",
  TACUAREMBO: "Tacuarembó",
  TACUEREMBO: "Tacuarembó",
  "TREINTA Y TRES": "Treinta y Tres",
};
const deptName = (s) => departmentNames[s.trim().toUpperCase()] ?? s;
const small = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "a", "al", "en"]);
const titleCase = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w, i) => (i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
const rings = (g) => (g.type === "Polygon" ? g.coordinates : g.coordinates.flat());
const bbox = (g) => {
  let b = [Infinity, Infinity, -Infinity, -Infinity];
  for (const r of rings(g))
    for (const [x, y] of r) b = [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  return b.map((v) => +v.toFixed(4));
};
const union = (boxes) => [
  Math.min(...boxes.map((b) => b[0])),
  Math.min(...boxes.map((b) => b[1])),
  Math.max(...boxes.map((b) => b[2])),
  Math.max(...boxes.map((b) => b[3])),
];
const q = (c, d) => (typeof c[0] === "number" ? [+c[0].toFixed(d), +c[1].toFixed(d)] : c.map((x) => q(x, d)));
// Drop consecutive duplicates created by rounding; keep rings closed and with at least 4 points.
const clean = (g) => {
  const ring = (r) => {
    const out = r.filter((p, i) => i === 0 || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]);
    return out.length >= 4 ? out : null;
  };
  const poly = (p) => {
    const rs = p.map(ring);
    return rs[0] ? rs.filter(Boolean) : null;
  };
  if (g.type === "Polygon") {
    const p = poly(g.coordinates);
    return p ? { type: "Polygon", coordinates: p } : null;
  }
  const ps = g.coordinates.map(poly).filter(Boolean);
  return ps.length ? { type: "MultiPolygon", coordinates: ps } : null;
};

if (all || steps.includes("zones")) {
  const search = [];
  const departments = {};
  for (const div of ["seccionales", "cuencas-1", "cuencas-2", "cuencas-3", "cuencas-4", "cuencas-5"]) {
    const file = `${OUT}/zones/${div}.json`;
    const fc = readJson(file);
    const grade = div.startsWith("cuencas") ? Number(div.slice(-1)) : null;
    const parents =
      grade === 5
        ? Object.fromEntries(
            readJson(`${OUT}/zones/cuencas-4.json`).features.map((f) => [f.properties.id, f.properties.name]),
          )
        : {};
    for (const f of fc.features) {
      f.geometry = clean({ type: f.geometry.type, coordinates: q(f.geometry.coordinates, 4) }) ?? f.geometry;
      const p = f.properties;
      const box = bbox(f.geometry);
      if (div === "seccionales") {
        p.dept = deptName(p.dept);
        p.name = titleCase(p.name || "");
        (departments[p.dept] ??= []).push(box);
        search.push({ d: div, id: p.id, label: `${p.dept}, ${p.section}`, detail: p.name, bbox: box });
      } else {
        // Grade 5 sub-basins have no name in the source: they borrow their grade 4 parent's.
        if (grade === 5 && !p.name) p.parent = parents[String(Math.floor(Number(p.id) / 10))] ?? "";
        // Some grades come in capitals; names read the same way across grades.
        if (p.name)
          p.name = p.name
            .split(" ")
            .map((w, i) =>
              w.length > 1 && w === w.toUpperCase() && /\p{L}/u.test(w)
                ? i > 0 && small.has(w.toLowerCase())
                  ? w.toLowerCase()
                  : titleCase(w)
                : w,
            )
            .join(" ");
        search.push({
          d: div,
          id: p.id,
          label: p.name || p.parent || p.id,
          detail: grade === 5 ? p.id : undefined,
          bbox: box,
        });
      }
    }
    writeJson(file, fc);
    console.log("zones", div, fc.features.length, (JSON.stringify(fc).length / 1024).toFixed(0) + "KB");
  }
  for (const [name, boxes] of Object.entries(departments))
    search.push({ d: "department", id: slug(name), label: name, bbox: union(boxes) });
  writeJson(`${OUT}/search.json`, search);
  console.log("search entries", search.length, (JSON.stringify(search).length / 1024).toFixed(0) + "KB");
}

// 3. Padrones: per-department extent and the list of parcel numbers, for search.
if (all || steps.includes("padrones")) {
  const index = {};
  for (const [s, meta] of Object.entries(manifest.padrones ?? {})) {
    const fc = readJson(`${OUT}/padrones/${s}.json`);
    // A few source parcels simplify to points or lines: keep polygons only.
    const before = fc.features.length;
    fc.features = fc.features.filter(
      (f) => (f.geometry.type === "Polygon" || f.geometry.type === "MultiPolygon") && (f.geometry = clean(f.geometry)),
    );
    if (fc.features.length !== before) {
      writeJson(`${OUT}/padrones/${s}.json`, fc);
      console.log("padrones dropped", s, before - fc.features.length);
    }
    index[s] = fc.features.map((f) => f.properties.padron).sort((a, b) => a - b);
    manifest.padrones[s] = {
      name: deptName(meta.name),
      count: fc.features.length,
      bbox: union(fc.features.map((f) => bbox(f.geometry))),
    };
  }
  writeJson(`${OUT}/padrones/index.json`, index);
  console.log("padrones index", Object.keys(index).length);
}

// 4. Thumbnails for the layer picker: each indicator's latest map, colored per theme.
if (all || steps.includes("thumbs")) {
  const theme = readJson(`${WEB}/src/design/generated/map-theme.json`);
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
  mkdirSync(`${OUT}/thumbs`, { recursive: true });
  for (const [id, ind] of Object.entries(manifest.indicators)) {
    const year = ind.years ? ind.years[ind.years.length - 1] : "static";
    const { data, info } = await sharp(`${OUT}/rasters/${id}/lite/${year}.webp`)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    for (const t of ["light", "dark"]) {
      const lut = theme[t].luts[families[id]].map(hex);
      const land = hex(theme[t].chrome.land);
      const neutral = hex(theme[t].chrome["line-strong"]);
      const out = Buffer.alloc(info.width * info.height * 4);
      for (let i = 0; i < info.width * info.height; i++) {
        const g = data[i * 4],
          a = data[i * 4 + 3];
        let rgb = land;
        if (a >= 128) {
          if (ind.kind === "continuous") rgb = lut[Math.round((g / 255) * (lut.length - 1))];
          else if (ind.kind === "binary") rgb = g >= 128 ? lut[Math.round(0.72 * (lut.length - 1))] : neutral;
          else
            rgb =
              Math.round(g / 51) > 0 ? lut[Math.round((0.35 + Math.round(g / 51) * 0.12) * (lut.length - 1))] : land;
        }
        out.set([...rgb, 255], i * 4);
      }
      await sharp(out, { raw: { width: info.width, height: info.height, channels: 4 } })
        .resize({ width: 160, height: 120, fit: "cover", position: "centre" })
        .webp({ quality: 80 })
        .toFile(`${OUT}/thumbs/${id}-${t}.webp`);
    }
  }
  console.log("thumbs");
}
writeJson(`${OUT}/manifest.json`, manifest);
console.log("done");
