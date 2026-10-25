import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { GeoJSONSource, ImageSource, Map as MapLibreMap, MapMouseEvent, Popup } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Bounds, ZoneGeometry } from "./lib/data";
import {
  applyBase,
  applyBasemapTheme,
  basemapStyle,
  beforeIndicator,
  beforeZones,
  showBasemapLayers,
  type Base,
} from "./lib/map-style";
import { mapMarks, mapTheme, type MapThemeName } from "./lib/theme";
import { pinImage } from "./lib/pin";
import type { Frame } from "./lib/frames";

export type RegionFeature = {
  type: "Feature";
  /** `own`: a zone the reader uploaded or drew, drawn apart from the predefined divisions. */
  properties: { key: string; own?: boolean };
  geometry: ZoneGeometry;
};

export type MapPointer = { key: string | null; x: number; y: number; lng: number; lat: number };

interface Props {
  bounds: Bounds;
  theme: MapThemeName;
  base: Base;
  frame: Frame | null;
  /** Indicator opacity, 0–1 (the token's raster opacity at most). */
  opacity: number;
  regions: RegionFeature[];
  regionsMinZoom: number;
  /** Whether an indicator or an IDE base is drawn under the regions, which then need light lines to stay visible. */
  overRaster: boolean;
  selectedKey: string | null;
  /** A fly-to request; the id changes for every request. */
  focus: { bbox: Bounds; id: number; maxZoom?: number } | null;
  /** `pin`: the card rides above a point's pin instead of on the point. */
  popup: { lng: number; lat: number; content: ReactNode; pin?: boolean } | null;
  label: string;
  /** MapLibre's own control labels, in the page's language. */
  attributionLabel: string;
  onReady: (map: MapLibreMap) => void;
  onPointer: (pointer: MapPointer | null) => void;
  onPick: (pointer: MapPointer | null) => void;
  onView: (view: { zoom: number; bounds: Bounds }) => void;
  onError: (reason: "webgl" | "load") => void;
}

/** Room for the map buttons and the time bar, so the whole country stays in view. */
const FIT_PADDING = {
  top: mapMarks["fit-top"],
  bottom: mapMarks["fit-bottom"],
  left: mapMarks["fit-side"],
  right: mapMarks["fit-controls"],
};
/** A value that grows with the zoom: light over the whole country, firm up close. */
const byZoom = (low: number, mid: number, high: number) =>
  ["interpolate", ["linear"], ["zoom"], 5, low, 9, mid, 13, high] as never;
const isOwn = ["boolean", ["get", "own"], false] as never;
const isPoint = ["==", ["geometry-type"], "Point"] as never;
const selectedPoint = (key: string) => ["all", isPoint, ["==", ["get", "key"], key]] as never;
const REGION_SOURCE = "regions";
const INDICATOR_SOURCE = "indicator";
const reducedMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const casingOpacity = (overRaster: boolean) =>
  overRaster
    ? byZoom(
        mapMarks["zone-casing-raster-opacity-low"],
        mapMarks["zone-casing-raster-opacity"],
        mapMarks["zone-casing-raster-opacity"],
      )
    : byZoom(mapMarks["zone-casing-opacity-low"], mapMarks["zone-casing-opacity"], mapMarks["zone-casing-opacity"]);

/** Line colors of the region layers for a theme, over the bare land or over an indicator. */
function regionPaint(theme: MapThemeName, overRaster: boolean) {
  const c = mapTheme[theme].chrome;
  return {
    "regions-casing": {
      "line-color": overRaster ? c["zone-casing-raster"] : c["zone-casing"],
      "line-opacity": casingOpacity(overRaster),
    },
    "regions-line": { "line-color": overRaster ? c["zone-line-raster"] : c["zone-line"] },
    "regions-hover-casing": { "line-color": c["zone-hover-casing"] },
    "regions-hover": { "line-color": c["zone-hover"] },
    "regions-own-line": { "line-color": c["zone-own"] },
    "regions-own-fill": { "fill-color": c["zone-own"] },
    "regions-selected-fill": { "fill-color": c["zone-selected"] },
    "regions-selected-casing": { "line-color": c["zone-casing"] },
    "regions-selected": { "line-color": c["zone-selected"] },
  } as const;
}

/** Where a card rides around a selected pin, by the side MapLibre puts it on: clear of the pin's head. */
const PIN_HEIGHT = mapMarks["pin-height"] * mapMarks["pin-selected-scale"];
const PIN_SIDE = (mapMarks["pin-width"] * mapMarks["pin-selected-scale"]) / 2 + mapMarks["popup-offset"];
const PIN_OFFSET = {
  center: [0, -PIN_HEIGHT / 2],
  top: [0, mapMarks["popup-offset"]],
  "top-left": [0, mapMarks["popup-offset"]],
  "top-right": [0, mapMarks["popup-offset"]],
  bottom: [0, -PIN_HEIGHT - mapMarks["popup-offset"]],
  "bottom-left": [0, -PIN_HEIGHT - mapMarks["popup-offset"]],
  "bottom-right": [0, -PIN_HEIGHT - mapMarks["popup-offset"]],
  left: [PIN_SIDE, -PIN_HEIGHT / 2],
  right: [-PIN_SIDE, -PIN_HEIGHT / 2],
} satisfies Record<string, [number, number]>;

/** The pins of the reader's points: their own color, and the selection's. */
const pins = (theme: MapThemeName) => {
  const c = mapTheme[theme].chrome;
  return {
    "pin-own": pinImage(c["zone-own"], c["zone-casing"]),
    "pin-selected": pinImage(c["zone-selected"], c["zone-casing"]),
  };
};

export default function MapView(props: Props) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const [ready, setReady] = useState(false);
  const [popupNode] = useState(() => (typeof document === "undefined" ? null : document.createElement("div")));
  const hovered = useRef<string | null>(null);
  // The base the map was built with, then the one last applied.
  const drawnBase = useRef<Base>("map");
  const callbacks = useRef(props);
  callbacks.current = props;

  // Create the map once; MapLibre is loaded only in the browser.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    // Resolved at runtime so the bundler leaves the unbundled module alone.
    const maplibreUrl = new URL(import.meta.env.MAPLIBRE_URL, window.location.href).href;
    void (import(/* @vite-ignore */ maplibreUrl) as Promise<typeof import("maplibre-gl")>)
      .then(({ Map, Popup: PopupClass, AttributionControl }) => {
        if (cancelled || !container.current) return;
        drawnBase.current = callbacks.current.base;
        try {
          map = new Map({
            container: container.current,
            style: basemapStyle(callbacks.current.theme, drawnBase.current),
            bounds: callbacks.current.bounds,
            fitBoundsOptions: { padding: FIT_PADDING },
            minZoom: 4.5,
            maxZoom: 15,
            maxBounds: [
              [callbacks.current.bounds[0] - 6, callbacks.current.bounds[1] - 5],
              [callbacks.current.bounds[2] + 6, callbacks.current.bounds[3] + 5],
            ],
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            hash: "map",
            attributionControl: false,
            locale: { "AttributionControl.ToggleAttribution": callbacks.current.attributionLabel },
          });
        } catch {
          callbacks.current.onError("webgl");
          return;
        }
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new AttributionControl({ compact: true }), "bottom-right");
        map.getCanvas().setAttribute("aria-label", callbacks.current.label);
        popupRef.current = new PopupClass({
          closeButton: false,
          closeOnClick: false,
          maxWidth: "none",
          offset: mapMarks["popup-offset"],
          className: "explorer-popup",
          focusAfterOpen: false,
        });
        if (popupNode) popupRef.current.setDOMContent(popupNode);
        mapRef.current = map;
        const emitView = () => {
          const m = mapRef.current;
          if (!m) return;
          const b = m.getBounds();
          callbacks.current.onView({
            zoom: m.getZoom(),
            bounds: [b.getWest(), b.getSouth(), b.getEast(), b.getNorth()],
          });
        };

        map.on("load", () => {
          const m = map as MapLibreMap;
          m.addSource(REGION_SOURCE, {
            type: "geojson",
            data: { type: "FeatureCollection", features: [] },
            promoteId: "key",
          });
          const paint = regionPaint(callbacks.current.theme, callbacks.current.overRaster);
          const before = beforeZones;
          m.addLayer({ id: "regions-fill", type: "fill", source: REGION_SOURCE, paint: { "fill-opacity": 0 } }, before);
          m.addLayer(
            {
              id: "regions-own-fill",
              type: "fill",
              source: REGION_SOURCE,
              filter: isOwn,
              paint: { ...paint["regions-own-fill"], "fill-opacity": mapMarks["zone-own-fill-opacity"] },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-selected-fill",
              type: "fill",
              source: REGION_SOURCE,
              filter: ["==", ["get", "key"], ""],
              paint: { ...paint["regions-selected-fill"], "fill-opacity": mapMarks["zone-selected-fill-opacity"] },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-casing",
              type: "line",
              source: REGION_SOURCE,
              paint: { ...paint["regions-casing"], "line-width": mapMarks["zone-casing-width"] },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-line",
              type: "line",
              source: REGION_SOURCE,
              filter: ["!", isOwn],
              paint: {
                ...paint["regions-line"],
                "line-width": byZoom(mapMarks["zone-width-low"], mapMarks["zone-width"], mapMarks["zone-width-high"]),
              },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-own-line",
              type: "line",
              source: REGION_SOURCE,
              filter: isOwn,
              paint: {
                ...paint["regions-own-line"],
                "line-width": mapMarks["zone-own-width"],
                "line-dasharray": [mapMarks["own-dash-on"], mapMarks["own-dash-off"]],
              },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-selected-casing",
              type: "line",
              source: REGION_SOURCE,
              filter: ["==", ["get", "key"], ""],
              paint: { ...paint["regions-selected-casing"], "line-width": mapMarks["zone-selected-casing-width"] },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-selected",
              type: "line",
              source: REGION_SOURCE,
              filter: ["==", ["get", "key"], ""],
              paint: { ...paint["regions-selected"], "line-width": mapMarks["zone-selected-width"] },
            },
            before,
          );
          // The region under the pointer, drawn last: a thick white line on a dark halo, over the selection too.
          const hover = (on: number) => ["case", ["boolean", ["feature-state", "hover"], false], on, 0] as never;
          m.addLayer(
            {
              id: "regions-hover-casing",
              type: "line",
              source: REGION_SOURCE,
              paint: {
                ...paint["regions-hover-casing"],
                "line-width": mapMarks["zone-hover-casing-width"],
                "line-opacity": hover(mapMarks["zone-hover-casing-opacity"]),
              },
            },
            before,
          );
          m.addLayer(
            {
              id: "regions-hover",
              type: "line",
              source: REGION_SOURCE,
              paint: {
                ...paint["regions-hover"],
                "line-width": mapMarks["zone-hover-width"],
                "line-opacity": hover(1),
              },
            },
            before,
          );
          // Sites, the reader's points: pins above the outlines, the selected one larger.
          for (const [name, image] of Object.entries(pins(callbacks.current.theme)))
            m.addImage(name, image, { pixelRatio: 2 });
          const pin = (image: string, size: number) => ({
            "icon-image": image,
            "icon-size": size,
            "icon-anchor": "bottom" as const,
            "icon-allow-overlap": true,
            "icon-ignore-placement": true,
          });
          m.addLayer(
            { id: "regions-points", type: "symbol", source: REGION_SOURCE, filter: isPoint, layout: pin("pin-own", 1) },
            before,
          );
          m.addLayer(
            {
              id: "regions-points-selected",
              type: "symbol",
              source: REGION_SOURCE,
              filter: selectedPoint(""),
              layout: pin("pin-selected", mapMarks["pin-selected-scale"]),
            },
            before,
          );
          setReady(true);
          callbacks.current.onReady(m);
          // The first view counts too: a link straight to a zoom level must load what it shows.
          emitView();
        });

        const pointerAt = (e: MapMouseEvent): MapPointer => {
          // A point lies above any area it falls in, so it is picked first.
          const feature = e.target.getLayer("regions-fill")
            ? e.target.queryRenderedFeatures(e.point, { layers: ["regions-points", "regions-fill"] })[0]
            : undefined;
          return {
            key: feature ? String(feature.id ?? feature.properties?.key) : null,
            x: e.point.x,
            y: e.point.y,
            lng: e.lngLat.lng,
            lat: e.lngLat.lat,
          };
        };
        const setHover = (key: string | null) => {
          const m = mapRef.current;
          if (!m || hovered.current === key) return;
          if (hovered.current) m.setFeatureState({ source: REGION_SOURCE, id: hovered.current }, { hover: false });
          hovered.current = key;
          if (key) m.setFeatureState({ source: REGION_SOURCE, id: key }, { hover: true });
          m.getCanvas().style.cursor = key ? "pointer" : "";
        };
        map.on("mousemove", (e) => {
          const pointer = pointerAt(e);
          setHover(pointer.key);
          callbacks.current.onPointer(pointer);
        });
        map.on("mouseout", () => {
          setHover(null);
          callbacks.current.onPointer(null);
        });
        map.on("click", (e) => callbacks.current.onPick(pointerAt(e)));
        map.on("moveend", emitView);
        map.on("error", (e) => {
          if (String(e.error?.message ?? "").includes("WebGL")) callbacks.current.onError("webgl");
        });
      })
      .catch(() => callbacks.current.onError("load"));
    return () => {
      cancelled = true;
      popupRef.current?.remove();
      map?.remove();
      mapRef.current = null;
    };
    // The map is created once; later prop changes are applied by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Theme and background: recolor the basemap and the region lines.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    applyBasemapTheme(map, props.theme, drawnBase.current);
    for (const [name, image] of Object.entries(pins(props.theme))) map.updateImage(name, image);
    for (const [layer, paint] of Object.entries(regionPaint(props.theme, props.overRaster)))
      for (const [property, value] of Object.entries(paint))
        map.setPaintProperty(layer, property as never, value as never);
  }, [ready, props.theme, props.overRaster]);

  // Base: swapped under the indicator, so the data, the regions and the camera stay as they are.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || drawnBase.current === props.base) return;
    applyBase(map, props.base, props.theme, map.getLayer(INDICATOR_SOURCE) ? INDICATOR_SOURCE : beforeIndicator);
    drawnBase.current = props.base;
  }, [ready, props.base]);

  const overData = Boolean(props.frame);
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    showBasemapLayers(map, props.base, overData);
  }, [ready, props.base, overData]);

  // Indicator raster: one image source over the country, swapped frame by frame.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const [west, south, east, north] = props.bounds;
    const coordinates: [[number, number], [number, number], [number, number], [number, number]] = [
      [west, north],
      [east, north],
      [east, south],
      [west, south],
    ];
    const source = map.getSource(INDICATOR_SOURCE) as ImageSource | undefined;
    if (!props.frame) {
      if (map.getLayer(INDICATOR_SOURCE)) map.setLayoutProperty(INDICATOR_SOURCE, "visibility", "none");
      return;
    }
    if (source) source.updateImage({ url: props.frame.url, coordinates });
    else {
      map.addSource(INDICATOR_SOURCE, { type: "image", url: props.frame.url, coordinates });
      map.addLayer(
        {
          id: INDICATOR_SOURCE,
          type: "raster",
          source: INDICATOR_SOURCE,
          paint: { "raster-fade-duration": 0, "raster-resampling": "nearest" },
        },
        beforeIndicator,
      );
    }
    map.setLayoutProperty(INDICATOR_SOURCE, "visibility", "visible");
  }, [ready, props.frame, props.bounds]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer(INDICATOR_SOURCE)) return;
    map.setPaintProperty(INDICATOR_SOURCE, "raster-opacity", props.opacity);
  }, [ready, props.opacity, props.frame]);

  // Regions: outlines only, so the indicator underneath stays readable.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    // New data drops the hovered region; its highlight must not stay behind.
    map.removeFeatureState({ source: REGION_SOURCE });
    hovered.current = null;
    void (map.getSource(REGION_SOURCE) as GeoJSONSource).setData({
      type: "FeatureCollection",
      features: props.regions,
    });
    for (const layer of [
      "regions-fill",
      "regions-own-fill",
      "regions-casing",
      "regions-line",
      "regions-own-line",
      "regions-hover-casing",
      "regions-hover",
      "regions-points",
    ])
      map.setLayerZoomRange(layer, props.regionsMinZoom, 24);
  }, [ready, props.regions, props.regionsMinZoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const filter = ["==", ["get", "key"], props.selectedKey ?? ""] as never;
    map.setFilter("regions-selected", filter);
    map.setFilter("regions-selected-casing", filter);
    map.setFilter("regions-selected-fill", filter);
    map.setFilter("regions-points-selected", selectedPoint(props.selectedKey ?? ""));
  }, [ready, props.selectedKey]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !props.focus) return;
    const [west, south, east, north] = props.focus.bbox;
    map.fitBounds(
      [
        [west, south],
        [east, north],
      ],
      {
        padding: FIT_PADDING,
        maxZoom: props.focus.maxZoom ?? 12,
        duration: reducedMotion() ? 0 : mapMarks["fly-duration"],
      },
    );
  }, [ready, props.focus]);

  // The zone card rides a MapLibre popup on wide screens.
  useEffect(() => {
    const map = mapRef.current;
    const popup = popupRef.current;
    if (!map || !popup) return;
    if (props.popup) {
      popup.setOffset(props.popup.pin ? PIN_OFFSET : mapMarks["popup-offset"]);
      popup.setLngLat([props.popup.lng, props.popup.lat]).addTo(map);
    } else popup.remove();
  }, [ready, props.popup?.lng, props.popup?.lat, props.popup?.pin, props.popup === null]);

  return (
    <>
      {/* MapLibre makes its container position: relative, so the container fills a positioned wrapper. */}
      <div className="absolute inset-0">
        <div ref={container} className="size-full" />
      </div>
      {popupNode && props.popup && createPortal(props.popup.content, popupNode)}
    </>
  );
}
