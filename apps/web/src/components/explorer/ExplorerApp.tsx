import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { minWidth, motion } from "@/design/tokens";
import { cssTime } from "@/lib/css-time";
import { cn } from "@/lib/utils";
import type { Locale } from "@/i18n/core";
import MapView, { type MapPointer, type RegionFeature } from "./MapView";
import TimeBar from "./TimeBar";
import IndicatorPicker from "./IndicatorPicker";
import RegionBar from "./RegionBar";
import ZoneCard, { type ZoneSummary } from "./ZoneCard";
import { LayersMenu, MapButtons } from "./MapControls";
import {
  loadManifest,
  loadPadrones,
  loadSeriesStats,
  loadSummaryStats,
  loadHistogramStats,
  loadZones,
  type Bounds,
  type DivisionId,
  type Manifest,
  type PadronCollection,
  type PolygonGeometry,
  type ZoneCollection,
} from "./lib/data";
import { getFrame, useFrame } from "./lib/frames";
import { readZoneFile, type CustomLayer } from "./lib/files";
import { anchorOf, areaKm2, bboxOf, ringsOf, unionBounds } from "./lib/geo";
import { createAppTranslator, I18nContext, type AppCatalog, type AppKey } from "./lib/i18n";
import { sampleGray, zonalMean } from "./lib/raster";
import type { SearchResult } from "./lib/search";
import {
  activeDivision,
  defaultState,
  readState,
  writeState,
  type ExplorerState,
  type RegionKind,
  type Selection,
} from "./lib/state";
import { mapMarks, mapTheme, useTheme } from "./lib/theme";
import { saveCustomZone } from "./lib/session";
import { readHint } from "@/lib/account-hint";
import { signInProviders } from "@/lib/sign-in-providers";

/** The API takes at most this many zones in one import. */
const IMPORT_BATCH = 100;

interface Props {
  locale: Locale;
  catalog: AppCatalog;
  /** Localized paths of the zone page and the sign-in page. */
  zonePath: string;
  signInPath: string;
  indicatorsPath: string;
  /** A static picture of the default background, shown until the map has drawn it. */
  children?: ReactNode;
}

/** Parcels are only drawn from this zoom on: there are more than a hundred thousand. */
const PADRON_ZOOM = 10.5;
const NO_DEPARTMENTS: string[] = [];
const MAX_PADRON_DEPARTMENTS = 3;
const PLAY_INTERVAL = cssTime(motion.timelapse);
/** Clicks right after a drawing ends (its closing double-click) must not clear the new selection. */
const DRAW_SETTLE = cssTime(motion.base) * 2;

const wideQuery = () => matchMedia(minWidth("lg"));
const subscribeWide = (onChange: () => void) => {
  const query = wideQuery();
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const useWide = () =>
  useSyncExternalStore(
    subscribeWide,
    () => wideQuery().matches,
    () => true,
  );

const intersects = (a: Bounds, b: Bounds) => a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];

type ZoneRecord = {
  key: string;
  kind: "division" | "padron" | "custom";
  division?: DivisionId;
  id: string;
  title: string;
  subtitle?: string;
  areaKm2: number;
  geometry: PolygonGeometry;
  selection: Selection;
};

export default function ExplorerApp({ locale, catalog, zonePath, signInPath, indicatorsPath, children }: Props) {
  const i18n = useMemo(() => createAppTranslator(locale, catalog), [locale, catalog]);
  const { t } = i18n;
  const theme = useTheme();
  const wide = useWide();

  const [state, setState] = useState<ExplorerState>(defaultState);
  const [hydrated, setHydrated] = useState(false);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [error, setError] = useState<"webgl" | "load" | null>(null);
  const [playing, setPlaying] = useState(false);
  const [mapView, setMapView] = useState<{ zoom: number; bounds: Bounds } | null>(null);
  const [pointer, setPointer] = useState<MapPointer | null>(null);
  const [focus, setFocus] = useState<{ bbox: Bounds; id: number; maxZoom?: number } | null>(null);
  const [anchor, setAnchor] = useState<[number, number] | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [custom, setCustom] = useState<CustomLayer[]>([]);
  const [signedIn, setSignedIn] = useState(false);
  const [saving, setSaving] = useState<string | null>(null);
  const preparedSignIn = useRef<(() => Promise<unknown>) | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [zones, setZones] = useState<ZoneCollection | null>(null);
  const [padrones, setPadrones] = useState<Record<string, PadronCollection>>({});
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const pendingFocus = useRef<Selection | null>(null);
  const drawnAt = useRef(0);
  const [announcement, setAnnouncement] = useState("");

  const update = useCallback((patch: Partial<ExplorerState>) => setState((s) => ({ ...s, ...patch })), []);

  // The address bar holds the state, so a view can be shared; it is read after hydration.
  useEffect(() => {
    const initial = readState(location.search);
    setState(initial);
    pendingFocus.current = initial.selection;
    setHydrated(true);
    loadManifest()
      .then(setManifest)
      .catch(() => setError("load"));
  }, []);
  useEffect(() => {
    if (!hydrated) return;
    history.replaceState(history.state, "", `${location.pathname}${writeState(state)}${location.hash}`);
  }, [state, hydrated]);
  useEffect(() => {
    document.documentElement.dataset.explorerView = state.view;
  }, [state.view]);

  const indicatorId = state.indicator === "none" ? null : state.indicator;
  const indicatorManifest = manifest && indicatorId ? manifest.indicators[indicatorId] : null;
  const years = indicatorManifest?.years ?? null;
  const year = years
    ? state.year !== null && years.includes(state.year)
      ? state.year
      : years[years.length - 1]
    : null;

  const frameRequest = indicatorId
    ? { indicator: indicatorId, year, lite: playing, theme, community: state.community }
    : null;
  const frame = useFrame(manifest, frameRequest);

  // Time-lapse: one year per tick, preloading the next frames so the playback does not stutter.
  useEffect(() => {
    if (!playing || !years || !indicatorId || !manifest) return;
    const index = years.indexOf(year ?? years[0]);
    for (const next of years.slice(index + 1, index + 4))
      void getFrame(manifest, { indicator: indicatorId, year: next, lite: true, theme, community: state.community });
    const timer = setTimeout(() => {
      if (index >= years.length - 1) setPlaying(false);
      else update({ year: years[index + 1] });
    }, PLAY_INTERVAL);
    return () => clearTimeout(timer);
  }, [playing, year, years, indicatorId, manifest, theme, state.community, update]);
  useEffect(() => setPlaying(false), [state.indicator]);

  // Regions: the division outlines, the parcels in view, or the reader's own layer.
  const division = activeDivision(state);
  useEffect(() => {
    if (!division) return setZones(null);
    let live = true;
    loadZones(division)
      .then((z) => live && setZones(z))
      .catch(() => live && setError("load"));
    return () => {
      live = false;
    };
  }, [division]);

  // Joined into a string so that panning without crossing a department keeps the same list (and
  // the map's region data untouched).
  const padronDepartmentsKey = useMemo(() => {
    if (state.regions !== "padrones" || !manifest || !mapView || mapView.zoom < PADRON_ZOOM) return "";
    const [cx, cy] = [(mapView.bounds[0] + mapView.bounds[2]) / 2, (mapView.bounds[1] + mapView.bounds[3]) / 2];
    return Object.entries(manifest.padrones)
      .filter(([, d]) => intersects(d.bbox, mapView.bounds))
      .sort(
        ([, a], [, b]) =>
          Math.hypot((a.bbox[0] + a.bbox[2]) / 2 - cx, (a.bbox[1] + a.bbox[3]) / 2 - cy) -
          Math.hypot((b.bbox[0] + b.bbox[2]) / 2 - cx, (b.bbox[1] + b.bbox[3]) / 2 - cy),
      )
      .slice(0, MAX_PADRON_DEPARTMENTS)
      .map(([slug]) => slug)
      .join(",");
  }, [state.regions, manifest, mapView]);
  const padronDepartments = useMemo(
    () => (padronDepartmentsKey ? padronDepartmentsKey.split(",") : NO_DEPARTMENTS),
    [padronDepartmentsKey],
  );
  const pendingSelectionDepartment = state.selection?.kind === "padron" ? state.selection.department : null;
  const neededDepartments = useMemo(
    () => [...new Set([...padronDepartments, ...(pendingSelectionDepartment ? [pendingSelectionDepartment] : [])])],
    [padronDepartments, pendingSelectionDepartment],
  );
  const loadingDepartment = neededDepartments.find((d) => !padrones[d]) ?? null;
  useEffect(() => {
    for (const slug of neededDepartments) {
      if (padrones[slug]) continue;
      loadPadrones(slug)
        .then((fc) => setPadrones((all) => ({ ...all, [slug]: fc })))
        .catch(() => setError("load"));
    }
  }, [neededDepartments, padrones]);

  // "Mis zonas" shows every file and drawing of the session at once, and the zones saved to the account.
  // Unsaved zones reach the zone page through the session (a new tab gets a copy of it).
  useEffect(() => {
    for (const layer of custom)
      if (layer.source !== "saved")
        for (const z of layer.zones) saveCustomZone({ key: z.key, name: z.name, geometry: z.geometry });
  }, [custom]);

  useEffect(() => {
    const update = () => setSignedIn(readHint() !== null);
    update();
    addEventListener("account-change", update);
    return () => removeEventListener("account-change", update);
  }, []);

  const loadSaved = useCallback(async () => {
    const [{ privately, SignedOut }, { getSavedZoneFeatures }] = await Promise.all([
      import("@/lib/account"),
      import("@idea-agro/api-client"),
    ]);
    try {
      const response = await privately((init) => getSavedZoneFeatures(init));
      if (response.status !== 200) throw new Error(`${response.status}`);
      const zones = response.data.features.map((f) => ({
        key: f.id,
        name: f.properties.name,
        areaKm2: f.properties.area_ha / 100,
        geometry: f.geometry as PolygonGeometry,
      }));
      const saved: CustomLayer[] = zones.length
        ? [{ key: "saved", name: t("explorer.regions.saved"), source: "saved", zones }]
        : [];
      setCustom((all) => [...saved, ...all.filter((l) => l.source !== "saved")]);
    } catch (error) {
      if (!(error instanceof SignedOut)) setNotice(t("explorer.regions.loadSavedFailed"));
    }
  }, [t]);

  useEffect(() => {
    if (state.regions === "mine" && signedIn) void loadSaved();
  }, [state.regions, signedIn, loadSaved]);

  // Signed out with zones to save: the sign-in loads ahead, so the save click can open the provider's window.
  const unsaved = custom.some((l) => l.source !== "saved");
  useEffect(() => {
    if (signedIn || !unsaved || preparedSignIn.current) return;
    void import("@/lib/account")
      .then(({ prepareSignIn }) => prepareSignIn(signInProviders[0]))
      .then((signIn) => (preparedSignIn.current = signIn));
  }, [signedIn, unsaved]);

  const onSave = async (key: string) => {
    const layer = custom.find((l) => l.key === key);
    if (!layer || layer.source === "saved") return;
    setNotice(null);
    if (!readHint()) {
      const signIn = preparedSignIn.current;
      if (!signIn)
        return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname + location.search)}`);
      try {
        await signIn();
      } catch {
        return;
      }
    }
    setSaving(key);
    try {
      const [{ privately }, { importSavedZones }] = await Promise.all([
        import("@/lib/account"),
        import("@idea-agro/api-client"),
      ]);
      const zones = layer.zones.map((z) => ({
        name: z.name,
        source: layer.source === "drawn" ? ("drawn" as const) : ("uploaded" as const),
        geometry: z.geometry,
      }));
      for (let start = 0; start < zones.length; start += IMPORT_BATCH) {
        const batch = zones.slice(start, start + IMPORT_BATCH);
        const response = await privately((init) => importSavedZones({ zones: batch }, init));
        if (response.status !== 201) {
          const detail = (response.data as { detail?: string | null }).detail ?? String(response.status);
          return setNotice(t("explorer.regions.saveFailed", { reason: detail }));
        }
      }
      setCustom((all) => all.filter((l) => l.key !== key));
      setNotice(t("explorer.regions.saveDone", { count: zones.length }));
      await loadSaved();
    } catch {
      setNotice(t("explorer.regions.saveFailed", { reason: "" }));
    } finally {
      setSaving(null);
    }
  };

  /** Every zone currently on the map, by its feature key. */
  const records = useMemo(() => {
    const out = new Map<string, ZoneRecord>();
    if (division && zones) {
      const grade = division.startsWith("cuencas-") ? Number(division.slice(-1)) : null;
      for (const f of zones.features) {
        const p = f.properties as typeof f.properties & { parent?: string };
        const seccional = division === "seccionales";
        out.set(p.id, {
          key: p.id,
          kind: "division",
          division,
          id: p.id,
          title: seccional
            ? t("explorer.zone.seccional", { department: p.dept ?? "", number: p.section ?? "" })
            : p.name || (grade === 5 ? t("explorer.zone.subbasin", { code: p.id }) : p.id),
          subtitle: seccional ? p.name : grade === 5 && p.parent ? p.parent : undefined,
          areaKm2: p.areaKm2,
          geometry: f.geometry,
          selection: { kind: "division", division, id: p.id },
        });
      }
    }
    const showPadrones = state.regions === "padrones" ? padronDepartments : [];
    const departments = [
      ...new Set([...showPadrones, ...(pendingSelectionDepartment ? [pendingSelectionDepartment] : [])]),
    ];
    for (const slug of departments) {
      for (const f of padrones[slug]?.features ?? []) {
        const key = `${slug}:${f.properties.padron}`;
        out.set(key, {
          key,
          kind: "padron",
          id: key,
          title: t("explorer.zone.padron", { number: f.properties.padron }),
          subtitle: manifest?.padrones[slug]?.name,
          areaKm2: f.properties.areaHa / 100,
          geometry: f.geometry,
          selection: { kind: "padron", department: slug, padron: f.properties.padron },
        });
      }
    }
    if (state.regions === "mine") {
      for (const layer of custom)
        for (const z of layer.zones) {
          out.set(z.key, {
            key: z.key,
            kind: "custom",
            id: z.key,
            title: z.name,
            subtitle: layer.source === "file" ? layer.name : undefined,
            areaKm2: z.areaKm2,
            geometry: z.geometry,
            selection: { kind: "custom", layer: layer.key, key: z.key },
          });
        }
    }
    return out;
  }, [division, zones, padrones, padronDepartments, pendingSelectionDepartment, state.regions, custom, manifest, t]);

  const regionFeatures = useMemo<RegionFeature[]>(() => {
    const visible = [...records.values()].filter(
      (r) =>
        r.kind !== "padron" ||
        (state.regions === "padrones" && padronDepartments.some((d) => r.key.startsWith(`${d}:`))),
    );
    return visible.map((r) => ({
      type: "Feature",
      properties: { key: r.key, own: r.kind === "custom" },
      geometry: r.geometry,
    }));
  }, [records, state.regions, padronDepartments]);

  const selectedKey =
    state.selection?.kind === "division"
      ? state.selection.id
      : state.selection?.kind === "padron"
        ? `${state.selection.department}:${state.selection.padron}`
        : state.selection?.kind === "custom"
          ? state.selection.key
          : null;
  const selected = selectedKey ? (records.get(selectedKey) ?? null) : null;

  // A selection from the address bar or the search flies to its zone once the zone is loaded.
  useEffect(() => {
    const wanted = pendingFocus.current;
    if (!wanted || !selected) return;
    pendingFocus.current = null;
    setAnchor(anchorOf(selected.geometry));
    setFocus({ bbox: bboxOf(selected.geometry), id: Date.now(), maxZoom: selected.kind === "padron" ? 14 : 11 });
  }, [selected]);

  const select = useCallback(
    (selection: Selection | null, at?: [number, number]) => {
      update({ selection });
      setAnchor(at ?? null);
    },
    [update],
  );

  const onPick = useCallback(
    (p: MapPointer | null) => {
      if (drawing || performance.now() - drawnAt.current < DRAW_SETTLE) return;
      const record = p?.key ? records.get(p.key) : null;
      select(record ? record.selection : null, record && p ? [p.lng, p.lat] : undefined);
    },
    [records, select, drawing],
  );

  const onSearch = useCallback(
    (result: SearchResult) => {
      if (result.type === "padron") {
        pendingFocus.current = { kind: "padron", department: result.department, padron: result.padron };
        update({ regions: "padrones", selection: pendingFocus.current });
        return;
      }
      const { entry } = result;
      if (entry.d === "department") {
        // A place to look at, not a zone: whatever was selected is left behind.
        select(null);
        setFocus({ bbox: entry.bbox, id: Date.now(), maxZoom: 10 });
        return;
      }
      const selection: Selection = { kind: "division", division: entry.d, id: entry.id };
      pendingFocus.current = selection;
      const regions: RegionKind = entry.d === "seccionales" ? "seccionales" : "cuencas";
      update({
        regions,
        grade: entry.d.startsWith("cuencas-") ? (Number(entry.d.slice(-1)) as ExplorerState["grade"]) : state.grade,
        selection,
      });
      setFocus({ bbox: entry.bbox, id: Date.now(), maxZoom: 10 });
    },
    [update, select, state.grade],
  );

  // The value of the background indicator in the selected zone.
  const [zoneValue, setZoneValue] = useState<ZoneSummary["value"]>(null);
  useEffect(() => {
    if (!selected || !indicatorId || !indicatorManifest || !manifest) return setZoneValue(null);
    const name = t(`indicators.items.${indicatorId}.name` as AppKey);
    const label =
      year !== null ? t("explorer.zone.valueFor", { indicator: name, year: i18n.yearLabel(indicatorId, year) }) : name;
    const unit = t(`indicators.items.${indicatorId}.unit` as AppKey);
    let live = true;
    const done = (value: ZoneSummary["value"]) => live && setZoneValue(value);
    setZoneValue({ state: "loading", label });

    if (selected.kind === "division" && selected.division) {
      const zoneId = selected.id;
      const div = selected.division;
      const kind = indicatorManifest.kind;
      if (indicatorManifest.years) {
        loadSeriesStats(div, indicatorId).then(
          (stats) => {
            const series = stats.values[zoneId] ?? [];
            const v = series[stats.years.indexOf(year ?? -1)];
            if (v === null || v === undefined) return done({ state: "none", label });
            const valid = series.filter((x): x is number => x !== null);
            const average = valid.reduce((a, b) => a + b, 0) / valid.length;
            done({
              state: "value",
              label,
              text:
                kind === "binary"
                  ? t("explorer.zone.shareOfZone", { value: i18n.percent(v) })
                  : `${i18n.value(indicatorId, v)} ${unit}`,
              delta:
                kind === "binary" || !average
                  ? undefined
                  : t("explorer.zone.vsAverage", { delta: i18n.signedPercent(v / average - 1) }),
              approximate: false,
            });
          },
          () => done({ state: "none", label }),
        );
      } else if (indicatorId === "compn") {
        loadHistogramStats(div, "compn").then(
          (stats) => {
            const histogram = stats.values[zoneId];
            const total = histogram ? Object.values(histogram).reduce((a, b) => a + b, 0) : 0;
            if (!histogram || !total) return done({ state: "none", label });
            const share = (histogram[String(state.community)] ?? 0) / total;
            done({
              state: "value",
              label: t("communities.label", { order: t(`communities.${state.community}.order` as AppKey) }),
              text: t("explorer.zone.shareOfGrassland", { value: i18n.percent(share) }),
              approximate: false,
            });
          },
          () => done({ state: "none", label }),
        );
      } else {
        loadSummaryStats(div, indicatorId).then(
          (stats) => {
            const mean = stats.values[zoneId]?.mean;
            if (mean === null || mean === undefined) return done({ state: "none", label });
            // Stored in the indicator's own unit (appropriation already in percent, diversity in bits).
            done({ state: "value", label, text: `${i18n.value(indicatorId, mean)} ${unit}`, approximate: false });
          },
          () => done({ state: "none", label }),
        );
      }
    } else if (frame && indicatorManifest.kind === "continuous") {
      // Parcels and the reader's zones have no precomputed stats yet: estimate from the raster.
      const mean = zonalMean(frame.gray, manifest.bounds, ringsOf(selected.geometry) as [number, number][][], (g) =>
        i18n.fromGray(indicatorManifest, g),
      );
      done(
        mean === null
          ? { state: "none", label }
          : { state: "value", label, text: `${i18n.value(indicatorId, mean)} ${unit}`, approximate: true },
      );
    } else done({ state: "none", label });
    return () => {
      live = false;
    };
  }, [selected, indicatorId, indicatorManifest, manifest, year, frame, state.community, i18n, t]);

  const zoneHref = (record: ZoneRecord) => {
    const params = new URLSearchParams();
    if (record.kind === "division" && record.division) {
      params.set("d", record.division);
      params.set("id", record.id);
    } else if (record.kind === "padron") params.set("padron", record.id);
    else if (record.selection.kind === "custom" && record.selection.layer === "saved") params.set("saved", record.id);
    else params.set("custom", record.key);
    if (indicatorId) params.set("ind", indicatorId);
    if (year !== null) params.set("year", String(year));
    return `${zonePath}?${params}`;
  };

  const summary: ZoneSummary | null = selected
    ? {
        key: selected.key,
        kind:
          selected.kind === "division" && selected.division?.startsWith("cuencas-")
            ? t("explorer.zone.kinds.cuencas", { grade: selected.division.slice(-1) })
            : selected.kind === "division"
              ? t("explorer.zone.kinds.seccionales")
              : selected.kind === "padron"
                ? t("explorer.zone.kinds.padrones")
                : selected.selection.kind === "custom" && selected.selection.layer === "saved"
                  ? t("explorer.zone.kinds.saved")
                  : t("explorer.zone.kinds.custom"),
        title: selected.title,
        subtitle: selected.subtitle,
        area:
          selected.areaKm2 < 10
            ? t("explorer.zone.areaHa", { value: i18n.number(selected.areaKm2 * 100) })
            : t("explorer.zone.areaKm2", { value: i18n.number(selected.areaKm2) }),
        value: zoneValue,
        href: zoneHref(selected),
      }
    : null;

  // Screen readers hear which zone was opened (the card itself appears visually next to it).
  useEffect(() => {
    setAnnouncement(selected ? t("explorer.zone.selected", { name: selected.title }) : "");
  }, [selected, t]);
  const popupAt = selected ? (anchor ?? anchorOf(selected.geometry)) : null;

  // Hover readout: the zone under the pointer and the indicator's value at that pixel.
  const hoverText = useMemo(() => {
    if (!pointer || !wide) return null;
    const lines: string[] = [];
    const record = pointer.key ? records.get(pointer.key) : null;
    if (record) lines.push(record.title);
    if (frame && indicatorId && indicatorManifest?.kind === "continuous" && manifest) {
      const gray = sampleGray(frame.gray, manifest.bounds, pointer.lng, pointer.lat);
      if (gray !== null)
        lines.push(
          t("explorer.hover.value", {
            value: i18n.value(indicatorId, i18n.fromGray(indicatorManifest, gray)),
            unit: t(`indicators.items.${indicatorId}.unit` as AppKey),
          }),
        );
    }
    return lines.length ? lines : null;
  }, [pointer, wide, records, frame, indicatorId, indicatorManifest, manifest, i18n, t]);

  // Files and drawings stay in this browser session until accounts exist.
  const addLayer = (layer: CustomLayer) => {
    setCustom((all) => [...all.filter((l) => l.key !== layer.key), layer]);
    update({ regions: "mine", selection: null });
    setFocus({ bbox: unionBounds(layer.zones.map((z) => bboxOf(z.geometry))), id: Date.now(), maxZoom: 13 });
  };
  const onUpload = async (file: File) => {
    setNotice(null);
    try {
      const found = await readZoneFile(file, (n) => t("explorer.zone.customName", { number: n }));
      if (!found.length) return setNotice(t("explorer.regions.uploadEmpty", { name: file.name }));
      addLayer({ key: `file:${file.name}`, name: file.name, source: "file", zones: found });
    } catch {
      setNotice(t("explorer.regions.uploadError", { name: file.name }));
    }
  };

  const drawRef = useRef<{ stop: () => void } | null>(null);
  useEffect(() => {
    const map = mapRef.current;
    if (!drawing || !map) return;
    let cancelled = false;
    void Promise.all([import("terra-draw"), import("terra-draw-maplibre-gl-adapter")]).then(([td, adapter]) => {
      if (cancelled) return;
      const color = mapTheme[theme].chrome["zone-own"] as `#${string}`;
      const draw = new td.TerraDraw({
        adapter: new adapter.TerraDrawMapLibreGLAdapter({ map }),
        modes: [
          new td.TerraDrawPolygonMode({
            styles: {
              fillColor: color,
              fillOpacity: mapMarks["zone-own-fill-opacity"],
              outlineColor: color,
              outlineWidth: mapMarks["draw-outline-width"],
              closingPointColor: color,
            },
          }),
        ],
      });
      draw.start();
      draw.setMode("polygon");
      map.doubleClickZoom.disable();
      draw.on("finish", (id) => {
        drawnAt.current = performance.now();
        const feature = draw.getSnapshotFeature(id);
        if (feature?.geometry.type === "Polygon") {
          const geometry = feature.geometry as PolygonGeometry;
          setCustom((all) => {
            const drawn = all.find((l) => l.key === "drawn") ?? {
              key: "drawn",
              name: t("explorer.regions.drawn"),
              source: "drawn" as const,
              zones: [],
            };
            const zone = {
              key: `drawn-${Date.now()}`,
              name: t("explorer.zone.customName", { number: drawn.zones.length + 1 }),
              areaKm2: areaKm2(geometry),
              geometry,
            };
            const next = { ...drawn, zones: [...drawn.zones, zone] };
            update({ regions: "mine", selection: { kind: "custom", layer: "drawn", key: zone.key } });
            setAnchor(anchorOf(geometry));
            return [...all.filter((l) => l.key !== "drawn"), next];
          });
        }
        setDrawing(false);
      });
      drawRef.current = { stop: () => draw.stop() };
    });
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawing(false);
    };
    addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      removeEventListener("keydown", onKey);
      drawRef.current?.stop();
      drawRef.current = null;
      // Re-enabled after the closing double-click has gone by.
      setTimeout(() => map.doubleClickZoom.enable(), DRAW_SETTLE);
    };
  }, [drawing, theme, t, update]);

  const counts = useMemo(() => {
    const out: Record<string, number> = manifest
      ? { padrones: Object.values(manifest.padrones).reduce((a, d) => a + d.count, 0) }
      : {};
    for (const [key, n] of Object.entries(manifest?.divisions ?? {})) out[key] = n;
    return out;
  }, [manifest]);

  const full = state.view === "full";
  const pickers = (variant: "list" | "tiles", prefix: string) => (
    <>
      <IndicatorPicker
        value={state.indicator}
        onChange={(indicator) => {
          update({ indicator });
          if (!wide) setLayersOpen(false);
        }}
        variant={variant}
        theme={theme}
        name={`${prefix}-indicator`}
      />
    </>
  );

  const statusMessage =
    error === "webgl"
      ? t("explorer.noWebgl")
      : error === "load"
        ? t("explorer.loadError")
        : !manifest
          ? t("explorer.loading")
          : null;

  return (
    <I18nContext.Provider value={i18n}>
      <div
        className={cn("flex bg-canvas", full ? "fixed inset-0 z-(--ia-layer-header)" : "relative h-(--ia-layout-app)")}
      >
        <h1 className="sr-only">{t("explorer.title")}</h1>
        <aside
          className={cn(
            "w-(--ia-layout-sidebar) shrink-0 flex-col gap-6 overflow-y-auto border-r border-line bg-surface px-gutter py-5",
            full ? "hidden" : "hidden lg:flex",
          )}
        >
          {pickers("list", "panel")}
          {indicatorId && (
            <div className="border-t border-line pt-4 text-sm">
              <p className="text-ink-muted">{t(`indicators.items.${indicatorId}.measures` as AppKey)}</p>
              <a
                href={`${indicatorsPath}#indicator-${indicatorId}`}
                className="mt-2 inline-block text-link underline-offset-(--ia-link-underline-offset) hover:underline"
              >
                {t("explorer.indicator.about", { name: t(`indicators.items.${indicatorId}.name` as AppKey) })}
              </a>
            </div>
          )}
        </aside>

        <div className="flex min-w-0 grow flex-col">
          <RegionBar
            manifest={manifest}
            regions={state.regions}
            grade={state.grade}
            layers={custom}
            counts={counts}
            signInHref={signInPath}
            signedIn={signedIn}
            saving={saving}
            onSave={(key) => void onSave(key)}
            drawing={drawing}
            onRegions={(regions) => update({ regions, selection: null })}
            onGrade={(grade) => update({ grade, selection: null })}
            onSearch={onSearch}
            onUpload={(file) => void onUpload(file)}
            onDraw={setDrawing}
            onRemove={(key) => {
              setCustom((all) => all.filter((l) => l.key !== key));
              if (state.selection?.kind === "custom" && state.selection.layer === key) select(null);
            }}
          />

          <div className="relative min-h-0 grow" role="region" aria-label={t("explorer.controls.map")}>
            {/* Overlays; the bottom gap leaves the map attribution readable. */}
            <div className="pointer-events-none absolute inset-0 z-(--ia-layer-map-overlay) flex flex-col gap-3 p-3 pb-8">
              <div className="flex items-start gap-3">
                <div className="grow" />
                <MapButtons
                  full={full}
                  canLocate={hydrated && "geolocation" in navigator}
                  onZoom={(delta) => (delta > 0 ? mapRef.current?.zoomIn() : mapRef.current?.zoomOut())}
                  onLocate={() =>
                    navigator.geolocation.getCurrentPosition(
                      (p) => mapRef.current?.flyTo({ center: [p.coords.longitude, p.coords.latitude], zoom: 12 }),
                      () => setNotice(t("explorer.controls.locateError")),
                    )
                  }
                  onFull={(on) => update({ view: on ? "full" : "panel" })}
                />
              </div>

              {(drawing ||
                notice ||
                (state.regions === "padrones" && (!mapView || mapView.zoom < PADRON_ZOOM || loadingDepartment))) && (
                <p
                  role="status"
                  className="pointer-events-auto mx-auto rounded-pill border border-line bg-surface px-4 py-2 text-xs text-ink shadow-raised"
                >
                  {drawing
                    ? t("explorer.regions.drawHint")
                    : notice
                      ? notice
                      : loadingDepartment && manifest
                        ? t("explorer.regions.padronesLoading", {
                            department: manifest.padrones[loadingDepartment]?.name ?? "",
                          })
                        : t("explorer.regions.padronesZoom")}
                </p>
              )}

              <div className="grow" />

              {summary && !wide ? (
                <div className="pointer-events-auto -mx-3 -mb-8">
                  <ZoneCard zone={summary} variant="sheet" onClose={() => select(null)} />
                </div>
              ) : (
                <div className="flex items-end gap-3">
                  <div className={cn(full ? "block" : "lg:hidden")}>
                    <LayersMenu indicator={state.indicator} theme={theme} open={layersOpen} onOpen={setLayersOpen}>
                      {pickers("tiles", "menu")}
                    </LayersMenu>
                  </div>
                  {indicatorId && indicatorManifest && (
                    <div className="min-w-0 grow lg:mx-auto lg:max-w-2xl">
                      <TimeBar
                        indicator={indicatorId}
                        manifest={indicatorManifest}
                        year={year}
                        playing={playing}
                        community={state.community}
                        compact={!wide}
                        onYear={(y) => update({ year: y })}
                        onPlay={(on) => {
                          // Playing from the last year starts the time-lapse over.
                          if (on && years && year === years[years.length - 1]) update({ year: years[0] });
                          setPlaying(on);
                        }}
                        onCommunity={(community) => update({ community })}
                      />
                    </div>
                  )}
                </div>
              )}
            </div>

            <MapView
              bounds={manifest?.bounds ?? [-58.46, -34.99, -53.16, -30.07]}
              theme={theme}
              frame={indicatorId ? frame : null}
              opacity={mapMarks["raster-opacity"]}
              regions={regionFeatures}
              regionsMinZoom={state.regions === "padrones" ? PADRON_ZOOM : 0}
              selectedKey={selectedKey}
              focus={focus}
              label={t("explorer.controls.map")}
              attributionLabel={t("explorer.controls.attribution")}
              popup={
                summary && popupAt && wide
                  ? {
                      lng: popupAt[0],
                      lat: popupAt[1],
                      content: <ZoneCard zone={summary} variant="popup" onClose={() => select(null)} />,
                    }
                  : null
              }
              onReady={(map) => {
                mapRef.current = map;
                setMapReady(true);
              }}
              onPointer={setPointer}
              onPick={onPick}
              onView={setMapView}
              onError={setError}
            />

            {/* Until the map draws its first frame, the static picture holds the place (and the eye). */}
            <div
              className={cn(
                "pointer-events-none absolute inset-0 pt-(--ia-map-fit-top) pr-(--ia-map-fit-controls) pb-(--ia-map-fit-bottom) pl-(--ia-map-fit-side) transition-opacity duration-(--ia-motion-base)",
                (hydrated && state.indicator !== "ppna") || (mapReady && frame) ? "opacity-0" : "opacity-100",
              )}
              aria-hidden="true"
            >
              {children}
            </div>
            {hoverText && pointer && (
              <div
                className="pointer-events-none absolute z-(--ia-layer-tooltip) translate-x-3.5 translate-y-3.5 rounded-sm border border-line bg-surface px-2.5 py-1.5 text-xs text-ink shadow-raised"
                style={{ left: pointer.x, top: pointer.y }}
                aria-hidden="true"
              >
                {hoverText.map((line, i) => (
                  <p key={line} className={i === 0 && hoverText.length > 1 ? "font-medium" : "text-ink-muted"}>
                    {line}
                  </p>
                ))}
              </div>
            )}

            <p className="sr-only" aria-live="polite">
              {announcement}
            </p>
            {statusMessage && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <p
                  role="status"
                  className="rounded-md border border-line bg-surface px-4 py-3 text-sm text-ink shadow-raised"
                >
                  {statusMessage}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </I18nContext.Provider>
  );
}
