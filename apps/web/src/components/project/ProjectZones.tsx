import { useEffect, useState } from "react";
import type { Department, Division, ProjectOut, SavedZoneOut } from "@idea-agro/api-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loadManifest } from "@/components/explorer/lib/data";
import { preloadSearch, search, type SearchResult } from "@/components/explorer/lib/search";
import type { ProjectTranslator } from "./i18n";
import { api, card, focusSoon, keyOf, kindOf, type Item, type ItemIn, type ZoneNames } from "./shared";

type Described = { kind: string; title: string; detail?: string; href?: string };

/** The project's zones, with links to their pages; editors also remove them. */
export function Zones({
  t,
  number,
  project,
  names,
  zonePath,
  onRemove,
}: {
  t: ProjectTranslator["t"];
  number: ProjectTranslator["number"];
  project: ProjectOut;
  names: ZoneNames | null;
  zonePath: string;
  onRemove: ((item: Item) => void) | null;
}) {
  const describe = (item: Item): Described => {
    if (item.kind === "saved")
      return item.zone
        ? {
            kind: t("project.kinds.saved"),
            title: item.zone.name,
            detail: [t("project.area", { value: number(item.zone.area_ha) }), item.zone.department]
              .filter(Boolean)
              .join(" · "),
            // Through the project, so members reach zones of other people's libraries.
            href: `${zonePath}?saved=${item.zone_id}&project=${project.id}`,
          }
        : { kind: t("project.kinds.saved"), title: t("project.zones.deleted") };
    if (item.kind === "padron")
      return {
        kind: t("project.kinds.padrones"),
        title: t("project.padron", { number: item.padron }),
        detail: names?.manifest.padrones[item.department]?.name,
        href: `${zonePath}?padron=${item.department}:${item.padron}`,
      };
    const entry = names?.entries.get(item.id);
    return {
      kind: kindOf(t, item.division),
      title: entry?.label ?? item.zone_id,
      detail: item.division.startsWith("cuencas-") ? undefined : entry?.detail,
      href: `${zonePath}?d=${item.division}&id=${item.zone_id}`,
    };
  };

  return (
    <section aria-labelledby="zones-title" className={card}>
      <h2 id="zones-title" tabIndex={-1} className="text-lg font-medium text-ink">
        {t("project.zones.title")}{" "}
        <span className="text-sm font-normal text-ink-subtle">
          {t("project.zones.count", { count: project.items.length })}
        </span>
      </h2>
      {project.items.length === 0 ? (
        <p className="mt-3 max-w-prose text-sm text-ink-muted">{t("project.zones.empty")}</p>
      ) : (
        <ul className="mt-4 grid divide-y divide-line">
          {project.items.map((item) => {
            const zone = describe(item);
            return (
              <li key={item.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                <div className="min-w-0 grow">
                  <p className="text-xs text-ink-subtle">{zone.kind}</p>
                  {zone.href ? (
                    <a
                      href={zone.href}
                      className="font-medium text-link underline-offset-(--ia-link-underline-offset) hover:underline"
                    >
                      {zone.title}
                    </a>
                  ) : (
                    <p className="font-medium text-ink-muted">{zone.title}</p>
                  )}
                  {zone.detail && <p className="text-xs text-ink-subtle">{zone.detail}</p>}
                </div>
                {onRemove && (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={t("project.zones.removeLabel", { name: zone.title })}
                    onClick={() => onRemove(item)}
                  >
                    {t("project.zones.remove")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Adds zones from the person's library, or by searching the predefined ones and parcels. */
export function AddZones({
  t,
  number,
  held,
  othersCanEdit,
  onAdd,
}: {
  t: ProjectTranslator["t"];
  number: ProjectTranslator["number"];
  held: Set<string>;
  othersCanEdit: boolean;
  onAdd: (item: ItemIn) => Promise<number>;
}) {
  const [library, setLibrary] = useState<SavedZoneOut[] | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);

  useEffect(() => {
    void api()
      .then(([{ privately }, client]) => privately((init) => client.listSavedZones(init)))
      .then((response) => setLibrary(response.status === 200 ? response.data : []))
      .catch(() => setLibrary([]));
  }, []);

  useEffect(() => {
    if (!query.trim()) return setResults(null);
    let live = true;
    void loadManifest()
      .then((manifest) => search(query, manifest))
      .then((found) => {
        if (live) setResults(found.filter((r) => r.type === "padron" || r.entry.d !== "department"));
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [query]);

  const available = library?.filter((zone) => !held.has(`saved:${zone.id}`)) ?? [];
  const toItem = (result: SearchResult): ItemIn =>
    result.type === "padron"
      ? { kind: "padron", department: result.department as Department, padron: result.padron }
      : { kind: "division", division: result.entry.d as Division, zone_id: result.entry.id };
  const addSaved = (zone: SavedZoneOut) => {
    // Others could reshape the person's own land: they confirm it first.
    if (othersCanEdit && !window.confirm(t("project.warnShared"))) return;
    void onAdd({ kind: "saved", zone_id: zone.id }).then(() => focusSoon("library-title"));
  };

  return (
    <section aria-labelledby="add-title" className={`${card} grid gap-6`}>
      <h2 id="add-title" className="text-lg font-medium text-ink">
        {t("project.add.title")}
      </h2>

      <div>
        <h3 id="library-title" tabIndex={-1} className="text-sm font-medium text-ink">
          {t("project.add.library")}
        </h3>
        {library !== null && available.length === 0 ? (
          <p className="mt-2 text-sm text-ink-muted">{t("project.add.libraryEmpty")}</p>
        ) : (
          <ul className="mt-2 grid divide-y divide-line">
            {available.map((zone) => (
              <Candidate
                key={zone.id}
                title={zone.name}
                detail={[t("project.area", { value: number(zone.area_ha) }), zone.department]
                  .filter(Boolean)
                  .join(" · ")}
                action={t("project.add.action")}
                label={t("project.add.actionLabel", { name: zone.name })}
                onAdd={() => addSaved(zone)}
              />
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="text-sm font-medium text-ink">{t("project.add.predefined")}</h3>
        <Input
          id="zone-search"
          type="search"
          className="mt-2"
          value={query}
          aria-label={t("project.add.searchLabel")}
          placeholder={t("project.add.searchPlaceholder")}
          onFocus={preloadSearch}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        {results?.length === 0 && <p className="mt-2 text-sm text-ink-muted">{t("project.add.noResults")}</p>}
        {results && results.length > 0 && (
          <ul className="mt-2 grid divide-y divide-line">
            {results.map((result) => {
              const item = toItem(result);
              const inProject = held.has(keyOf(item));
              const title =
                result.type === "padron" ? t("project.padron", { number: result.padron }) : result.entry.label;
              return (
                <Candidate
                  key={keyOf(item)}
                  title={title}
                  detail={
                    result.type === "padron"
                      ? `${t("project.kinds.padrones")} · ${result.departmentName}`
                      : [kindOf(t, result.entry.d), result.entry.d.startsWith("cuencas-") ? null : result.entry.detail]
                          .filter(Boolean)
                          .join(" · ")
                  }
                  action={inProject ? t("project.add.added") : t("project.add.action")}
                  label={inProject ? undefined : t("project.add.actionLabel", { name: title })}
                  disabled={inProject}
                  onAdd={() => void onAdd(item).then(() => focusSoon("zone-search"))}
                />
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

function Candidate({
  title,
  detail,
  action,
  label,
  disabled,
  onAdd,
}: {
  title: string;
  detail?: string;
  action: string;
  label?: string;
  disabled?: boolean;
  onAdd: () => void;
}) {
  return (
    <li className="flex items-center gap-4 py-2">
      <div className="min-w-0 grow">
        <p className="truncate text-sm text-ink">{title}</p>
        {detail && <p className="truncate text-xs text-ink-subtle">{detail}</p>}
      </div>
      <Button size="sm" variant="outline" disabled={disabled} aria-label={label} onClick={onAdd}>
        {action}
      </Button>
    </li>
  );
}
