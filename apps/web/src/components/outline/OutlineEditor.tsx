import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import type { GeoJSONStoreFeatures, TerraDraw } from "terra-draw";
import "maplibre-gl/dist/maplibre-gl.css";
import { Button } from "@/components/ui/button";
import { createCatalogTranslator, type Locale } from "@/i18n/core";
import type { Bounds, PolygonGeometry, Position } from "@/components/explorer/lib/data";
import { bboxOf } from "@/components/explorer/lib/geo";
import { basemapStyle } from "@/components/explorer/lib/map-style";
import { mapMarks, mapTheme, useTheme } from "@/components/explorer/lib/theme";
import type { OutlineCatalog, OutlineKey } from "./i18n";

type Props = {
  locale: Locale;
  catalog: OutlineCatalog;
  signInPath: string;
  zonePath: string;
};

type Target = { zone: string; project?: string };
type Loaded = { name: string; version: number; geometry: PolygonGeometry };

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** One editable feature per polygon: the drawing tool handles polygons, not multipolygons. */
const featuresOf = (geometry: PolygonGeometry): GeoJSONStoreFeatures[] =>
  (geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates).map((rings) => ({
    type: "Feature",
    id: crypto.randomUUID(),
    geometry: { type: "Polygon", coordinates: rings },
    properties: { mode: "polygon" },
  }));

const geometryOf = (features: GeoJSONStoreFeatures[]): PolygonGeometry | null => {
  const polygons = features.flatMap((f) =>
    f.geometry.type === "Polygon" ? [f.geometry.coordinates as Position[][]] : [],
  );
  if (!polygons.length) return null;
  return polygons.length === 1
    ? { type: "Polygon", coordinates: polygons[0] }
    : { type: "MultiPolygon", coordinates: polygons };
};

/** Changes a saved zone's outline on a map. Saving keeps the previous outline as a version. */
export default function OutlineEditor({ locale, catalog, signInPath, zonePath }: Props) {
  // Stable across renders: the map is rebuilt whenever `t` changes.
  const { t } = useMemo(() => createCatalogTranslator(locale, catalog), [locale, catalog]);
  const theme = useTheme();
  const [target, setTarget] = useState<Target | null>(null);
  const [state, setState] = useState<"loading" | "signedOut" | "failed" | "ready">("loading");
  const [zone, setZone] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<OutlineKey | null>(null);
  const [saving, setSaving] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const draw = useRef<TerraDraw | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const zoneId = params.get("saved") ?? "";
    const project = params.get("project") ?? "";
    // Ids are UUIDs; anything else would end up in an API path.
    if (!UUID.test(zoneId)) return setState("failed");
    setTarget({ zone: zoneId, ...(UUID.test(project) ? { project } : {}) });
  }, []);

  useEffect(() => {
    if (!target) return;
    void (async () => {
      try {
        const [{ privately }, client] = await api();
        const { zone: id, project } = target;
        const [meta, outline] = project
          ? await Promise.all([
              privately((init) => client.getProjectZone(project, id, init)),
              privately((init) => client.getProjectZoneGeometry(project, id, init)),
            ])
          : await Promise.all([
              privately((init) => client.getSavedZone(id, init)),
              privately((init) => client.getSavedZoneGeometry(id, init)),
            ]);
        if (meta.status !== 200 || outline.status !== 200) return setState("failed");
        setZone({ name: meta.data.name, version: meta.data.version, geometry: outline.data as PolygonGeometry });
        setState("ready");
      } catch (error) {
        const { SignedOut } = await import("@/lib/account");
        setState(error instanceof SignedOut ? "signedOut" : "failed");
      }
    })();
  }, [target]);

  useEffect(() => {
    if (zone) document.title = t("outline.title", { name: zone.name });
  }, [zone, t]);

  // The map and the drawing tool, once the outline is known.
  useEffect(() => {
    if (!zone || !container.current) return;
    let map: MapLibreMap | null = null;
    let cancelled = false;
    const maplibreUrl = new URL(import.meta.env.MAPLIBRE_URL, window.location.href).href;
    void Promise.all([
      import(/* @vite-ignore */ maplibreUrl) as Promise<typeof import("maplibre-gl")>,
      import("terra-draw"),
      import("terra-draw-maplibre-gl-adapter"),
    ])
      .then(([{ Map, AttributionControl }, td, adapter]) => {
        if (cancelled || !container.current) return;
        const [west, south, east, north]: Bounds = bboxOf(zone.geometry);
        try {
          map = new Map({
            container: container.current,
            style: basemapStyle(theme),
            bounds: [west, south, east, north],
            fitBoundsOptions: { padding: 48 },
            maxZoom: 18,
            dragRotate: false,
            pitchWithRotate: false,
            touchPitch: false,
            attributionControl: false,
          });
        } catch {
          setProblem("outline.noMap");
          return;
        }
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new AttributionControl({ compact: true }), "bottom-right");
        map.getCanvas().setAttribute("aria-label", t("outline.mapLabel"));
        const loaded = map;
        let ready = false;
        // A style or tiles that fail before the map loads leave nothing to edit.
        loaded.on("error", () => {
          if (!ready) setProblem("outline.noMap");
        });
        loaded.on("load", () => {
          if (cancelled) return;
          ready = true;
          const color = mapTheme[theme].chrome["zone-own"] as `#${string}`;
          const instance = new td.TerraDraw({
            adapter: new adapter.TerraDrawMapLibreGLAdapter({ map: loaded }),
            modes: [
              // Registered so outlines load as polygons; never turned on.
              new td.TerraDrawPolygonMode(),
              new td.TerraDrawSelectMode({
                flags: {
                  polygon: {
                    feature: { draggable: false, coordinates: { midpoints: true, draggable: true, deletable: true } },
                  },
                },
                // The whole outline is never deleted from the keyboard; a corner is, with a right click.
                keyEvents: { deselect: "Escape", delete: null, rotate: null, scale: null },
                styles: {
                  selectedPolygonColor: color,
                  selectedPolygonFillOpacity: mapMarks["zone-own-fill-opacity"],
                  selectedPolygonOutlineColor: color,
                  selectedPolygonOutlineWidth: mapMarks["draw-outline-width"],
                  selectionPointColor: color,
                  midPointColor: color,
                },
              }),
            ],
          });
          instance.start();
          instance.setMode("select");
          const features = featuresOf(zone.geometry);
          if (instance.addFeatures(features).some((result) => !result.valid)) {
            instance.stop();
            return setProblem("outline.unsupported");
          }
          instance.selectFeature(features[0].id as string);
          draw.current = instance;
        });
      })
      .catch(() => setProblem("outline.noMap"));
    return () => {
      cancelled = true;
      draw.current?.stop();
      draw.current = null;
      map?.remove();
    };
  }, [zone, theme, t]);

  const back = () => {
    if (!target) return zonePath;
    const params = new URLSearchParams({ saved: target.zone, ...(target.project ? { project: target.project } : {}) });
    return `${zonePath}?${params}`;
  };

  const reset = () => {
    const instance = draw.current;
    if (!instance || !zone) return;
    instance.clear();
    const features = featuresOf(zone.geometry);
    instance.addFeatures(features);
    instance.selectFeature(features[0].id as string);
    setProblem(null);
  };

  const save = async () => {
    const geometry = draw.current && geometryOf(draw.current.getSnapshot());
    if (!target || !geometry) return;
    setProblem(null);
    setSaving(true);
    try {
      const [{ privately }, client] = await api();
      const { zone: id, project } = target;
      const response = await privately((init) =>
        project
          ? client.changeProjectZoneGeometry(project, id, { version: zone?.version ?? 0, geometry }, init)
          : client.changeSavedZoneGeometry(id, { version: zone?.version ?? 0, geometry }, init),
      );
      if (response.status === 200) return location.assign(back());
      const detail = (response.data as { detail?: string | null }).detail ?? "";
      setProblem(
        response.status === 409
          ? detail.includes("meanwhile")
            ? "outline.changedMeanwhile"
            : "outline.tooLarge"
          : response.status === 413
            ? "outline.tooLarge"
            : response.status === 422
              ? "outline.invalid"
              : response.status === 403
                ? "outline.notAllowed"
                : "outline.saveFailed",
      );
    } catch (error) {
      const { SignedOut } = await import("@/lib/account");
      if (error instanceof SignedOut) return location.assign(signInPath);
      setProblem("outline.saveFailed");
    }
    setSaving(false);
  };

  if (state !== "ready" || !zone)
    return (
      <div className="grid gap-4">
        <p role={state === "loading" ? "status" : "alert"} className="text-ink-muted">
          {t(
            state === "signedOut" ? "outline.signInToSee" : state === "loading" ? "outline.loading" : "outline.failed",
          )}
        </p>
        {state === "signedOut" && (
          <a href={signInPath} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("outline.signIn")}
          </a>
        )}
      </div>
    );

  return (
    <div className="grid gap-4">
      <h1 className="font-display text-3xl font-medium tracking-tight text-ink">
        {t("outline.title", { name: zone.name })}
      </h1>
      <div className="grid max-w-prose gap-1 text-sm text-ink-muted">
        <p>{t("outline.help")}</p>
        <p>{t("outline.versionNote")}</p>
      </div>
      <div ref={container} className="h-[60vh] min-h-80 overflow-hidden rounded-lg border border-line" />
      {problem && (
        <p role="alert" className="text-sm text-danger">
          {t(problem)}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => void save()} disabled={saving}>
          {saving ? t("outline.saving") : t("outline.save")}
        </Button>
        <Button variant="outline" onClick={reset} disabled={saving}>
          {t("outline.reset")}
        </Button>
        <a href={back()} className="inline-flex h-11 items-center px-3 text-sm text-link underline">
          {t("outline.cancel")}
        </a>
      </div>
    </div>
  );
}
