import type { ExpressionSpecification, LayerSpecification, Map as MapLibreMap, StyleSpecification } from "maplibre-gl";
import { mapMarks, mapTheme, type MapThemeName } from "./theme";

/*
 * A quiet basemap from OpenFreeMap's OpenStreetMap tiles, colored by the design tokens, under one of three bases.
 * Draw order: land and water, then the base's own tiles, the indicator raster, boundaries, roads, the regions
 * and finally the place names, so the data sits under the context that helps read it.
 */

const TILES = "https://tiles.openfreemap.org/planet";
const GLYPHS = "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf";
const FONT = ["Noto Sans Regular"];

/** What lies under the data: the quiet map, the land from above, or the streets and rivers. */
export type Base = "map" | "satellite" | "streets";
export const bases: Base[] = ["map", "satellite", "streets"];

/** IDE Uruguay's tiles: the national orthophoto (32 cm) and its base map of streets, rivers and relief. */
export const baseTiles: Record<Exclude<Base, "map">, string> = {
  satellite:
    "https://mapas.ide.uy/geoserver-raster/gwc/service/wmts/rest/ortofotos:ortofoto_nacional/raster/EPSG:3857/EPSG:3857:{z}/{y}/{x}?format=image/jpeg",
  streets:
    "https://mapas.ide.uy/geoserver-vectorial/gwc/service/wmts/rest/capa_base_ideuy_ideuy/raster/EPSG:3857/EPSG:3857:{z}/{y}/{x}?format=image/png",
};
const BASE = "base";

/**
 * The quiet map's lines and names that IDE's street map already draws: hidden while it shows, so none is doubled,
 * and back over an indicator, which covers the street map's own.
 */
const drawnByStreets = ["waterway", "roads", "boundary-departments", "place-country", "place-town", "place-city"];
const hidden = (base: Base, overData: boolean) => (base === "streets" && !overData ? drawnByStreets : []);

const basePaint = (base: Base, theme: MapThemeName) => ({
  "raster-brightness-max": base === "streets" && theme === "dark" ? mapMarks["streets-brightness-dark"] : 1,
});

const baseSource = (base: Exclude<Base, "map">) => ({
  type: "raster" as const,
  tiles: [baseTiles[base]],
  tileSize: 256,
  maxzoom: 19,
  attribution: '<a href="https://www.gub.uy/infraestructura-datos-espaciales">IDE Uruguay</a>',
});

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

export function basemapStyle(theme: MapThemeName, base: Base = "map"): StyleSpecification {
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
    ...(base === "map" ? [] : [{ id: BASE, type: "raster", source: BASE, paint: basePaint(base, theme) } as const]),
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
  for (const layer of layers)
    if (hidden(base, false).includes(layer.id)) layer.layout = { ...layer.layout, visibility: "none" };
  return {
    version: 8,
    glyphs: GLYPHS,
    sources: { omt: { type: "vector", url: TILES }, ...(base !== "map" && { [BASE]: baseSource(base) }) },
    layers,
  };
}

/** Swaps the base in place, under `below` (the lowest of the explorer's own layers), keeping everything else. */
export function applyBase(map: MapLibreMap, base: Base, theme: MapThemeName, below: string) {
  if (map.getLayer(BASE)) map.removeLayer(BASE);
  if (map.getSource(BASE)) map.removeSource(BASE);
  if (base === "map") return;
  map.addSource(BASE, baseSource(base));
  map.addLayer({ id: BASE, type: "raster", source: BASE, paint: basePaint(base, theme) }, below);
}

/** Shows the quiet map's lines and names, or hides those the base draws; `overData`: an indicator covers the base. */
export function showBasemapLayers(map: MapLibreMap, base: Base, overData: boolean) {
  const off = hidden(base, overData);
  for (const layer of drawnByStreets)
    if (map.getLayer(layer)) map.setLayoutProperty(layer, "visibility", off.includes(layer) ? "none" : "visible");
}

/** Recolors the basemap in place (keeps the explorer's own sources and layers). */
export function applyBasemapTheme(map: MapLibreMap, theme: MapThemeName, base: Base) {
  const all = { ...paints(theme), [BASE]: basePaint(base, theme) };
  for (const [layer, paint] of Object.entries(all)) {
    if (!map.getLayer(layer)) continue;
    for (const [property, value] of Object.entries(paint))
      map.setPaintProperty(layer, property as never, value as never);
  }
}
