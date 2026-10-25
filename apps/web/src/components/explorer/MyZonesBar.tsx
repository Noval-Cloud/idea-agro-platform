import { useRef, useState } from "react";
import { Command } from "cmdk";
import { Dialog, DropdownMenu } from "radix-ui";
import { ChevronDown, FileUp, PenLine, Plus, Search, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { zoneFileTypes } from "./lib/files";
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
}

const control =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 border text-xs font-medium whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus";
const quiet = "border-ink-subtle bg-surface text-ink hover:bg-action-soft";
const menuItem =
  "flex cursor-pointer items-center gap-3 rounded-sm px-3 py-2 text-sm text-ink outline-none select-none data-highlighted:bg-action-soft";

/** The reader's own zones on the map: found by name, and added from a file or a drawing. */
export default function MyZonesBar(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const file = useRef<HTMLInputElement>(null);

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

  const upload = (chosen: File | undefined) => {
    if (!chosen) return;
    setUploading(false);
    props.onUpload(chosen);
  };

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

      {props.drawing ? (
        <button
          type="button"
          onClick={() => props.onDraw(false)}
          aria-pressed="true"
          className={cn(control, "rounded-sm border-action bg-action px-3 text-action-ink")}
        >
          <X size={iconSize.sm} aria-hidden="true" />
          {t("explorer.regions.drawCancel")}
        </button>
      ) : (
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={() => setUploading(true)}
            className={cn(control, quiet, "rounded-l-sm px-3")}
            title={t("explorer.regions.uploadHint")}
          >
            <Plus size={iconSize.sm} aria-hidden="true" />
            <span className="hidden sm:inline">{t("explorer.mine.add")}</span>
            <span className="sr-only sm:hidden">{t("explorer.mine.add")}</span>
          </button>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger
              className={cn(control, quiet, "-ml-px w-9 rounded-r-sm")}
              aria-label={t("explorer.mine.addMore")}
              title={t("explorer.mine.addMore")}
            >
              <ChevronDown size={iconSize.sm} aria-hidden="true" />
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="z-(--ia-layer-popover) min-w-56 rounded-md border border-line bg-surface p-1 shadow-overlay"
              >
                <DropdownMenu.Item className={menuItem} onSelect={() => setUploading(true)}>
                  <FileUp size={iconSize.sm} className="text-ink-muted" aria-hidden="true" />
                  {t("explorer.mine.uploadFile")}
                </DropdownMenu.Item>
                <DropdownMenu.Item className={menuItem} onSelect={() => props.onDraw(true)}>
                  <PenLine size={iconSize.sm} className="text-ink-muted" aria-hidden="true" />
                  {t("explorer.mine.drawPolygon")}
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      )}

      {!props.signedIn && props.local.size > 0 && (
        <p className="hidden min-w-0 truncate text-xs text-ink-muted lg:block">
          {t("explorer.mine.localNote")}{" "}
          <a href={props.signInHref} className="text-link underline underline-offset-(--ia-link-underline-offset)">
            {t("explorer.regions.mineSignInLink")}
          </a>
        </p>
      )}

      <Dialog.Root open={uploading} onOpenChange={setUploading}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
          <Dialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-4 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
            <div className="flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-display text-lg">{t("explorer.mine.uploadFile")}</Dialog.Title>
                <Dialog.Description className="mt-1 text-sm text-ink-muted">
                  {t("explorer.regions.uploadHint")}
                </Dialog.Description>
              </div>
              <Dialog.Close
                className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink"
                aria-label={t("explorer.zone.close")}
              >
                <X size={iconSize.sm} aria-hidden="true" />
              </Dialog.Close>
            </div>
            <button
              type="button"
              onClick={() => file.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                upload(e.dataTransfer.files[0]);
              }}
              className={cn(
                "grid place-items-center gap-2 rounded-md border border-dashed px-4 py-8 text-sm text-ink-muted hover:bg-action-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus",
                dragging ? "border-action bg-action-soft" : "border-ink-subtle",
              )}
            >
              <FileUp size={iconSize.lg} aria-hidden="true" />
              <span className="font-medium text-ink">{t("explorer.mine.choose")}</span>
              <span>{t("explorer.mine.drop")}</span>
            </button>
            <input
              ref={file}
              type="file"
              accept={zoneFileTypes}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                upload(e.currentTarget.files?.[0]);
                e.currentTarget.value = "";
              }}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
