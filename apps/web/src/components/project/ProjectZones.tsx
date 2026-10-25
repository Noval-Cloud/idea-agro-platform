import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Command } from "cmdk";
import type { Department, Division, ProjectOut, SavedZoneOut } from "@idea-agro/api-client";
import {
  ChartSpline,
  Check,
  LandPlot,
  Droplets,
  MapPin,
  Plus,
  Search,
  SearchX,
  Shield,
  Spline,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Question } from "@/components/ui/confirm-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { loadManifest, type Bounds, type Manifest, type ZoneGeometry } from "@/components/explorer/lib/data";
import { preloadSearch, search, type SearchResult } from "@/components/explorer/lib/search";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar, underToolbar } from "@/components/lists/ListToolbar";
import { RowMenu, type RowAction } from "@/components/lists/RowMenu";
import { SearchField } from "@/components/lists/SearchField";
import { ViewToggle, useListView } from "@/components/lists/ViewToggle";
import { ZoneShape, ZoneThumbnail, useSavedZoneOutline } from "@/components/lists/ZoneShape";
import { matches } from "@/components/lists/filter";
import { useQueryState } from "@/components/lists/state";
import Locator from "@/components/zone/Locator";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { ProjectTranslator } from "./i18n";
import { api, keyOf, kindOf, type Item, type ItemIn, type ZoneNames } from "./shared";

type Kind = "saved" | "seccionales" | "cuencas" | "padrones";
const kinds: Kind[] = ["saved", "cuencas", "seccionales", "padrones"];

/** A project's zone as the lists show it. */
type Row = {
  item: Item;
  kind: Kind;
  kindLabel: string;
  title: string;
  detail?: string;
  department?: string;
  href?: string;
  /** Where it is, for the locator, when known. */
  bbox?: Bounds;
  saved?: SavedZoneOut;
};

type Ask = (question: Question) => Promise<boolean>;

const icons: Record<Exclude<Kind, "saved">, ReactNode> = {
  cuencas: <Droplets />,
  seccionales: <Shield />,
  padrones: <LandPlot />,
};

/** The project's zones, found and seen as a table or cards; editors add and remove them. */
export function ZonesTab({
  translator,
  project,
  names,
  zonePath,
  outlinePath,
  ask,
  onAdd,
  onRemove,
}: {
  translator: ProjectTranslator;
  project: ProjectOut;
  names: ZoneNames | null;
  zonePath: string;
  outlinePath: string;
  ask: Ask;
  onAdd: ((item: ItemIn) => Promise<number>) | null;
  onRemove: ((item: Item) => void) | null;
}) {
  const { t, collator } = translator;
  const [query, setQuery] = useQueryState("q", "");
  const [kindValue, setKind] = useQueryState("kind", "all");
  const kind = kinds.includes(kindValue as Kind) ? kindValue : "all";
  const [view, setView] = useListView("project-zones");
  // One search to add zones, in the toolbar; the empty state opens it too.
  const [adding, setAdding] = useState(false);

  const rows = useMemo(
    () => project.items.map((item) => describe(translator, item, names, zonePath, project.id)),
    [project, names, translator, zonePath],
  );
  const present = kinds.filter((k) => rows.some((r) => r.kind === k));
  const shown = rows
    .filter((r) => (kind === "all" || r.kind === kind) && matches(query, r.title, r.detail, r.department))
    .sort((a, b) => collator.compare(a.title, b.title));
  const filtered = query !== "" || kind !== "all";

  const actions = (row: Row): RowAction[] => [
    ...(row.href ? [{ label: t("project.zones.open"), icon: <ChartSpline />, href: row.href }] : []),
    ...(onRemove && row.saved && row.saved.area_ha > 0
      ? [
          {
            label: t("project.zones.editOutline"),
            icon: <Spline />,
            href: `${outlinePath}?saved=${row.saved.id}&project=${project.id}`,
          },
        ]
      : []),
    ...(onRemove
      ? [
          {
            label: t("project.zones.remove"),
            icon: <Trash2 />,
            onSelect: () => {
              onRemove(row.item);
              // The row goes away with its menu: focus waits in the search.
              requestAnimationFrame(() => document.getElementById("list-search")?.focus());
            },
            movesFocus: true,
            danger: true,
          },
        ]
      : []),
  ];

  return (
    <>
      <ListToolbar
        end={
          <>
            <ViewToggle t={t} view={view} onView={setView} />
            {onAdd && (
              <AddZones
                translator={translator}
                project={project}
                ask={ask}
                onAdd={onAdd}
                open={adding}
                onOpenChange={setAdding}
              />
            )}
          </>
        }
      >
        <SearchField
          t={t}
          value={query}
          label={t("project.zones.searchLabel")}
          placeholder={t("project.zones.searchPlaceholder")}
          onChange={setQuery}
        />
        {present.length > 1 && (
          <FilterSelect
            label={t("project.zones.kinds.label")}
            value={kind}
            all={t("project.zones.kinds.all")}
            options={present}
            labelOf={(k) => t(`project.kindFilter.${k as Kind}`)}
            onChange={setKind}
          />
        )}
        {rows.length > 0 && (
          <ListCount>
            {filtered
              ? t("lists.showing", { shown: shown.length, total: rows.length })
              : t("project.zones.count", { count: rows.length })}
          </ListCount>
        )}
      </ListToolbar>

      <div className={cn("pt-6", underToolbar)}>
        {rows.length === 0 ? (
          <EmptyState
            icon={<MapPin />}
            title={t("project.zones.empty.title")}
            body={onAdd ? t("project.zones.empty.body") : t("project.zones.empty.viewer")}
          >
            {onAdd && (
              <Button size="sm" onClick={() => setAdding(true)}>
                <Plus aria-hidden="true" />
                {t("project.add.action")}
              </Button>
            )}
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setQuery("");
                setKind("all");
              }}
            >
              {t("lists.clearFilters")}
            </Button>
          </EmptyState>
        ) : view === "table" ? (
          <div className="overflow-hidden rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="border-b border-line bg-surface-sunken text-left text-xs text-ink-subtle">
                <tr>
                  <th scope="col" className="h-10 pr-3 pl-4 font-medium">
                    {t("project.zones.columns.name")}
                  </th>
                  <th scope="col" className="hidden px-3 font-medium md:table-cell">
                    {t("project.zones.columns.kind")}
                  </th>
                  <th scope="col" className="hidden px-3 font-medium sm:table-cell">
                    {t("project.zones.columns.detail")}
                  </th>
                  <th scope="col" className="w-12 pr-2">
                    <span className="sr-only">{t("lists.actions")}</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {shown.map((row) => (
                  <tr
                    key={row.item.id}
                    className="transition-colors duration-(--ia-motion-fast) hover:bg-surface-sunken"
                  >
                    <td className="max-w-0 py-2 pr-3 pl-4">
                      <div className="flex min-w-0 items-center gap-3">
                        <Glyph row={row} project={project.id} />
                        <div className="min-w-0">
                          {row.href ? (
                            <a
                              href={row.href}
                              className="block truncate font-medium text-ink underline-offset-(--ia-link-underline-offset) hover:underline"
                            >
                              {row.title}
                            </a>
                          ) : (
                            <p className="truncate text-ink-muted">{row.title}</p>
                          )}
                          <p className="truncate text-xs text-ink-subtle md:hidden">
                            {[row.kindLabel, row.detail].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="hidden px-3 whitespace-nowrap text-ink-muted md:table-cell">{row.kindLabel}</td>
                    <td className="hidden max-w-0 truncate px-3 text-ink-muted sm:table-cell">{row.detail ?? "—"}</td>
                    <td className="pr-2 text-right">
                      {actions(row).length > 0 && (
                        <RowMenu label={t("lists.more", { name: row.title })} actions={actions(row)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Cards translator={translator} rows={shown} project={project.id} actions={actions} />
        )}
      </div>
    </>
  );
}

/** How a project item reads: its kind, name, detail, link and, when known, where it is. */
function describe(
  { t, number, degrees }: ProjectTranslator,
  item: Item,
  names: ZoneNames | null,
  zonePath: string,
  project: string,
): Row {
  if (item.kind === "saved") {
    const zone = item.zone;
    if (!zone) return { item, kind: "saved", kindLabel: t("project.kinds.saved"), title: t("project.zones.deleted") };
    return {
      item,
      kind: "saved",
      kindLabel: t("project.kinds.saved"),
      title: zone.name,
      // A site has no area.
      detail: [
        zone.area_ha
          ? t("project.area", { value: number(zone.area_ha) })
          : t("project.coordinates", { latitude: degrees(zone.bbox[1]), longitude: degrees(zone.bbox[0]) }),
        zone.department,
      ]
        .filter(Boolean)
        .join(" · "),
      department: zone.department ?? undefined,
      // Through the project, so members reach zones of other people's libraries.
      href: `${zonePath}?saved=${item.zone_id}&project=${project}`,
      bbox: zone.bbox as Bounds,
      saved: zone,
    };
  }
  if (item.kind === "padron") {
    const department = names?.manifest.padrones[item.department]?.name;
    return {
      item,
      kind: "padrones",
      kindLabel: t("project.kinds.padrones"),
      title: t("project.padron", { number: item.padron }),
      detail: department,
      department,
      href: `${zonePath}?padron=${item.department}:${item.padron}`,
      bbox: names?.entries.get(`department:${item.department}`)?.bbox,
    };
  }
  const entry = names?.entries.get(item.id);
  return {
    item,
    kind: item.division.startsWith("cuencas-") ? "cuencas" : "seccionales",
    kindLabel: kindOf(t, item.division),
    title: entry?.label ?? item.zone_id,
    detail: item.division.startsWith("cuencas-") ? undefined : entry?.detail,
    department: entry?.detail,
    href: `${zonePath}?d=${item.division}&id=${item.zone_id}`,
    bbox: entry?.bbox,
  };
}

/** The row's small picture: a saved zone's outline, a pin for a point, or its kind. */
function Glyph({ row, project }: { row: Row; project: string }) {
  const zone = row.saved;
  const [box, geometry] = useSavedZoneOutline(zone && zone.area_ha > 0 ? zone.id : null, zone?.version ?? 0, project);
  return (
    <div
      ref={box}
      className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-sunken p-1 text-action [&_svg]:size-4"
    >
      {row.kind !== "saved" ? (
        icons[row.kind]
      ) : zone && zone.area_ha === 0 ? (
        <MapPin />
      ) : (
        geometry && geometry !== "failed" && <ZoneShape geometry={geometry} />
      )}
    </div>
  );
}

function Cards({
  translator: { t },
  rows,
  project,
  actions,
}: {
  translator: ProjectTranslator;
  rows: Row[];
  project: string;
  actions: (row: Row) => RowAction[];
}) {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  useEffect(() => {
    loadManifest().then(setManifest, () => undefined);
  }, []);
  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4">
      {rows.map((row) => (
        <li key={row.item.id}>
          <article
            className={cn(
              "relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-[border-color,box-shadow] duration-(--ia-motion-fast) hover:border-line-strong hover:shadow-raised",
              "has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-focus",
            )}
          >
            {row.saved ? (
              <ZoneThumbnail zone={row.saved} manifest={manifest} project={project} />
            ) : (
              <PlaceThumbnail row={row} manifest={manifest} />
            )}
            <div className="flex items-start gap-2 px-4 pt-3 pb-3">
              <div className="min-w-0 grow">
                <h3 className="truncate font-medium text-ink">
                  {row.href ? (
                    <a href={row.href} data-card-link className="outline-none after:absolute after:inset-0">
                      {row.title}
                    </a>
                  ) : (
                    row.title
                  )}
                </h3>
                <p className="truncate text-xs text-ink-subtle">{row.detail ?? row.kindLabel}</p>
              </div>
              {actions(row).length > 0 && (
                <div className="relative -mt-1 -mr-2">
                  <RowMenu label={t("lists.more", { name: row.title })} actions={actions(row)} />
                </div>
              )}
            </div>
            <p className="mt-auto border-t border-line px-4 py-2.5 text-xs text-ink-subtle">{row.kindLabel}</p>
          </article>
        </li>
      ))}
    </ul>
  );
}

/** A predefined zone's picture: the country with the zone's extent marked, and its kind beside it. */
function PlaceThumbnail({ row, manifest }: { row: Row; manifest: Manifest | null }) {
  const extent: ZoneGeometry | null = row.bbox
    ? {
        type: "Polygon",
        coordinates: [
          [
            [row.bbox[0], row.bbox[1]],
            [row.bbox[2], row.bbox[1]],
            [row.bbox[2], row.bbox[3]],
            [row.bbox[0], row.bbox[3]],
            [row.bbox[0], row.bbox[1]],
          ],
        ],
      }
    : null;
  return (
    <div className="relative aspect-[16/10] overflow-hidden bg-surface-sunken">
      {manifest && extent && (
        <div className="absolute inset-0 flex justify-center p-3">
          <div className="h-full" style={{ aspectRatio: `${manifest.outline.width} / ${manifest.outline.height}` }}>
            <Locator manifest={manifest} geometry={extent} />
          </div>
        </div>
      )}
      {row.kind !== "saved" && (
        <span className="absolute top-3 left-3 flex size-8 items-center justify-center rounded-sm border border-line bg-surface text-action [&_svg]:size-4">
          {icons[row.kind]}
        </span>
      )}
    </div>
  );
}

type Candidate = { key: string; title: string; detail?: string; item: ItemIn; saved?: SavedZoneOut };

/** One search over the person's library and the predefined zones; picking a result adds it and keeps the search open. */
function AddZones({
  translator,
  project,
  ask,
  onAdd,
  open,
  onOpenChange,
}: {
  translator: ProjectTranslator;
  project: ProjectOut;
  ask: Ask;
  onAdd: (item: ItemIn) => Promise<number>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t, number, degrees } = translator;
  const [query, setQuery] = useState("");
  const [library, setLibrary] = useState<SavedZoneOut[] | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  // Zones on their way into the project: several can be picked one after another.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const [full, setFull] = useState(false);
  const held = new Set(project.items.map((i) => i.id));

  useEffect(() => {
    if (!open || library) return;
    preloadSearch();
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZones(init)))
      .then((response) => setLibrary(response.status === 200 ? response.data : []))
      .catch(() => setLibrary([]));
  }, [open, library]);

  useEffect(() => {
    if (!query.trim()) return setResults([]);
    let live = true;
    void loadManifest()
      .then((manifest) => search(query, manifest))
      .then((found) => {
        if (live) setResults(found.filter((r) => r.type === "padron" || r.entry.d !== "department").slice(0, 30));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [query]);

  const mine: Candidate[] = (library ?? [])
    .filter((zone) => matches(query, zone.name, zone.department))
    .map((zone) => ({
      key: `saved:${zone.id}`,
      title: zone.name,
      detail: [
        zone.area_ha
          ? t("project.area", { value: number(zone.area_ha) })
          : t("project.coordinates", { latitude: degrees(zone.bbox[1]), longitude: degrees(zone.bbox[0]) }),
        zone.department,
      ]
        .filter(Boolean)
        .join(" · "),
      item: { kind: "saved", zone_id: zone.id },
      saved: zone,
    }));
  const predefined: Candidate[] = results.map((result) => {
    const item: ItemIn =
      result.type === "padron"
        ? { kind: "padron", department: result.department as Department, padron: result.padron }
        : { kind: "division", division: result.entry.d as Division, zone_id: result.entry.id };
    return {
      key: keyOf(item),
      title: result.type === "padron" ? t("project.padron", { number: result.padron }) : result.entry.label,
      detail:
        result.type === "padron"
          ? `${t("project.kinds.padrones")} · ${result.departmentName}`
          : [kindOf(t, result.entry.d), result.entry.d.startsWith("cuencas-") ? null : result.entry.detail]
              .filter(Boolean)
              .join(" · "),
      item,
    };
  });

  const pick = async (candidate: Candidate) => {
    if (held.has(candidate.key) || pending.has(candidate.key)) return;
    // Others could reshape the person's own land: they confirm it first.
    if (candidate.saved && project.others_can_edit) {
      onOpenChange(false);
      const sure = await ask({
        title: t("project.add.warnShared.title", { name: candidate.title }),
        body: t("project.add.warnShared.body"),
        confirm: t("project.add.warnShared.action"),
        tone: "primary",
        returnFocus: () => document.getElementById("add-zones"),
      });
      if (!sure) return;
    }
    setPending((now) => new Set(now).add(candidate.key));
    const status = await onAdd(candidate.item);
    setPending((now) => {
      const next = new Set(now);
      next.delete(candidate.key);
      return next;
    });
    setFull(status === 409);
  };

  const group = (heading: string, candidates: Candidate[]) =>
    candidates.length > 0 && (
      <Command.Group
        heading={heading}
        className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-ink-subtle"
      >
        {candidates.map((candidate) => {
          const inProject = held.has(candidate.key);
          return (
            <Command.Item
              key={candidate.key}
              value={candidate.key}
              disabled={inProject}
              onSelect={() => void pick(candidate)}
              className="flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm data-[disabled=true]:cursor-default data-[selected=true]:bg-action-soft"
            >
              <span className="grid min-w-0 grow">
                <span className={cn("truncate", inProject ? "text-ink-muted" : "text-ink")}>{candidate.title}</span>
                {candidate.detail && <span className="truncate text-xs text-ink-subtle">{candidate.detail}</span>}
              </span>
              {inProject ? (
                <span className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-subtle">
                  <Check size={iconSize.sm} aria-hidden="true" />
                  {t("project.add.added")}
                </span>
              ) : (
                <Plus
                  size={iconSize.sm}
                  aria-hidden="true"
                  className={cn("shrink-0 text-ink-subtle", pending.has(candidate.key) && "animate-pulse")}
                />
              )}
            </Command.Item>
          );
        })}
      </Command.Group>
    );

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button id="add-zones" size="sm" aria-label={t("project.add.action")}>
          <Plus aria-hidden="true" />
          <span className="hidden sm:inline">{t("project.add.action")}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(28rem,calc(100vw-2rem))] p-0">
        <Command shouldFilter={false} label={t("project.add.searchLabel")}>
          <div className="flex items-center gap-2 border-b border-line px-3">
            <Search size={iconSize.sm} aria-hidden="true" className="shrink-0 text-ink-subtle" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder={t("project.add.searchPlaceholder")}
              aria-label={t("project.add.searchLabel")}
              className="h-11 min-w-0 grow bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
            />
          </div>
          {!query.trim() && <p className="px-3 pt-3 text-xs text-ink-subtle">{t("project.add.hint")}</p>}
          <Command.List className="max-h-80 overflow-y-auto overscroll-contain p-1">
            {group(t("project.add.library"), mine)}
            {group(t("project.add.predefined"), predefined)}
            {query.trim() && (
              <Command.Empty className="px-3 py-3 text-sm text-ink-muted">{t("project.add.noResults")}</Command.Empty>
            )}
          </Command.List>
          <p role="alert" className="px-3 pb-3 text-sm text-danger empty:hidden">
            {full ? t("project.add.full") : ""}
          </p>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
