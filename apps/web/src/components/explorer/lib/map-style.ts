import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { mapMarks, mapTheme, type MapThemeName } from "./theme";

/*
 * A quiet basemap from OpenFreeMap's OpenStreetMap tiles, colored by the design tokens.
 * Draw order: land and water, then the indicator raster, then boundaries, roads, the regions
 * and finally the place names, so the data sits under the context that helps read it.
 */

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FONT = ["Noto Sans Regular"];

/** Layer ids the explorer inserts its own layers before. */
export const beforeIndicator = "boundary-departments";
export const beforeZones = "place-town";

type Paint = Record<string, unknown>;

function paints(theme: MapThemeName): Record<string, Paint> {
  const c = mapTheme[theme].chrome;
  return {
    background: { "background-color": c.land },
    water: { "fill-color": c.water },
    waterway: { "line-color": c.water },
    "boundary-departments": { "line-color": c["boundary-minor"] },
    "boundary-countries": { "line-color": c.boundary },
    roads: { "line-color": c.road },
    "place-country": { "text-color": c.label, "text-halo-color": c["label-halo"] },
    "place-town": { "text-color": c.label, "text-halo-color": c["label-halo"] },
    "place-city": { "text-color": c.label, "text-halo-color": c["label-halo"] },
  };
}

export function basemapStyle(theme: MapThemeName): StyleSpecification {
  const p = paints(theme);
  const halo = { "text-halo-width": mapMarks["label-halo-width"] };
  const label = (size: number) => ({
    "text-field": ["get", "name"] as ExpressionSpecification,
    "text-font": FONT,
    "text-size": size,
    "text-max-width": 8,
  });
  const layers: LayerSpecification[] = [
    { id: "background", type: "background", paint: p.background },
    { id: "water", type: "fill", source: "omt", "source-layer": "water", paint: p.water },
    {
      id: "waterway",
      type: "line",
      source: "omt",
      "source-layer": "waterway",
      minzoom: 7,
      filter: ["in", ["get", "class"], ["literal", ["river", "canal"]]],
      paint: { ...p.waterway, "line-width": ["interpolate", ["linear"], ["zoom"], 7, 0.4, 12, 1.4] },
    },
    {
      id: "boundary-departments",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      minzoom: 5,
      filter: ["all", ["==", ["get", "admin_level"], 4], ["==", ["get", "maritime"], 0]],
      paint: { ...p["boundary-departments"], "line-width": mapMarks["boundary-width"], "line-dasharray": [2, 2] },
    },
    {
      id: "boundary-countries",
      type: "line",
      source: "omt",
      "source-layer": "boundary",
      filter: ["all", ["==", ["get", "admin_level"], 2], ["==", ["get", "maritime"], 0]],
      paint: { ...p["boundary-countries"], "line-width": mapMarks["boundary-width"] },
    },
    {
      id: "roads",
      type: "line",
      source: "omt",
      "source-layer": "transportation",
      minzoom: 7,
      filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary"]]],
      paint: { ...p.roads, "line-width": mapMarks["road-width"] },
    },
    {
      id: "place-country",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      maxzoom: 8,
      filter: ["==", ["get", "class"], "country"],
      layout: label(mapMarks["label-size-major"]),
      paint: { ...p["place-country"], ...halo },
    },
    {
      id: "place-town",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 8,
      filter: ["in", ["get", "class"], ["literal", ["town", "village"]]],
      layout: label(mapMarks["label-size"]),
      paint: { ...p["place-town"], ...halo },
    },
    {
      id: "place-city",
      type: "symbol",
      source: "omt",
      "source-layer": "place",
      minzoom: 5,
      filter: ["==", ["get", "class"], "city"],
      layout: label(mapMarks["label-size-major"]),
      paint: { ...p["place-city"], ...halo },
    },
  ];
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: "vector", url: TILES } },
    layers,
  };
}

/** Recolors the basemap in place (keeps the explorer's own sources and layers). */
export function applyBasemapTheme(map: MapLibreMap, theme: MapThemeName) {
  for (const [layer, paint] of Object.entries(paints(theme))) {
    if (!map.getLayer(layer)) continue;
    for (const [property, value] of Object.entries(paint))
      map.setPaintProperty(layer, property as never, value as never);
  }
}
