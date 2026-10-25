import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { SavedZoneOut } from "@idea-agro/api-client";
import {
  ChartSpline,
  MapPin,
  MapPinned,
  PenLine,
  Plus,
  SearchX,
  Spline,
  TextCursorInput,
  Trash2,
  Upload,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { TooltipProvider } from "@/components/ui/tooltip";
import { loadManifest, type Manifest } from "@/components/explorer/lib/data";
import { EmptyState } from "@/components/lists/EmptyState";
import { FilterSelect } from "@/components/lists/FilterSelect";
import { ListCount, ListToolbar } from "@/components/lists/ListToolbar";
import { RowMenu, type RowAction } from "@/components/lists/RowMenu";
import { SearchField } from "@/components/lists/SearchField";
import { SortHeader, SortMenu, sortRows, type Sort } from "@/components/lists/Sorting";
import { ViewToggle, useListView } from "@/components/lists/ViewToggle";
import { ZoneShape, ZoneThumbnail, useSavedZoneOutline } from "@/components/lists/ZoneShape";
import { matches } from "@/components/lists/filter";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { AccountTranslator } from "./i18n";
import ImportZones from "./ImportZones";

type Props = {
  translator: AccountTranslator;
  zonePath: string;
  outlinePath: string;
  explorePath: string;
  signInPath: string;
};

type Kind = "all" | "areas" | "points";
type Key = "changed" | "name" | "size";

const api = () => Promise.all([import("@/lib/account"), import("@idea-agro/api-client")]);

/** The zones saved to the account: found, sorted and seen as a table or as cards; opened, renamed and deleted. */
export default function SavedZones({ translator, zonePath, outlinePath, explorePath, signInPath }: Props) {
  const { t, collator } = translator;
  const [zones, setZones] = useState<SavedZoneOut[] | null | undefined>(undefined);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<SavedZoneOut | null>(null);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState<Kind>("all");
  const [department, setDepartment] = useState("all");
  const [sort, setSort] = useState<Sort<Key>>({ key: "changed", descending: true });
  const [view, setView] = useListView("saved-zones");
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZones(init)))
      .then((response) => setZones(response.status === 200 ? response.data : null))
      .catch(() => setZones(null));
  }, []);

  // The country's outline, for the cards' locators.
  useEffect(() => {
    if (view === "cards" && !manifest) loadManifest().then(setManifest, () => undefined);
  }, [view, manifest]);

  /** Runs a change; a refusal or a network failure shows the error, an ended session leads to sign-in. */
  const change = async (run: (modules: Awaited<ReturnType<typeof api>>) => Promise<boolean>) => {
    setFailed(false);
    try {
      setFailed(!(await run(await api())));
    } catch (error) {
      if (error instanceof (await import("@/lib/account")).SignedOut)
        return location.assign(`${signInPath}?next=${encodeURIComponent(location.pathname)}`);
      setFailed(true);
    }
  };

  const rename = (id: string, name: string) =>
    change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.renameSavedZone(id, { name }, init));
      if (response.status !== 200) return false;
      setZones((all) => all?.map((z) => (z.id === id ? response.data : z)));
      setEditing(null);
      return true;
    });

  const remove = (zone: SavedZoneOut) =>
    void change(async ([{ privately }, client]) => {
      const response = await privately((init) => client.deleteSavedZone(zone.id, init));
      // Already gone, as after a delete from another tab: the list just catches up.
      if (response.status !== 204 && response.status !== 404) return false;
      setZones((all) => all?.filter((z) => z.id !== zone.id));
      return true;
    });

  const departments = useMemo(
    () => [...new Set((zones ?? []).flatMap((z) => (z.department ? [z.department] : [])))].sort(collator.compare),
    [zones, collator],
  );
  const shown = useMemo(() => {
    const found = (zones ?? []).filter(
      (z) =>
        (kind === "all" || (kind === "points") === (z.area_ha === 0)) &&
        (department === "all" || z.department === department) &&
        matches(query, z.name, z.department),
    );
    return sortRows(
      found,
      sort,
      (z, key) => (key === "name" ? z.name : key === "size" ? z.area_ha : z.updated_at),
      collator,
    );
  }, [zones, kind, department, query, sort, collator]);
  const filtered = query !== "" || kind !== "all" || department !== "all";
  const clear = () => {
    setQuery("");
    setKind("all");
    setDepartment("all");
  };

  const actions = (zone: SavedZoneOut): RowAction[] => [
    { label: t("account.zones.open"), icon: <ChartSpline />, href: `${zonePath}?saved=${zone.id}` },
    ...(zone.area_ha > 0
      ? [{ label: t("account.zones.editOutline"), icon: <Spline />, href: `${outlinePath}?saved=${zone.id}` }]
      : []),
    { label: t("account.zones.rename"), icon: <TextCursorInput />, onSelect: () => setEditing(zone.id) },
    { label: t("account.zones.delete"), icon: <Trash2 />, onSelect: () => setDeleting(zone), danger: true },
  ];

  const sortOptions: { key: Key; label: string; descending: boolean }[] = [
    { key: "changed", label: t("account.zones.sort.recent"), descending: true },
    { key: "name", label: t("account.zones.sort.name"), descending: false },
    { key: "size", label: t("account.zones.sort.size"), descending: true },
  ];

  return (
    <TooltipProvider delayDuration={300}>
      <ListToolbar
        end={
          <>
            <SortMenu t={t} sort={sort} options={sortOptions} onSort={setSort} />
            <ViewToggle t={t} view={view} onView={setView} />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" aria-label={t("account.zones.add")}>
                  <Plus aria-hidden="true" />
                  <span className="hidden sm:inline">{t("account.zones.add")}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-72">
                <DropdownMenuItem asChild>
                  <a href={explorePath}>
                    <PenLine />
                    {t("account.zones.draw")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem className="h-auto items-start py-2" onSelect={() => fileInput.current?.click()}>
                  <Upload className="mt-0.5" />
                  <span className="grid gap-0.5">
                    {t("account.zones.import.action")}
                    <span className="text-xs text-ink-subtle">{t("account.zones.import.hint")}</span>
                  </span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      >
        <SearchField
          t={t}
          value={query}
          label={t("account.zones.searchLabel")}
          placeholder={t("account.zones.searchPlaceholder")}
          onChange={setQuery}
        />
        <Segmented
          value={kind}
          onValueChange={(value) => setKind(value as Kind)}
          aria-label={t("account.zones.kinds.label")}
        >
          {(["all", "areas", "points"] as const).map((k) => (
            <SegmentedItem key={k} value={k}>
              {t(`account.zones.kinds.${k}`)}
            </SegmentedItem>
          ))}
        </Segmented>
        {departments.length > 1 && (
          <FilterSelect
            label={t("account.zones.departments.label")}
            value={department}
            all={t("account.zones.departments.all")}
            options={departments}
            onChange={setDepartment}
          />
        )}
        {zones && zones.length > 0 && (
          <ListCount>
            {filtered
              ? t("lists.showing", { shown: shown.length, total: zones.length })
              : t("account.zones.count", { count: zones.length })}
          </ListCount>
        )}
      </ListToolbar>

      <div className="grid max-w-(--ia-layout-page) gap-6 pt-6">
        <ImportZones
          t={t}
          number={translator.number}
          signInPath={signInPath}
          input={fileInput}
          onSaved={(saved) => setZones((all) => [...saved, ...(all ?? [])])}
        />
        {failed && (
          <p role="alert" className="text-sm text-danger">
            {t("account.zones.failed")}
          </p>
        )}
        {zones === undefined ? (
          <Skeleton label={t("account.loading")} />
        ) : zones === null ? (
          <p role="alert" className="text-sm text-danger">
            {t("account.zones.loadFailed")}
          </p>
        ) : zones.length === 0 ? (
          <EmptyState icon={<MapPinned />} title={t("account.zones.empty.title")} body={t("account.zones.empty.body")}>
            <a href={explorePath} className={buttonVariants({ size: "sm" })}>
              <PenLine aria-hidden="true" />
              {t("account.zones.draw")}
            </a>
            <Button size="sm" variant="outline" onClick={() => fileInput.current?.click()}>
              <Upload aria-hidden="true" />
              {t("account.zones.import.action")}
            </Button>
          </EmptyState>
        ) : shown.length === 0 ? (
          <EmptyState icon={<SearchX />} title={t("lists.noResults.title")} body={t("lists.noResults.body")}>
            <Button size="sm" variant="outline" onClick={clear}>
              {t("lists.clearFilters")}
            </Button>
          </EmptyState>
        ) : view === "table" ? (
          <ZonesTable
            translator={translator}
            zones={shown}
            sort={sort}
            onSort={setSort}
            zonePath={zonePath}
            editing={editing}
            onRename={rename}
            onStopEditing={() => setEditing(null)}
            actions={actions}
          />
        ) : (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-4">
            {shown.map((zone) => (
              <li key={zone.id}>
                <ZoneCard
                  translator={translator}
                  zone={zone}
                  manifest={manifest}
                  href={`${zonePath}?saved=${zone.id}`}
                  title={
                    editing === zone.id ? (
                      <RenameForm t={t} zone={zone} onRename={rename} onCancel={() => setEditing(null)} />
                    ) : null
                  }
                  menu={<RowMenu label={t("lists.more", { name: zone.name })} actions={actions(zone)} />}
                />
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmDialog
        open={deleting !== null}
        title={t("account.zones.confirmDelete.title", { name: deleting?.name ?? "" })}
        body={t("account.zones.confirmDelete.body")}
        confirm={t("account.zones.confirmDelete.action")}
        cancel={t("account.zones.cancel")}
        onConfirm={() => {
          if (deleting) remove(deleting);
          setDeleting(null);
        }}
        onCancel={() => setDeleting(null)}
      />
    </TooltipProvider>
  );
}

/** Size for an area; where it is, for a point. */
function sizeOf({ t, number, degrees }: AccountTranslator, zone: SavedZoneOut) {
  return zone.area_ha
    ? t("account.zones.area", { value: number(zone.area_ha) })
    : `${degrees(zone.bbox[1])}, ${degrees(zone.bbox[0])}`;
}

function ZonesTable({
  translator,
  zones,
  sort,
  onSort,
  zonePath,
  editing,
  onRename,
  onStopEditing,
  actions,
}: {
  translator: AccountTranslator;
  zones: SavedZoneOut[];
  sort: Sort<Key>;
  onSort: (sort: Sort<Key>) => void;
  zonePath: string;
  editing: string | null;
  onRename: (id: string, name: string) => Promise<void>;
  onStopEditing: () => void;
  actions: (zone: SavedZoneOut) => RowAction[];
}) {
  const { t, ago, moment } = translator;
  return (
    <div className="overflow-hidden rounded-lg border border-line bg-surface">
      <table className="w-full text-sm">
        <thead className="border-b border-line bg-surface-sunken text-left text-xs text-ink-subtle">
          <tr>
            <SortHeader
              label={t("account.zones.columns.name")}
              column="name"
              sort={sort}
              natural={false}
              onSort={onSort}
              className="pl-4"
            />
            <SortHeader
              label={t("account.zones.columns.size")}
              column="size"
              sort={sort}
              natural
              onSort={onSort}
              className="hidden text-right sm:table-cell [&>button]:flex-row-reverse"
            />
            <th scope="col" className="hidden px-3 font-medium md:table-cell">
              {t("account.zones.columns.department")}
            </th>
            <th scope="col" className="hidden px-3 font-medium lg:table-cell">
              {t("account.zones.columns.origin")}
            </th>
            <SortHeader
              label={t("account.zones.columns.changed")}
              column="changed"
              sort={sort}
              natural
              onSort={onSort}
              className="hidden sm:table-cell"
            />
            <th scope="col" className="w-12 pr-2">
              <span className="sr-only">{t("lists.actions")}</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {zones.map((zone) => (
            <tr key={zone.id} className="transition-colors duration-(--ia-motion-fast) hover:bg-surface-sunken">
              <td className="py-2 pr-3 pl-4">
                <div className="flex min-w-0 items-center gap-3">
                  <ZoneGlyph zone={zone} />
                  {editing === zone.id ? (
                    <RenameForm t={t} zone={zone} onRename={onRename} onCancel={onStopEditing} />
                  ) : (
                    <div className="min-w-0">
                      <a
                        href={`${zonePath}?saved=${zone.id}`}
                        className="block truncate font-medium text-ink underline-offset-(--ia-link-underline-offset) hover:underline"
                      >
                        {zone.name}
                      </a>
                      <p className="truncate text-xs text-ink-subtle sm:hidden">
                        {[sizeOf(translator, zone), zone.department].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  )}
                </div>
              </td>
              <td className="hidden px-3 text-right whitespace-nowrap text-ink-muted tabular-nums sm:table-cell">
                {sizeOf(translator, zone)}
              </td>
              <td className="hidden px-3 text-ink-muted md:table-cell">{zone.department ?? "—"}</td>
              <td className="hidden px-3 text-ink-muted lg:table-cell">{t(`account.zones.origins.${zone.source}`)}</td>
              <td className="hidden px-3 whitespace-nowrap text-ink-muted sm:table-cell">
                <time dateTime={zone.updated_at} title={moment(zone.updated_at)}>
                  {ago(zone.updated_at)}
                </time>
              </td>
              <td className="pr-2 text-right">
                <RowMenu label={t("lists.more", { name: zone.name })} actions={actions(zone)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A small picture of the zone at the start of its row: its outline, or a pin for a point. */
function ZoneGlyph({ zone }: { zone: SavedZoneOut }) {
  const point = zone.area_ha === 0;
  const [box, geometry] = useSavedZoneOutline(point ? null : zone.id, zone.version);
  return (
    <div
      ref={box}
      className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-line bg-surface-sunken p-1 text-action"
    >
      {point ? <MapPin size={iconSize.sm} aria-hidden="true" /> : geometry && <ZoneShape geometry={geometry} />}
    </div>
  );
}

function ZoneCard({
  translator,
  zone,
  manifest,
  href,
  title,
  menu,
}: {
  translator: AccountTranslator;
  zone: SavedZoneOut;
  manifest: Manifest | null;
  href: string;
  /** Replaces the title while the zone is renamed. */
  title: ReactNode;
  menu: ReactNode;
}) {
  const { t, ago, moment } = translator;
  return (
    <article
      className={cn(
        "relative flex h-full flex-col overflow-hidden rounded-lg border border-line bg-surface transition-[border-color,box-shadow] duration-(--ia-motion-fast) hover:border-line-strong hover:shadow-raised",
        "has-[[data-card-link]:focus-visible]:outline-2 has-[[data-card-link]:focus-visible]:outline-offset-2 has-[[data-card-link]:focus-visible]:outline-focus",
      )}
    >
      <ZoneThumbnail zone={zone} manifest={manifest} />
      <div className="flex items-start gap-2 px-4 pt-3 pb-3">
        <div className="min-w-0 grow">
          {title ?? (
            <h3 className="truncate font-medium text-ink">
              <a href={href} data-card-link className="outline-none after:absolute after:inset-0">
                {zone.name}
              </a>
            </h3>
          )}
          <p className="truncate text-xs text-ink-subtle">
            {[sizeOf(translator, zone), zone.department].filter(Boolean).join(" · ")}
          </p>
        </div>
        <div className="relative -mt-1 -mr-2">{menu}</div>
      </div>
      <p className="mt-auto flex justify-between gap-3 border-t border-line px-4 py-2.5 text-xs text-ink-subtle">
        <span>{t(`account.zones.origins.${zone.source}`)}</span>
        <time dateTime={zone.updated_at} title={moment(zone.updated_at)}>
          {ago(zone.updated_at)}
        </time>
      </p>
    </article>
  );
}

/** Renames a zone where its name was: Enter saves, Escape leaves it as it was. */
function RenameForm({
  t,
  zone,
  onRename,
  onCancel,
}: {
  t: AccountTranslator["t"];
  zone: SavedZoneOut;
  onRename: (id: string, name: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(zone.name);
  return (
    <form
      className="relative z-10 flex min-w-0 grow items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        if (name.trim()) void onRename(zone.id, name.trim());
      }}
    >
      <input
        value={name}
        maxLength={120}
        aria-label={t("account.zones.renameLabel", { name: zone.name })}
        onChange={(event) => setName(event.currentTarget.value)}
        onKeyDown={(event) => event.key === "Escape" && onCancel()}
        autoFocus
        className="h-8 min-w-0 grow rounded-sm border border-input bg-surface px-2 text-sm text-ink focus-visible:border-focus"
      />
      <Button type="submit" size="sm" className="h-8 px-2.5">
        {t("account.zones.save")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="h-8 px-2.5" onClick={onCancel}>
        {t("account.zones.cancel")}
      </Button>
    </form>
  );
}

/** Rows standing in for the list while it loads. */
function Skeleton({ label }: { label: string }) {
  return (
    <div role="status" aria-label={label} className="overflow-hidden rounded-lg border border-line bg-surface">
      <div className="h-10 border-b border-line bg-surface-sunken" />
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="flex items-center gap-3 border-b border-line px-4 py-3 last:border-b-0">
          <div className="size-9 animate-pulse rounded-sm bg-surface-muted" />
          <div className="h-3 w-48 animate-pulse rounded-xs bg-surface-muted" />
        </div>
      ))}
    </div>
  );
}
