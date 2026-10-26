import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import type { Department } from "@idea-agro/api-client";
import { ArrowLeft, Download } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { indicatorIds, indicators, indicatorsByGroup, type IndicatorId } from "@/data/indicators";
import { references, type Reference } from "@/data/references";
import { familyBackground } from "@/design/family-classes";
import { cn } from "@/lib/utils";
import { intlLocale, type Locale } from "@/i18n/core";
import XYChart, { type ChartSeries } from "@/components/charts/react/XYChart";
import { monthTicks } from "@/components/charts/month-ticks";
import { niceTicks } from "@/components/charts/scale";
import {
  isDivision,
  loadHistogramStats,
  loadManifest,
  loadPadrones,
  loadSeriesStats,
  loadSummaryStats,
  loadZoneMeta,
  loadZoneSeasonal,
  rasterUrl,
  type DivisionId,
  type Manifest,
  type ZoneGeometry,
  type SeasonalId,
} from "@/components/explorer/lib/data";
import { areaKm2 } from "@/components/explorer/lib/geo";
import {
  createAppTranslator,
  I18nContext,
  useI18n,
  type AppCatalog,
  type AppKey,
} from "@/components/explorer/lib/i18n";
import { decodeGray, zonalCounts, zonalMean } from "@/components/explorer/lib/raster";
import { findMyZone } from "@/components/explorer/lib/my-zones";
import AddToProject from "./AddToProject";
import Locator from "./Locator";
import OutlineVersions from "./OutlineVersions";
import SeasonLegend from "./SeasonLegend";

interface Props {
  locale: Locale;
  catalog: AppCatalog;
  explorePath: string;
  signInPath: string;
  projectsPath: string;
  outlinePath: string;
}

type Target =
  | { kind: "division"; division: DivisionId; id: string }
  | { kind: "padron"; department: string; padron: number }
  | { kind: "custom"; key: string }
  | { kind: "saved"; id: string; project?: string };

type Zone = {
  target: Target;
  kind: string;
  title: string;
  subtitle?: string;
  department?: string;
  areaKm2: number;
  geometry: ZoneGeometry;
  /** For saved zones: whether it is the reader's own, and whether they may change its outline. */
  access?: { own: boolean; editable: boolean };
};

function readTarget(search: string): { target: Target | null; indicator: IndicatorId; year: number | null } {
  const params = new URLSearchParams(search);
  const ind = params.get("ind") as IndicatorId | null;
  const indicator = ind && indicatorIds.includes(ind) ? ind : "ppna";
  const yearParam = Number(params.get("year"));
  const year = Number.isInteger(yearParam) && yearParam > 1900 ? yearParam : null;
  const d = params.get("d");
  const id = params.get("id");
  if (d && id && isDivision(d)) return { target: { kind: "division", division: d, id }, indicator, year };
  const padron = params.get("padron")?.split(":");
  if (padron?.length === 2 && /^\d+$/.test(padron[1]))
    return { target: { kind: "padron", department: padron[0], padron: Number(padron[1]) }, indicator, year };
  const custom = params.get("custom");
  if (custom) return { target: { kind: "custom", key: custom }, indicator, year };
  const saved = params.get("saved");
  // Ids are UUIDs; anything else would end up in an API path.
  const project = params.get("project");
  if (saved && UUID.test(saved))
    return {
      target: { kind: "saved", id: saved, ...(project && UUID.test(project) ? { project } : {}) },
      indicator,
      year,
    };
  return { target: null, indicator, year };
}

const UUID = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

/** The zone as a project item: projects hold references to zones, never copies. */
function projectItem(target: Exclude<Target, { kind: "custom" }>): ComponentProps<typeof AddToProject>["item"] {
  if (target.kind === "saved") return { kind: "saved", zone_id: target.id };
  if (target.kind === "padron")
    return { kind: "padron", department: target.department as Department, padron: target.padron };
  return { kind: "division", division: target.division, zone_id: target.id };
}

/** Loads a value once its inputs are known; `undefined` while loading, `null` on failure. */
function useData<T>(load: (() => Promise<T>) | null, deps: unknown[]): T | null | undefined {
  const [value, setValue] = useState<T | null | undefined>(undefined);
  useEffect(() => {
    if (!load) return;
    let live = true;
    setValue(undefined);
    load().then(
      (v) => live && setValue(v),
      () => live && setValue(null),
    );
    return () => {
      live = false;
    };
    // The caller lists the inputs of `load`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

const seasonalIds: SeasonalId[] = ["ppna", "apar", "et"];
const isSeasonal = (id: IndicatorId): id is SeasonalId => (seasonalIds as string[]).includes(id);
/** 16-day totals (PPNA, APAR) become daily rates; ET composites already are mm per day. */
const perDay: Record<SeasonalId, number> = { ppna: 16, apar: 16, et: 1 };
/** Indicators whose yearly value is a total over the year (drawn as bars); the rest are levels (lines). */
const totals: IndicatorId[] = ["ppna", "apar", "et", "rh"];
const familyColor = (id: IndicatorId) => `var(--ia-family-${indicators[id].family})`;
/** The order (I–VI) of each community class in the source raster. */
const communityClasses = [4, 5, 2, 3, 1] as const;

/** Rounds for export: enough digits to be exact for the data, without floating-point noise. */
const exact = (v: number | null | undefined, digits = 2) => (v === null || v === undefined ? null : +v.toFixed(digits));

function downloadCsv(name: string, header: string[], rows: (string | number | null)[][]) {
  const cell = (v: string | number | null) =>
    v === null ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v);
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: `${name}.csv` });
  a.click();
  URL.revokeObjectURL(url);
}

export default function ZoneApp({ locale, catalog, explorePath, signInPath, projectsPath, outlinePath }: Props) {
  const i18n = useMemo(() => createAppTranslator(locale, catalog), [locale, catalog]);
  const { t } = i18n;
  const [target, setTarget] = useState<Target | null | undefined>(undefined);
  const [indicator, setIndicator] = useState<IndicatorId>("ppna");
  const [year, setYear] = useState<number | null>(null);
  const [zone, setZone] = useState<Zone | null | undefined>(undefined);
  const [signedOut, setSignedOut] = useState(false);
  const manifest = useData(() => loadManifest(), []);

  useEffect(() => {
    const read = readTarget(location.search);
    setTarget(read.target);
    setIndicator(read.indicator);
    setYear(read.year);
  }, []);

  useEffect(() => {
    if (target === undefined) return;
    if (target === null) return setZone(null);
    let live = true;
    // The title is set in the display font: waiting for it (usually already loaded) avoids a reflow.
    const done = (z: Zone | null) =>
      void document.fonts.ready.then(() => {
        if (live) setZone(z);
      });
    if (target.kind === "division") {
      loadZoneMeta(target.division, target.id).then(
        (meta) => {
          const p = meta.properties;
          const grade = target.division.startsWith("cuencas-") ? target.division.slice(-1) : null;
          done({
            target,
            kind: grade ? t("explorer.zone.kinds.cuencas", { grade }) : t("explorer.zone.kinds.seccionales"),
            title: grade
              ? p.name || (grade === "5" ? t("explorer.zone.subbasin", { code: p.id }) : p.id)
              : t("explorer.zone.seccional", { department: p.dept ?? "", number: p.section ?? "" }),
            subtitle: grade ? (grade === "5" ? p.parent : undefined) : p.name,
            department: grade ? undefined : p.dept,
            areaKm2: p.areaKm2,
            geometry: meta.geometry,
          });
        },
        () => done(null),
      );
    } else if (target.kind === "padron") {
      Promise.all([loadPadrones(target.department), loadManifest()]).then(
        ([fc, m]) => {
          const f = fc.features.find((x) => x.properties.padron === target.padron);
          if (!f) return done(null);
          done({
            target,
            kind: t("explorer.zone.kinds.padrones"),
            title: t("explorer.zone.padron", { number: target.padron }),
            department: m.padrones[target.department]?.name,
            areaKm2: f.properties.areaHa / 100,
            geometry: f.geometry,
          });
        },
        () => done(null),
      );
    } else if (target.kind === "saved") {
      void Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]).then(
        async ([{ privately, SignedOut }, api]) => {
          try {
            // The library route answers only the zone's owner; members reach it through the project.
            const own = await privately((init) => api.getSavedZone(target.id, init));
            const project = target.project;
            const meta =
              own.status === 200 || !project
                ? own
                : await privately((init) => api.getProjectZone(project, target.id, init));
            const outline = await privately((init) =>
              own.status === 200 || !project
                ? api.getSavedZoneGeometry(target.id, init)
                : api.getProjectZoneGeometry(project, target.id, init),
            );
            if (meta.status !== 200 || outline.status !== 200) return done(null);
            const role =
              own.status === 200 || !project
                ? null
                : await privately((init) => api.getProject(project, init)).then((r) =>
                    r.status === 200 ? r.data.role : null,
                  );
            done({
              target,
              kind: t("explorer.zone.kinds.saved"),
              title: meta.data.name,
              department: meta.data.department ?? undefined,
              areaKm2: meta.data.area_ha / 100,
              geometry: outline.data as ZoneGeometry,
              access: { own: own.status === 200, editable: own.status === 200 || (role !== null && role !== "viewer") },
            });
          } catch (error) {
            if (error instanceof SignedOut) setSignedOut(true);
            done(null);
          }
        },
        () => done(null),
      );
    } else {
      // A zone kept in this browser: the explorer keeps it where every tab of the site can read it.
      const stored = findMyZone(target.key);
      done(
        stored
          ? {
              target,
              kind: t("explorer.mine.inBrowser"),
              title: stored.name,
              areaKm2: areaKm2(stored.geometry),
              geometry: stored.geometry,
            }
          : null,
      );
    }
    return () => {
      live = false;
    };
  }, [target, t]);

  useEffect(() => {
    if (zone) document.title = t("zone.documentTitle", { name: zone.title });
  }, [zone, t]);
  useEffect(() => {
    if (target === undefined) return;
    const params = new URLSearchParams(location.search);
    params.set("ind", indicator);
    if (year === null) params.delete("year");
    else params.set("year", String(year));
    history.replaceState(history.state, "", `${location.pathname}?${params}`);
  }, [indicator, year, target]);

  const mapHref = (() => {
    if (!target) return explorePath;
    const params = new URLSearchParams({ ind: indicator });
    if (year !== null) params.set("year", String(year));
    if (target.kind === "division") {
      params.set("zone", `${target.division}:${target.id}`);
      if (target.division.startsWith("cuencas-")) {
        params.set("reg", "cuencas");
        params.set("grade", target.division.slice(-1));
      }
    } else if (target.kind === "padron") {
      params.set("zone", `padron:${target.department}:${target.padron}`);
      params.set("reg", "padrones");
    }
    return `${explorePath}?${params}`;
  })();

  const area = (km2: number) =>
    km2 < 10
      ? t("explorer.zone.areaHa", { value: i18n.number(km2 * 100) })
      : t("explorer.zone.areaKm2", { value: i18n.number(km2) });

  const back = (
    <a
      href={mapHref}
      className="inline-flex items-center gap-2 rounded-sm text-sm text-link underline-offset-(--ia-link-underline-offset) hover:underline"
    >
      <ArrowLeft size={iconSize.sm} aria-hidden="true" />
      {t("zone.backToMap")}
    </a>
  );

  return (
    <I18nContext.Provider value={i18n}>
      <div className="px-gutter py-8 lg:py-10">
        {zone === undefined || target === undefined ? (
          <>
            {back}
            <p role="status" className="mt-10 text-sm text-ink-muted">
              {t("zone.loading")}
            </p>
          </>
        ) : zone === null ? (
          <>
            {back}
            <p role="status" className="mt-10 max-w-prose text-base text-ink">
              {signedOut ? t("zone.signInToSee") : t("zone.notFound")}
            </p>
            {signedOut && (
              <a
                href={`${signInPath}?next=${encodeURIComponent(location.pathname + location.search)}`}
                className="mt-4 inline-block text-link underline underline-offset-(--ia-link-underline-offset)"
              >
                {t("zone.signIn")}
              </a>
            )}
          </>
        ) : (
          // The indicator list stays put on the left (as on the map); the zone and its charts on the right.
          <div className="grid gap-x-10 gap-y-8 lg:grid-cols-12">
            <div className="min-w-0 lg:col-span-9 lg:col-start-4 lg:row-start-1">
              {back}
              <header className="mt-6 flex flex-wrap items-start justify-between gap-8 border-b border-line pb-8">
                <div className="min-w-0">
                  <p className="text-sm text-ink-subtle">{zone.kind}</p>
                  <h1 className="mt-2 font-display text-4xl font-medium tracking-tight text-ink">{zone.title}</h1>
                  {zone.subtitle && <p className="mt-2 text-lg text-ink-muted">{zone.subtitle}</p>}
                  <dl className="mt-6 flex flex-wrap gap-x-10 gap-y-4 text-sm">
                    {zone.geometry.type === "Point" ? (
                      <>
                        <Fact label={t("explorer.zone.latitude")} value={i18n.degrees(zone.geometry.coordinates[1])} />
                        <Fact label={t("explorer.zone.longitude")} value={i18n.degrees(zone.geometry.coordinates[0])} />
                      </>
                    ) : (
                      <Fact label={t("zone.facts.area")} value={area(zone.areaKm2)} />
                    )}
                    {zone.department && <Fact label={t("zone.facts.department")} value={zone.department} />}
                    {zone.target.kind === "division" && (
                      <GrasslandFact
                        division={zone.target.division}
                        id={zone.target.id}
                        year={manifest?.indicators.cob.years?.at(-1)}
                      />
                    )}
                  </dl>
                  {zone.target.kind === "saved" && zone.access?.editable && zone.geometry.type !== "Point" && (
                    <a
                      href={`${outlinePath}?${new URLSearchParams({
                        saved: zone.target.id,
                        // Owners change their zones through their library, whatever their role in the project.
                        ...(zone.target.project && !zone.access.own ? { project: zone.target.project } : {}),
                      })}`}
                      className="mt-6 inline-block text-sm text-link underline underline-offset-(--ia-link-underline-offset)"
                    >
                      {t("zone.outline.edit")}
                    </a>
                  )}
                  {zone.target.kind !== "custom" && (zone.target.kind !== "saved" || zone.access?.own) && (
                    <AddToProject
                      t={t}
                      item={projectItem(zone.target)}
                      projectsPath={projectsPath}
                      signInPath={signInPath}
                    />
                  )}
                </div>
                {/* The locator is the way back to the map; its box keeps its size while the manifest loads. */}
                <a
                  href={mapHref}
                  className="block w-32 shrink-0 rounded-sm"
                  style={
                    manifest ? { aspectRatio: `${manifest.outline.width} / ${manifest.outline.height}` } : undefined
                  }
                  aria-label={t("zone.viewOnMap")}
                >
                  {manifest && <Locator manifest={manifest} geometry={zone.geometry} />}
                </a>
              </header>
              {zone.target.kind === "saved" && zone.access?.own && zone.geometry.type !== "Point" && (
                <OutlineVersions t={t} locale={locale} zoneId={zone.target.id} />
              )}
            </div>
            <aside className="min-w-0 lg:col-span-3 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <div className="lg:sticky lg:top-(--ia-layout-header) lg:pt-6">
                <IndicatorNav indicator={indicator} onIndicator={setIndicator} />
              </div>
            </aside>
            <div className="min-w-0 lg:col-span-9 lg:col-start-4">
              {manifest ? (
                <IndicatorPanel manifest={manifest} zone={zone} indicator={indicator} year={year} onYear={setYear} />
              ) : (
                // Same footprint as the panel while the manifest loads.
                <div className="min-h-120" />
              )}
            </div>
          </div>
        )}
      </div>
    </I18nContext.Provider>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-ink-subtle">{label}</dt>
      <dd className="mt-0.5 text-base font-medium text-ink">{value}</dd>
    </div>
  );
}

function GrasslandFact({ division, id, year }: { division: DivisionId; id: string; year?: number }) {
  const i18n = useI18n();
  const stats = useData(() => loadSeriesStats(division, "cob"), [division]);
  const series = stats?.values[id];
  const last = series ? series[series.length - 1] : null;
  // The label (with its year) is the same while loading, so the row never re-wraps.
  const label = `${i18n.t("zone.facts.grassland")}, ${stats?.years[stats.years.length - 1] ?? year ?? ""}`;
  if (stats === undefined) return <Fact label={label} value={<span className="invisible">0</span>} />;
  if (last === null || last === undefined || !stats) return null;
  return <Fact label={label} value={i18n.percent(last)} />;
}

const groups = (["structure", "environment"] as const).map((group) => ({ group, ids: indicatorsByGroup(group) }));

/** The indicators, as tabs: a fixed list on the left on wide screens, a scrolling row on small ones. */
function IndicatorNav({ indicator, onIndicator }: { indicator: IndicatorId; onIndicator: (id: IndicatorId) => void }) {
  const { t } = useI18n();
  const list = useRef<HTMLDivElement>(null);
  const order = groups.flatMap((g) => g.ids);
  // On small screens the tabs scroll sideways: keep the selected one in view.
  useEffect(() => {
    const tab = document.getElementById(`tab-${indicator}`);
    const box = list.current;
    if (!tab || !box || box.scrollWidth <= box.clientWidth) return;
    const offset = tab.getBoundingClientRect().left - box.getBoundingClientRect().left;
    box.scrollTo({ left: box.scrollLeft + offset - (box.clientWidth - tab.offsetWidth) / 2 });
  }, [indicator]);
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = order.indexOf(indicator);
    const forward = event.key === "ArrowRight" || event.key === "ArrowDown";
    const backward = event.key === "ArrowLeft" || event.key === "ArrowUp";
    if (!forward && !backward) return;
    event.preventDefault();
    const next = order[(i + (forward ? 1 : -1) + order.length) % order.length];
    onIndicator(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <div
      ref={list}
      role="tablist"
      aria-label={t("zone.tabs")}
      className="-mx-gutter flex gap-1 overflow-x-auto px-gutter pb-2 lg:mx-0 lg:grid lg:gap-0.5 lg:overflow-visible lg:px-0 lg:pb-0"
      onKeyDown={onKey}
    >
      {groups.map(({ group, ids }) => (
        <Fragment key={group}>
          <p aria-hidden="true" className="mt-5 mb-1.5 hidden px-3 text-2xs text-ink-subtle first:mt-0 lg:block">
            {t(`explorer.groups.${group}`)}
          </p>
          {ids.map((ind) => {
            const selected = ind === indicator;
            return (
              <button
                key={ind}
                id={`tab-${ind}`}
                type="button"
                role="tab"
                aria-selected={selected}
                aria-controls="indicator-panel"
                tabIndex={selected ? 0 : -1}
                onClick={() => onIndicator(ind)}
                className={cn(
                  "inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border px-3 text-sm whitespace-nowrap lg:h-auto lg:gap-3 lg:rounded-sm lg:py-2 lg:text-left lg:whitespace-normal",
                  selected
                    ? "border-ink-subtle bg-surface-sunken text-ink"
                    : "border-transparent text-ink-muted hover:bg-action-soft hover:text-ink",
                )}
              >
                <span
                  className={cn("size-2.5 shrink-0 rounded-xs", familyBackground[indicators[ind].family])}
                  aria-hidden="true"
                />
                <span className="lg:grow">{t(`indicators.items.${ind}.name` as AppKey)}</span>
                <span className="hidden text-2xs text-ink-subtle lg:inline">
                  {t(`indicators.items.${ind}.short` as AppKey)}
                </span>
              </button>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

interface PanelProps {
  manifest: Manifest;
  zone: Zone;
  indicator: IndicatorId;
  year: number | null;
  onYear: (year: number | null) => void;
}

function IndicatorPanel({ manifest, zone, indicator, year, onYear }: PanelProps) {
  const target = zone.target;
  return (
    <section id="indicator-panel" role="tabpanel" aria-labelledby={`tab-${indicator}`} className="grid gap-8">
      <div className="min-h-120 min-w-0 rounded-lg border border-line bg-surface p-5 sm:p-6">
        {target.kind === "division" ? (
          <IndicatorView
            key={indicator}
            manifest={manifest}
            division={target.division}
            id={target.id}
            title={zone.title}
            indicator={indicator}
            year={year}
            onYear={onYear}
          />
        ) : (
          <EstimatedView key={indicator} manifest={manifest} zone={zone} indicator={indicator} />
        )}
      </div>
      <About indicator={indicator} />
    </section>
  );
}

function About({ indicator }: { indicator: IndicatorId }) {
  const { t } = useI18n();
  const field = (name: string) => t(`indicators.items.${indicator}.${name}` as AppKey);
  const refs = indicators[indicator].references.map((r) => references[r as keyof typeof references] as Reference);
  return (
    <div className="grid gap-x-10 gap-y-6 text-sm md:grid-cols-2">
      <div>
        <h2 className="font-display text-2xl font-medium tracking-snug text-ink">{field("longName")}</h2>
        <h3 className="mt-5 font-medium text-ink">{t("indicators.fields.measures")}</h3>
        <p className="mt-1 max-w-measure text-ink-muted">{field("measures")}</p>
        <h3 className="mt-4 font-medium text-ink">{t("indicators.fields.method")}</h3>
        <p className="mt-1 max-w-measure text-ink-muted">{field("method")}</p>
      </div>
      <div>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3">
          {(["unit", "cadence", "period", "resolution"] as const).map((name) => (
            <div key={name}>
              <dt className="text-xs text-ink-subtle">{t(`indicators.fields.${name}`)}</dt>
              <dd className="mt-0.5 text-ink">{field(name)}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-5 border-t border-line pt-4 text-xs text-ink-subtle">{t("indicators.fields.reference")}</h3>
        <ul className="mt-2 grid gap-3">
          {refs.map((r) => (
            <li key={r.title} className="max-w-measure text-xs text-ink-muted">
              {r.authors} ({r.year}).{" "}
              <span lang={r.lang} className="text-ink">
                {r.title}
              </span>
              . {r.source}.
              {r.doi && (
                <>
                  {" "}
                  <a
                    href={`https://doi.org/${r.doi}`}
                    className="text-link underline-offset-(--ia-link-underline-offset) hover:underline"
                  >
                    {t("science.doi", { doi: r.doi })}
                  </a>
                </>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

interface ViewProps {
  manifest: Manifest;
  division: DivisionId;
  id: string;
  title: string;
  indicator: IndicatorId;
  year: number | null;
  onYear: (year: number | null) => void;
}

/** A two-way switch built on native radios (arrow keys, one tab stop). */
function Segmented<T extends string>(props: {
  name: string;
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="mb-5 inline-flex rounded-sm border border-ink-subtle p-0.5">
      <legend className="sr-only">{props.label}</legend>
      {props.options.map((o) => (
        <label
          key={o.value}
          className={cn(
            "relative inline-flex h-8 cursor-pointer items-center rounded-xs px-3 text-sm has-focus-visible:outline-2 has-focus-visible:outline-focus",
            props.value === o.value ? "bg-action text-action-ink" : "text-ink-muted hover:text-ink",
          )}
        >
          <input
            type="radio"
            name={props.name}
            className="sr-only"
            checked={props.value === o.value}
            onChange={() => props.onChange(o.value)}
          />
          {o.label}
        </label>
      ))}
    </fieldset>
  );
}

function IndicatorView(props: ViewProps) {
  const { indicator } = props;
  const [view, setView] = useState<"season" | "history">("season");
  const { t } = useI18n();
  if (isSeasonal(indicator))
    return (
      <>
        <Segmented
          name="zone-view"
          label={t("zone.views.label")}
          value={view}
          onChange={setView}
          options={[
            { value: "season", label: t("zone.views.season") },
            { value: "history", label: t("zone.views.history") },
          ]}
        />
        {view === "season" ? <SeasonView {...props} indicator={indicator} /> : <HistoryView {...props} />}
      </>
    );
  if (indicator === "compn") return <CompositionView {...props} />;
  if (indicator === "divtfe" || indicator === "csue" || indicator === "ahppn") return <RangeView {...props} />;
  return <HistoryView {...props} />;
}

/** Which compare colours go with each family that has seasonal series. */
const compareFamilies = { productivity: "productivity", water: "water" } as const;

const zoomText = (t: ReturnType<typeof useI18n>["t"]) => ({
  label: t("zone.zoom.label"),
  from: t("zone.zoom.from"),
  to: t("zone.zoom.to"),
  reset: t("zone.zoom.reset"),
});

/**
 * The chosen productive year against the mean and the range of the complete years, composite by composite, with
 * up to two more years to compare.
 */
function SeasonView({ manifest, division, id, title, indicator, year, onYear }: ViewProps & { indicator: SeasonalId }) {
  const i18n = useI18n();
  const { t } = i18n;
  const series = useData(() => loadZoneSeasonal(division, id), [division, id]);
  const bands = manifest.seasonal[indicator];
  const per = bands.filter((b) => b.startsWith("b2002-")).length;
  const step = per === 23 ? 16 : 8;
  const middle = Math.ceil(per / 2);
  const doys = Array.from({ length: per }, (_, i) => 1 + i * step);
  const order = [...doys.slice(middle), ...doys.slice(0, middle)];

  const byYear = useMemo(() => {
    const values = series?.[indicator];
    const out = new Map<number, (number | null)[]>();
    if (!values) return out;
    bands.forEach((band, i) => {
      const [y, doy] = band.slice(1).split("-").map(Number);
      const position = order.indexOf(doy);
      if (position < 0) return;
      const py = position < per - middle ? y : y - 1;
      const row = out.get(py) ?? Array.from({ length: per }, () => null);
      const v = values[i];
      row[position] = v === null || v === undefined ? null : v / perDay[indicator];
      out.set(py, row);
    });
    return out;
    // order and per derive from bands.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series, indicator, bands]);

  // Up to two more years beside the chosen one; each keeps its colour while shown.
  const [compared, setCompared] = useState<{ year: number; slot: 1 | 2 }[]>([]);
  const [showMean, setShowMean] = useState(true);
  const [showRange, setShowRange] = useState(true);

  const all = [...byYear.keys()].sort((a, b) => a - b);
  const complete = all.filter((y) => byYear.get(y)?.every((v) => v !== null));
  const latest = all[all.length - 1];
  // A year starts in July: years without July (the first one) are left out; the latest may be in progress.
  const years = all.filter((y) => byYear.get(y)?.[0] !== null || y === latest);
  const chosen = year !== null && years.includes(year) ? year : (latest ?? null);

  if (series === undefined) return <p className="text-sm text-ink-muted">{t("zone.loading")}</p>;
  if (!series || chosen === null || !complete.length)
    return <p className="text-sm text-ink-muted">{t("explorer.zone.noValue")}</p>;

  const stat = (fn: (vs: number[]) => number) =>
    order.map((_, p) => {
      const vs = complete.map((y) => byYear.get(y)?.[p]).filter((v): v is number => v !== null && v !== undefined);
      return vs.length ? fn(vs) : null;
    });
  const mean = stat((vs) => vs.reduce((a, b) => a + b, 0) / vs.length);
  const low = stat((vs) => Math.min(...vs));
  const high = stat((vs) => Math.max(...vs));
  const count = complete.length;
  const yearName = (y: number) =>
    complete.includes(y)
      ? i18n.yearLabel(indicator, y)
      : t("zone.season.inProgress", { year: i18n.yearLabel(indicator, y) });
  const label = yearName(chosen);
  const name = t(`indicators.items.${indicator}.name` as AppKey);
  const unit = t(`zone.units.${indicator}Day`);
  const dates = order.map((doy, p) => new Date(Date.UTC(p < per - middle ? chosen : chosen + 1, 0, doy)));
  const intl = intlLocale[i18n.locale];
  const dayMonth = new Intl.DateTimeFormat(intl, { day: "numeric", month: "short", timeZone: "UTC" });
  const monthName = new Intl.DateTimeFormat(intl, { month: "short", timeZone: "UTC" });
  const format = (v: number) => i18n.number(v, 1);
  const family = indicators[indicator].family as keyof typeof compareFamilies;
  const others = compared.filter((c) => c.year !== chosen && byYear.has(c.year));
  const compareColor = (slot: 1 | 2) => `var(--ia-viz-compare-${compareFamilies[family]}-${slot})`;
  const chartSeries: ChartSeries[] = [
    ...(showMean
      ? [
          {
            key: "mean",
            label: t("zone.season.mean", { count }),
            values: mean,
            color: "var(--ia-viz-series-reference)",
          },
        ]
      : []),
    ...others.map((c) => ({
      key: `year-${c.year}`,
      label: yearName(c.year),
      values: byYear.get(c.year) ?? [],
      color: compareColor(c.slot),
      points: true,
    })),
    {
      key: "year",
      label: t("zone.season.year", { year: label }),
      values: byYear.get(chosen) ?? [],
      color: familyColor(indicator),
      emphasis: true,
      points: true,
    },
  ];

  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">{t("zone.season.title", { indicator: name, year: label })}</h2>
        <p className="text-sm text-ink-muted">{unit}</p>
      </div>
      <SeasonLegend
        text={{
          year: t("zone.yearPick"),
          mean: t("zone.season.mean", { count }),
          range: t("zone.season.range", { count }),
          compare: t("zone.season.compare"),
          remove: (year) => t("zone.season.uncompare", { year }),
          full: t("zone.season.compareFull"),
        }}
        years={[...years].reverse()}
        yearName={yearName}
        chosen={chosen}
        chosenColor={familyColor(indicator)}
        onChoose={onYear}
        compared={others.map((c) => ({ year: c.year, color: compareColor(c.slot) }))}
        limit={2}
        onCompare={(y) =>
          setCompared((now) =>
            [...now, { year: y, slot: now.some((c) => c.slot === 1) ? (2 as const) : (1 as const) }].slice(0, 2),
          )
        }
        onUncompare={(y) => setCompared((now) => now.filter((c) => c.year !== y))}
        mean={showMean}
        onMean={setShowMean}
        range={showRange}
        onRange={setShowRange}
      />
      <XYChart
        mode="line"
        title={t("zone.season.title", { indicator: name, year: label })}
        summary={t("zone.season.summary", { days: step, count })}
        instructions={t("zone.chartKeys")}
        xLabels={dates.map((d) => dayMonth.format(d))}
        xTicks={monthTicks(dates[0], step, per, (d) => monthName.format(d))}
        series={chartSeries}
        band={
          showRange
            ? {
                label: t("zone.season.range", { count }),
                lower: low,
                upper: high,
                color: "var(--ia-viz-series-reference)",
              }
            : undefined
        }
        format={format}
        table={{ label: t("zone.tableView"), caption: title, xHeader: t("zone.tableDate") }}
        height="lg"
        legend={false}
        zoom={zoomText(t)}
      />
      <CsvButton
        onClick={() =>
          downloadCsv(
            `${division}-${id}-${indicator}-${chosen}`,
            [
              t("zone.tableDate"),
              `${label} (${unit})`,
              `${t("zone.season.mean", { count })} (${unit})`,
              `min (${unit})`,
              `max (${unit})`,
            ],
            dates.map((d, p) => [
              d.toISOString().slice(0, 10),
              exact(byYear.get(chosen)?.[p]),
              exact(mean[p]),
              exact(low[p]),
              exact(high[p]),
            ]),
          )
        }
      />
    </>
  );
}

const yearlySummary = (indicator: IndicatorId, t: ReturnType<typeof useI18n>["t"]) =>
  indicators[indicator].yearStyle !== "productive"
    ? t("zone.history.summaryCalendar")
    : totals.includes(indicator)
      ? t("zone.history.summary")
      : t("zone.history.summaryValue");

/** One value per year, as bars (totals) or a line (levels and shares), with its average. */
function YearlyChart({
  indicator,
  years,
  values,
  title,
  caption,
  estimated = false,
}: {
  indicator: IndicatorId;
  years: number[];
  values: (number | null)[];
  title: string;
  caption: string;
  estimated?: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const share = indicator === "cob";
  const valid = values.filter((v): v is number => v !== null);
  const average = valid.reduce((a, b) => a + b, 0) / (valid.length || 1);
  const name = share ? t("zone.cob.series") : t(`indicators.items.${indicator}.name` as AppKey);
  const labels = years.map((y) => i18n.yearLabel(indicator, y));
  const line = !totals.includes(indicator);
  const every = Math.ceil(years.length / 7);
  const format = (v: number) => i18n.number(v, share ? 0 : indicators[indicator].digits);
  return (
    <XYChart
      mode={line ? "line" : "bar"}
      title={title}
      summary={yearlySummary(indicator, t)}
      instructions={t("zone.chartKeys")}
      xLabels={labels}
      xTicks={years
        .map((_, i) => ({ index: i, label: labels[i], minor: (i / every) % 2 === 1 }))
        // A regular tick too close to the last year would collide with it.
        .filter((_, i) => (i % every === 0 && years.length - 1 - i >= every / 2) || i === years.length - 1)}
      series={[
        {
          key: indicator,
          label: estimated ? `${name} · ${t("zone.estimated.value")}` : name,
          values,
          color: familyColor(indicator),
          emphasis: true,
        },
      ]}
      reference={
        valid.length
          ? {
              label: t("zone.history.average", { count: valid.length }),
              value: average,
              color: "var(--ia-viz-series-reference)",
            }
          : undefined
      }
      format={format}
      yFromZero={!line}
      domain={share ? [0, 100] : undefined}
      table={{ label: t("zone.tableView"), caption, xHeader: t("zone.tableYear") }}
      zoom={zoomText(t)}
    />
  );
}

function HistoryView({ division, id, title, indicator }: ViewProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const stats = useData(() => loadSeriesStats(division, indicator), [division, indicator]);
  if (stats === undefined) return <p className="text-sm text-ink-muted">{t("zone.loading")}</p>;
  const raw = stats?.values[id];
  if (!stats || !raw) return <p className="text-sm text-ink-muted">{t("explorer.zone.noValue")}</p>;
  const share = indicator === "cob";
  const values = raw.map((v) => (v === null ? null : share ? v * 100 : v));
  const name = t(`indicators.items.${indicator}.name` as AppKey);
  const unit = share ? t("zone.cob.unit") : t(`indicators.items.${indicator}.unit` as AppKey);
  const heading = share ? t("zone.cob.title") : t("zone.history.title", { indicator: name });
  return (
    <>
      <div className="mb-4">
        <h2 className="text-base font-semibold text-ink">{heading}</h2>
        <p className="text-sm text-ink-muted">{unit}</p>
      </div>
      {indicator === "rh" && <p className="mb-4 text-xs text-ink-subtle">{t("zone.rhNote")}</p>}
      <YearlyChart indicator={indicator} years={stats.years} values={values} title={heading} caption={title} />
      <CsvButton
        onClick={() =>
          downloadCsv(
            `${division}-${id}-${indicator}`,
            [t("zone.tableYear"), `${share ? t("zone.cob.series") : name} (${unit})`],
            stats.years.map((y, i) => [i18n.yearLabel(indicator, y), exact(values[i], share ? 1 : 2)]),
          )
        }
      />
    </>
  );
}

/** How the zone's natural grassland splits among the grassland communities. */
function Composition({
  shares,
  title,
  estimated = false,
}: {
  shares: Map<number, number>;
  title: string;
  estimated?: boolean;
}) {
  const i18n = useI18n();
  const { t } = i18n;
  const rows = communityClasses.map((cls) => ({ cls, share: shares.get(cls) ?? 0 }));
  const label = (cls: number) => t("communities.label", { order: t(`communities.${cls}.order` as AppKey) });
  return (
    <>
      <h2 className="text-base font-semibold text-ink">{t("zone.compn.title")}</h2>
      <p className="mb-5 text-sm text-ink-muted">
        {t("zone.compn.unit")}
        {estimated && ` · ${t("zone.estimated.value")}`}
      </p>
      <ul className="grid gap-4">
        {rows.map(({ cls, share }) => (
          <li key={cls}>
            <div className="flex items-baseline justify-between gap-4 text-sm">
              <span className="text-ink">
                {label(cls)}
                <span className="block text-xs text-ink-muted">{t(`communities.${cls}.name` as AppKey)}</span>
              </span>
              <span className="font-medium text-ink">{i18n.percent(share)}</span>
            </div>
            <div className="mt-1.5 h-2 rounded-pill bg-surface-muted" aria-hidden="true">
              <div
                className="h-full rounded-pill"
                style={{ width: `${share * 100}%`, backgroundColor: familyColor("compn") }}
              />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-ink-subtle">{t("communities.missing" as AppKey)}</p>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-link underline-offset-(--ia-link-underline-offset) hover:underline">
          {t("zone.tableView")}
        </summary>
        <table className="data-table mt-3">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col">{t("zone.tableCommunity")}</th>
              <th scope="col">{t("zone.tableShare")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ cls, share }) => (
              <tr key={cls}>
                <th scope="row">{label(cls)}</th>
                <td>{i18n.percent(share)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <CsvButton
        onClick={() =>
          downloadCsv(
            `communities-${title}`,
            [t("zone.tableCommunity"), `${t("zone.tableShare")} (%)`],
            rows.map(({ cls, share }) => [label(cls), exact(share * 100, 1)]),
          )
        }
      />
    </>
  );
}

function CompositionView({ division, id, title }: ViewProps) {
  const { t } = useI18n();
  const stats = useData(() => loadHistogramStats(division, "compn"), [division]);
  if (stats === undefined) return <p className="text-sm text-ink-muted">{t("zone.loading")}</p>;
  const histogram = stats?.values[id] ?? null;
  const total = histogram ? Object.values(histogram).reduce((a, b) => a + b, 0) : 0;
  if (!histogram || !total) return <p className="text-sm text-ink-muted">{t("zone.compn.none")}</p>;
  const shares = new Map(communityClasses.map((cls) => [cls, (histogram[String(cls)] ?? 0) / total] as const));
  return <Composition shares={shares} title={title} />;
}

/** A static indicator: the zone's value against how every other zone of its division scores. */
function RangeView({ division, id, title, indicator, manifest }: ViewProps) {
  const i18n = useI18n();
  const { t } = i18n;
  const stats = useData(() => loadSummaryStats(division, indicator), [division, indicator]);
  if (stats === undefined) return <p className="text-sm text-ink-muted">{t("zone.loading")}</p>;
  const own = stats?.values[id];
  const value = own?.mean;
  if (!stats || value === null || value === undefined)
    return <p className="text-sm text-ink-muted">{t("explorer.zone.noValue")}</p>;
  // Stored in the indicator's own unit (appropriation in percent, diversity in bits).
  const spread: [number, number] | null =
    own?.p25 !== null && own?.p25 !== undefined && own?.p75 !== null && own?.p75 !== undefined
      ? [own.p25, own.p75]
      : null;
  const all = Object.values(stats.values)
    .map((v) => v?.mean)
    .filter((v): v is number => v !== null && v !== undefined)
    .sort((a, b) => a - b);
  const q = (p: number) => all[Math.min(all.length - 1, Math.max(0, Math.round(p * (all.length - 1))))];
  // A few extreme zones would flatten everyone else: the axis spans the 2nd to 98th percentile,
  // stretched to include this zone.
  const ticks = niceTicks(
    Math.min(q(0.02), value, spread?.[0] ?? value),
    Math.max(q(0.98), value, spread?.[1] ?? value),
    4,
  );
  const [lo, hi] = [ticks[0], ticks[ticks.length - 1]];
  const x = (v: number) => Math.min(100, Math.max(0, ((v - lo) / (hi - lo || 1)) * 100));
  const edge = (v: number) => (x(v) < 12 ? "translate-x-0" : x(v) > 88 ? "-translate-x-full" : "-translate-x-1/2");
  const name = t(`indicators.items.${indicator}.name` as AppKey);
  const unit = t(`indicators.items.${indicator}.unit` as AppKey);
  const format = (v: number) => i18n.value(indicator, v);
  const count = manifest.divisions[division] ?? all.length;
  const rows: [string, number | null][] = [
    [t("zone.range.value"), value],
    [`${t("zone.range.spread")} (${i18n.percent(0.25)})`, spread?.[0] ?? null],
    [`${t("zone.range.spread")} (${i18n.percent(0.75)})`, spread?.[1] ?? null],
    [`${t("zone.range.others")} (${i18n.percent(0.1)})`, q(0.1)],
    [t("zone.range.median"), q(0.5)],
    [`${t("zone.range.others")} (${i18n.percent(0.9)})`, q(0.9)],
  ];
  return (
    <>
      <h2 className="text-base font-semibold text-ink">
        {t("zone.range.title", { indicator: name, count: i18n.number(count - 1) })}
      </h2>
      <p className="mb-10 text-sm text-ink-muted">{unit}</p>
      <figure>
        <div
          className="relative mx-2 h-16"
          role="img"
          aria-label={`${t("zone.range.value")}: ${format(value)} ${unit}`}
        >
          <div className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-subtle" />
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-pill bg-surface-muted"
            style={{ left: `${x(q(0.1))}%`, width: `${x(q(0.9)) - x(q(0.1))}%` }}
          />
          <div className="absolute top-1/2 h-4 w-px -translate-y-1/2 bg-ink-subtle" style={{ left: `${x(q(0.5))}%` }} />
          {spread && (
            <div
              className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-pill"
              style={{
                left: `${x(spread[0])}%`,
                width: `${x(spread[1]) - x(spread[0])}%`,
                backgroundColor: familyColor(indicator),
              }}
            />
          )}
          <span
            className="chart-dot top-1/2"
            style={{ left: `${x(value)}%`, ["--series-color" as string]: familyColor(indicator) }}
          />
          <span
            className={cn("absolute bottom-full pb-1 text-sm font-medium whitespace-nowrap text-ink", edge(value))}
            style={{ left: `${x(value)}%` }}
          >
            {t("zone.range.zone")} {format(value)}
          </span>
        </div>
        {/* A scale under the strip, so positions can be read. */}
        <div className="relative mx-2 mt-1 h-5 text-2xs text-ink-subtle" aria-hidden="true">
          {ticks.map((tick) => (
            <span key={tick} className={cn("absolute whitespace-nowrap", edge(tick))} style={{ left: `${x(tick)}%` }}>
              {format(tick)}
            </span>
          ))}
        </div>
        <figcaption className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-xs text-ink-muted">
          <span className="flex items-center gap-2">
            <span className="h-3 w-6 rounded-pill bg-surface-muted" aria-hidden="true" />
            {t("zone.range.others")}
          </span>
          <span className="flex items-center gap-2">
            <span className="h-4 w-px bg-ink-subtle" aria-hidden="true" />
            {t("zone.range.median")}
          </span>
          {spread && (
            <span className="flex items-center gap-2">
              <span
                className="h-1.5 w-6 rounded-pill"
                style={{ backgroundColor: familyColor(indicator) }}
                aria-hidden="true"
              />
              {t("zone.range.spread")}
            </span>
          )}
        </figcaption>
      </figure>
      <details className="mt-6 text-xs">
        <summary className="cursor-pointer text-link underline-offset-(--ia-link-underline-offset) hover:underline">
          {t("zone.tableView")}
        </summary>
        <table className="data-table mt-3">
          <caption className="sr-only">{title}</caption>
          <tbody>
            {rows.map(([label, v]) => (
              <tr key={label}>
                <th scope="row">{label}</th>
                <td>{v === null ? "" : `${format(v)} ${unit}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <CsvButton
        onClick={() =>
          downloadCsv(
            `${division}-${id}-${indicator}`,
            ["", `${name} (${unit})`],
            rows.map(([label, v]) => [label, exact(v, 4)]),
          )
        }
      />
    </>
  );
}

/*
 * Parcels and the reader's own zones have no precomputed stats yet: their indicators are estimated
 * in the browser from the map's rasters (the same pixels the explorer shows), year by year.
 */
function EstimatedView({ manifest, zone, indicator }: { manifest: Manifest; zone: Zone; indicator: IndicatorId }) {
  const i18n = useI18n();
  const { t } = i18n;
  const info = manifest.indicators[indicator];
  const years = info.years;
  const [done, setDone] = useState(0);
  const [values, setValues] = useState<(number | null)[] | null>(null);
  const [shares, setShares] = useState<Map<number, number> | null>(null);

  useEffect(() => {
    let live = true;
    const scale = (g: number) =>
      info.kind === "binary" ? (g >= 128 ? 100 : 0) : (info.min ?? 0) + (g / 255) * ((info.max ?? 1) - (info.min ?? 0));
    const run = async () => {
      if (info.kind === "categorical") {
        const counts = zonalCounts(await decodeGray(rasterUrl(indicator, null)), manifest.bounds, zone.geometry);
        const byClass = new Map<number, number>();
        for (const [gray, n] of counts) {
          const cls = Math.round(gray / 51);
          if (cls) byClass.set(cls, (byClass.get(cls) ?? 0) + n);
        }
        const total = [...byClass.values()].reduce((a, b) => a + b, 0);
        if (live) setShares(new Map([...byClass].map(([cls, n]) => [cls, total ? n / total : 0])));
        return;
      }
      const list = years ?? [null];
      const out: (number | null)[] = [];
      // One year at a time: each full raster is decoded, measured and dropped.
      for (const y of list) {
        const raster = await decodeGray(rasterUrl(indicator, y));
        out.push(zonalMean(raster, manifest.bounds, zone.geometry, scale));
        if (!live) return;
        setDone(out.length);
        setValues([...out]);
      }
    };
    void run().catch(() => live && setValues([]));
    return () => {
      live = false;
    };
  }, [indicator, info, years, manifest.bounds, zone.geometry]);

  const name = t(`indicators.items.${indicator}.name` as AppKey);
  const unit = info.kind === "binary" ? t("zone.cob.unit") : t(`indicators.items.${indicator}.unit` as AppKey);
  const note = (
    <p className="mb-5 rounded-md border border-line bg-surface-sunken px-4 py-3 text-xs text-ink-muted">
      {t("zone.estimated.note")}
      {isSeasonal(indicator) && <span className="mt-1 block">{t("zone.estimated.seasonUnavailable")}</span>}
    </p>
  );
  if (info.kind === "categorical")
    return (
      <>
        {note}
        {shares ? (
          <Composition shares={shares} title={zone.title} estimated />
        ) : (
          <p className="text-sm text-ink-muted">{t("zone.loading")}</p>
        )}
      </>
    );
  const total = years?.length ?? 1;
  const heading = info.kind === "binary" ? t("zone.cob.title") : t("zone.history.title", { indicator: name });
  return (
    <>
      <h2 className="text-base font-semibold text-ink">{t("zone.estimated.title")}</h2>
      <p className="mb-4 text-sm text-ink-muted">
        {heading} · {unit}
      </p>
      {note}
      {done < total && (
        <p role="status" className="mb-4 text-xs text-ink-subtle">
          {t("zone.estimated.loading", { done, total })}
        </p>
      )}
      {years && values && values.length === years.length ? (
        <>
          <YearlyChart
            indicator={indicator}
            years={years}
            values={values}
            title={heading}
            caption={zone.title}
            estimated
          />
          <CsvButton
            onClick={() =>
              downloadCsv(
                `${zone.title}-${indicator}`,
                [t("zone.tableYear"), `${name} · ${t("zone.estimated.value")} (${unit})`],
                years.map((y, i) => [i18n.yearLabel(indicator, y), exact(values[i])]),
              )
            }
          />
        </>
      ) : !years && values?.length ? (
        <dl className="text-sm">
          <dt className="text-ink-muted">
            {t("zone.estimated.value")} · {t(`indicators.items.${indicator}.period` as AppKey)}
          </dt>
          <dd className="mt-1 font-display text-3xl text-ink">
            {values[0] === null ? t("explorer.zone.noValue") : `${i18n.value(indicator, values[0])} ${unit}`}
          </dd>
        </dl>
      ) : null}
    </>
  );
}

function CsvButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  return (
    <button
      type="button"
      onClick={onClick}
      className="mt-4 inline-flex h-9 items-center gap-2 rounded-sm border border-ink-subtle bg-surface px-3 text-xs font-medium text-ink hover:bg-action-soft"
    >
      <Download size={iconSize.sm} aria-hidden="true" />
      {t("zone.download")}
    </button>
  );
}
