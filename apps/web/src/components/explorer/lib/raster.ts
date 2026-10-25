import type { DataFamily } from "@/design/tokens";
import type { IndicatorManifest, ZoneGeometry } from "./data";
import { ringsOf } from "./geo";
import { mapTheme, type MapThemeName } from "./theme";

/*
 * Indicator rasters arrive as grayscale images: the gray level is the value scaled between the
 * indicator's fixed minimum and maximum (the same for every year), and transparency is "no data".
 * The browser paints them with the theme's ramp, so one file serves both themes and the legend,
 * the hover readout and the colors always agree.
 */

export type GrayRaster = { width: number; height: number; data: Uint8ClampedArray };

const hexToRgb = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** 256 RGB entries interpolated from the family's lookup table. */
function expandLut(family: DataFamily, theme: MapThemeName): Uint8ClampedArray {
  const stops = mapTheme[theme].luts[family].map(hexToRgb);
  const out = new Uint8ClampedArray(256 * 3);
  for (let g = 0; g < 256; g++) {
    const position = (g / 255) * (stops.length - 1);
    const i = Math.min(Math.floor(position), stops.length - 2);
    const f = position - i;
    for (let c = 0; c < 3; c++) out[g * 3 + c] = stops[i][c] + (stops[i + 1][c] - stops[i][c]) * f;
  }
  return out;
}

const lutCache = new Map<string, Uint8ClampedArray>();
export function rampColors(family: DataFamily, theme: MapThemeName) {
  const key = `${family}-${theme}`;
  let lut = lutCache.get(key);
  if (!lut) lutCache.set(key, (lut = expandLut(family, theme)));
  return lut;
}

/** Where on the ramp a categorical "this class" mark sits: strong but not the darkest step. */
const HIGHLIGHT = 0.72;

/** RGBA for each gray level of a raster of this kind. */
function palette(
  kind: IndicatorManifest["kind"],
  family: DataFamily,
  theme: MapThemeName,
  highlight?: number,
): Uint8ClampedArray {
  const lut = rampColors(family, theme);
  const out = new Uint8ClampedArray(256 * 4);
  const strong = Math.round(HIGHLIGHT * 255) * 3;
  // "Other uses" and the communities not highlighted: the legend's neutral swatch.
  const neutral = hexToRgb(mapTheme[theme].chrome["ink-subtle"]);
  for (let g = 0; g < 256; g++) {
    let rgb: ArrayLike<number> = neutral;
    let alpha = 255;
    if (kind === "continuous") rgb = lut.subarray(g * 3, g * 3 + 3);
    else if (kind === "binary") rgb = g >= 128 ? lut.subarray(strong, strong + 3) : neutral;
    else {
      // Categorical: classes are stored as class × 51; only the highlighted one wears the family color.
      const cls = Math.round(g / 51);
      if (cls === 0) alpha = 0;
      else if (cls === highlight) rgb = lut.subarray(strong, strong + 3);
    }
    out.set([rgb[0], rgb[1], rgb[2], alpha], g * 4);
  }
  return out;
}

export async function decodeGray(url: string, signal?: AbortSignal): Promise<GrayRaster> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("2d context unavailable");
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  return { width: canvas.width, height: canvas.height, data };
}

/** Paints a gray raster and returns an object URL of the colored PNG (the caller revokes it). */
export async function paint(
  raster: GrayRaster,
  kind: IndicatorManifest["kind"],
  family: DataFamily,
  theme: MapThemeName,
  highlight?: number,
): Promise<string> {
  const colors = palette(kind, family, theme, highlight);
  const out = new ImageData(raster.width, raster.height);
  const src = raster.data;
  const dst = out.data;
  for (let i = 0; i < src.length; i += 4) {
    if (src[i + 3] < 128) continue;
    const p = src[i] * 4;
    dst[i] = colors[p];
    dst[i + 1] = colors[p + 1];
    dst[i + 2] = colors[p + 2];
    dst[i + 3] = colors[p + 3];
  }
  const canvas = new OffscreenCanvas(raster.width, raster.height);
  canvas.getContext("2d")?.putImageData(out, 0, 0);
  return URL.createObjectURL(await canvas.convertToBlob({ type: "image/png" }));
}

const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

/** The gray level under a longitude/latitude, or null outside the raster or where there is no data. */
export function sampleGray(
  raster: GrayRaster,
  bounds: [number, number, number, number],
  lng: number,
  lat: number,
): number | null {
  const [west, south, east, north] = bounds;
  const x = Math.floor(((lng - west) / (east - west)) * raster.width);
  const y = Math.floor(((mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))) * raster.height);
  if (x < 0 || y < 0 || x >= raster.width || y >= raster.height) return null;
  const i = (y * raster.width + x) * 4;
  return raster.data[i + 3] < 128 ? null : raster.data[i];
}

/** Visits every valid pixel whose center falls inside the polygon (even-odd rule across all rings). */
function eachPixelIn(
  raster: GrayRaster,
  bounds: [number, number, number, number],
  rings: [number, number][][],
  visit: (gray: number) => void,
) {
  const [west, south, east, north] = bounds;
  const toPixel = ([lng, lat]: [number, number]): [number, number] => [
    ((lng - west) / (east - west)) * raster.width,
    ((mercatorY(north) - mercatorY(lat)) / (mercatorY(north) - mercatorY(south))) * raster.height,
  ];
  const pixelRings = rings.map((ring) => ring.map(toPixel));
  const xs = pixelRings.flat().map((p) => p[0]);
  const ys = pixelRings.flat().map((p) => p[1]);
  const [x0, x1] = [Math.max(0, Math.floor(Math.min(...xs))), Math.min(raster.width - 1, Math.ceil(Math.max(...xs)))];
  const [y0, y1] = [Math.max(0, Math.floor(Math.min(...ys))), Math.min(raster.height - 1, Math.ceil(Math.max(...ys)))];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [px, py] = [x + 0.5, y + 0.5];
      let inside = false;
      for (const ring of pixelRings) {
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
          const [xi, yi] = ring[i];
          const [xj, yj] = ring[j];
          if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
        }
      }
      if (!inside) continue;
      const i = (y * raster.width + x) * 4;
      if (raster.data[i + 3] >= 128) visit(raster.data[i]);
    }
  }
}

/** Mean value of the raster in a zone without precomputed stats: inside its polygon, or at its point's pixel. */
export function zonalMean(
  raster: GrayRaster,
  bounds: [number, number, number, number],
  geometry: ZoneGeometry,
  scale: (gray: number) => number,
): number | null {
  if (geometry.type === "Point") {
    const gray = sampleGray(raster, bounds, ...geometry.coordinates);
    return gray === null ? null : scale(gray);
  }
  let sum = 0;
  let count = 0;
  eachPixelIn(raster, bounds, ringsOf(geometry), (gray) => {
    sum += scale(gray);
    count++;
  });
  return count ? sum / count : null;
}

/** How many pixels of each gray level fall in a zone (classes of a categorical raster); a point has one. */
export function zonalCounts(
  raster: GrayRaster,
  bounds: [number, number, number, number],
  geometry: ZoneGeometry,
): Map<number, number> {
  const counts = new Map<number, number>();
  if (geometry.type === "Point") {
    const gray = sampleGray(raster, bounds, ...geometry.coordinates);
    if (gray !== null) counts.set(gray, 1);
    return counts;
  }
  eachPixelIn(raster, bounds, ringsOf(geometry), (gray) => counts.set(gray, (counts.get(gray) ?? 0) + 1));
  return counts;
}
