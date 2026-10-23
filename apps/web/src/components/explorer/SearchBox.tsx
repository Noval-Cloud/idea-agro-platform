import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { Search, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import type { Manifest, SearchEntry } from "./lib/data";
import { useI18n } from "./lib/i18n";
import { preloadSearch, search, type SearchResult } from "./lib/search";
import type { RegionKind } from "./lib/state";

type Scope = Exclude<RegionKind, "mine">;
interface Props {
  manifest: Manifest | null;
  /** The kind of region on the map: the search looks only there (and in departments, to find a place). */
  scope: Scope;
  onPick: (result: SearchResult) => void;
}

type Group = "departments" | "padrones" | "seccionales" | "cuencas";
const groupOf = (result: SearchResult): Group =>
  result.type === "padron"
    ? "padrones"
    : result.entry.d === "department"
      ? "departments"
      : result.entry.d === "seccionales"
        ? "seccionales"
        : "cuencas";
const order: Group[] = ["padrones", "seccionales", "cuencas", "departments"];
const groupsIn: Record<Scope, Group[]> = {
  none: ["departments"],
  seccionales: ["seccionales", "departments"],
  cuencas: ["cuencas", "departments"],
  padrones: ["padrones", "departments"],
};

/** Finds a zone of the kind on the map (or a department); picking a result flies there and opens its card. */
export default function SearchBox({ manifest, scope, onPick }: Props) {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!manifest || !query.trim()) {
      setResults([]);
      return;
    }
    let live = true;
    setBusy(true);
    const timer = setTimeout(() => {
      void search(query, manifest)
        .then((r) => live && setResults(r.filter((result) => groupsIn[scope].includes(groupOf(result)))))
        .catch(() => live && setResults([]))
        .finally(() => live && setBusy(false));
    }, 120);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, manifest, scope]);

  const entryLabel = (entry: SearchEntry) =>
    entry.d === "seccionales"
      ? t("explorer.zone.seccional", { department: entry.label.split(", ")[0], number: entry.label.split(", ")[1] })
      : entry.label;
  const entryDetail = (entry: SearchEntry) =>
    entry.d.startsWith("cuencas-")
      ? [t("explorer.search.cuencaDetail", { grade: entry.d.slice(-1) }), entry.detail].filter(Boolean).join(" · ")
      : entry.detail;

  const pick = (result: SearchResult) => {
    onPick(result);
    setOpen(false);
    setQuery("");
  };

  return (
    <Command
      shouldFilter={false}
      label={t("explorer.search.label")}
      className="relative w-full"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          setQuery("");
          setOpen(false);
        }
      }}
    >
      <div className="flex h-10 items-center gap-2 rounded-sm border border-ink-subtle bg-surface px-3 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-focus">
        <Search size={iconSize.sm} className="shrink-0 text-ink-subtle" aria-hidden="true" />
        <Command.Input
          value={query}
          onValueChange={(v) => {
            setQuery(v);
            setOpen(true);
          }}
          onFocus={() => {
            preloadSearch();
            setOpen(true);
          }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={t(`explorer.search.placeholders.${scope}`)}
          aria-label={t("explorer.search.label")}
          className="h-full min-w-0 grow bg-transparent text-sm text-ink outline-none placeholder:text-ink-subtle"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="inline-flex size-7 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft"
            aria-label={t("explorer.zone.close")}
          >
            <X size={iconSize.sm} aria-hidden="true" />
          </button>
        )}
      </div>
      {/* Always in the DOM (hidden when closed), so the input's aria-controls points somewhere. */}
      <Command.List
        hidden={!(open && query.trim())}
        className="absolute inset-x-0 top-full z-(--ia-layer-popover) mt-1 max-h-96 overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-overlay"
      >
        {busy && !results.length && <Command.Loading>{t("explorer.search.loading")}</Command.Loading>}
        {!busy && (
          <Command.Empty className="px-3 py-3 text-sm text-ink-muted">
            {t("explorer.search.empty", { query: query.trim() })}
            <span className="mt-1 block text-xs text-ink-subtle">{t("explorer.search.hint")}</span>
          </Command.Empty>
        )}
        {order.map((group) => {
          const items = results.filter((r) => groupOf(r) === group);
          if (!items.length) return null;
          return (
            <Command.Group
              key={group}
              heading={t(`explorer.search.groups.${group}`)}
              className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-2 [&_[cmdk-group-heading]]:pb-1 [&_[cmdk-group-heading]]:text-2xs [&_[cmdk-group-heading]]:text-ink-subtle"
            >
              {items.map((result) => {
                const value =
                  result.type === "padron"
                    ? `padron:${result.department}:${result.padron}`
                    : `${result.entry.d}:${result.entry.id}`;
                return (
                  <Command.Item
                    key={value}
                    value={value}
                    onSelect={() => pick(result)}
                    className="flex cursor-pointer flex-col rounded-sm px-3 py-2 text-sm text-ink data-[selected=true]:bg-action-soft"
                  >
                    {result.type === "padron" ? (
                      <>
                        <span>{t("explorer.search.padron", { number: result.padron })}</span>
                        <span className="text-xs text-ink-muted">{result.departmentName}</span>
                      </>
                    ) : (
                      <>
                        <span>{entryLabel(result.entry)}</span>
                        {entryDetail(result.entry) && (
                          <span className="text-xs text-ink-muted">{entryDetail(result.entry)}</span>
                        )}
                      </>
                    )}
                  </Command.Item>
                );
              })}
            </Command.Group>
          );
        })}
      </Command.List>
    </Command>
  );
}
