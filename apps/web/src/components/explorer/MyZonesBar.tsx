import { useState } from "react";
import { Command } from "cmdk";
import { FolderPlus, Search, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import AddZone from "./AddZone";
import { useI18n } from "./lib/i18n";
import type { MyZone } from "./lib/my-zones";

interface Props {
  zones: MyZone[];
  /** The keys of the zones kept only in this browser. */
  local: ReadonlySet<string>;
  signedIn: boolean;
  signInHref: string;
  drawing: boolean;
  onPick: (key: string) => void;
  onUpload: (file: File) => void;
  onDraw: (drawing: boolean) => void;
  /** Starts a project with these zones; offered once some are in the account. */
  onCreateProject: (() => void) | null;
}

/** The reader's own zones on the map: found by name, and added from a file or a drawing. */
export default function MyZonesBar(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const found = props.zones
    .filter((z) => z.name.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const detail = (zone: MyZone) =>
    [
      zone.areaKm2 < 10
        ? t("explorer.zone.areaHa", { value: i18n.number(zone.areaKm2 * 100) })
        : t("explorer.zone.areaKm2", { value: i18n.number(zone.areaKm2) }),
      zone.file ?? (zone.source === "drawn" ? t("explorer.mine.drawn") : t("explorer.mine.uploaded")),
      props.local.has(zone.key) ? t("explorer.mine.inBrowser") : null,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <Command
        shouldFilter={false}
        label={t("explorer.mine.search")}
        className="relative min-w-0 grow sm:max-w-md"
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
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder={t("explorer.mine.placeholder")}
            aria-label={t("explorer.mine.search")}
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
        {/* Open on focus, query or not: the reader's zones are few, and seeing them is the point. */}
        <Command.List
          hidden={!open}
          className="absolute top-full left-0 z-(--ia-layer-popover) mt-1 max-h-96 w-max max-w-(--ia-layout-panel) min-w-full overflow-y-auto rounded-md border border-line bg-surface p-1 shadow-overlay"
        >
          <Command.Empty className="px-3 py-3 text-sm text-ink-muted">
            {props.zones.length ? t("explorer.mine.noMatch", { query: query.trim() }) : t("explorer.mine.empty")}
          </Command.Empty>
          {found.map((zone) => (
            <Command.Item
              key={zone.key}
              value={zone.key}
              onSelect={() => {
                props.onPick(zone.key);
                setOpen(false);
                setQuery("");
              }}
              className="flex cursor-pointer flex-col rounded-sm px-3 py-2 text-sm text-ink data-[selected=true]:bg-action-soft"
            >
              <span>{zone.name}</span>
              <span className="text-xs text-ink-muted">{detail(zone)}</span>
            </Command.Item>
          ))}
        </Command.List>
      </Command>

      <AddZone drawing={props.drawing} onUpload={props.onUpload} onDraw={props.onDraw} />
      {props.onCreateProject && (
        <button
          type="button"
          onClick={props.onCreateProject}
          className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border border-ink-subtle bg-surface px-3 text-xs font-medium whitespace-nowrap text-ink hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <FolderPlus size={iconSize.sm} aria-hidden="true" />
          <span className="hidden sm:inline">{t("explorer.projects.create")}</span>
          <span className="sr-only sm:hidden">{t("explorer.projects.create")}</span>
        </button>
      )}

      {!props.signedIn && props.local.size > 0 && (
        <p className="hidden min-w-0 truncate text-xs text-ink-muted lg:block">
          {t("explorer.mine.localNote")}{" "}
          <a href={props.signInHref} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("explorer.regions.mineSignInLink")}
          </a>
        </p>
      )}
    </>
  );
}
