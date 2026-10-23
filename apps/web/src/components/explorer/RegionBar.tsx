import { useRef } from "react";
import { Popover, Select } from "radix-ui";
import { Check, ChevronDown, CloudUpload, Info, PenLine, Trash2, Upload } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { basinGrades, type BasinGrade, type Manifest } from "./lib/data";
import { zoneFileTypes, type CustomLayer } from "./lib/files";
import { useI18n } from "./lib/i18n";
import type { SearchResult } from "./lib/search";
import { regionKinds, type RegionKind } from "./lib/state";
import SearchBox from "./SearchBox";

interface Props {
  manifest: Manifest | null;
  regions: RegionKind;
  grade: BasinGrade;
  layers: CustomLayer[];
  counts: Partial<Record<string, number>>;
  signInHref: string;
  signedIn: boolean;
  /** The layer being saved to the account, if any. */
  saving: string | null;
  onSave: (layer: string) => void;
  drawing: boolean;
  onRegions: (regions: RegionKind) => void;
  onGrade: (grade: BasinGrade) => void;
  onSearch: (result: SearchResult) => void;
  onUpload: (file: File) => void;
  onDraw: (drawing: boolean) => void;
  onRemove: (layer: string) => void;
}

const control =
  "inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-sm border text-xs font-medium whitespace-nowrap";
const quiet = "border-ink-subtle bg-surface text-ink hover:bg-action-soft";
const pressed = "border-action bg-action text-action-ink";

/**
 * The regions drawn over the map, chosen in a bar above it. The kinds exclude each other, so the
 * first control picks one; then come the tools for that kind (grade, search, the reader's files).
 *
 * The bar keeps one height whatever the kind (one row from `sm`, two rows on phones), so the map
 * never moves when the kind changes, nor when a shared link opens on another kind than the default.
 */
export default function RegionBar(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const file = useRef<HTMLInputElement>(null);
  const countKey = (kind: RegionKind) =>
    kind === "cuencas" ? `cuencas-${props.grade}` : kind === "mine" ? null : kind;
  const count = (kind: RegionKind) => {
    const key = countKey(kind);
    const n =
      kind === "mine" ? props.layers.reduce((a, l) => a + l.zones.length, 0) : key ? props.counts[key] : undefined;
    return n === undefined || kind === "none" ? null : t("explorer.regions.count", { count: n, value: i18n.number(n) });
  };
  const uploadLabel = t("explorer.regions.upload");
  const drawLabel = props.drawing ? t("explorer.regions.drawCancel") : t("explorer.regions.draw");

  return (
    <section
      className="relative z-(--ia-layer-map-bar) grid gap-2 border-b border-line bg-surface px-3 py-2 sm:flex sm:h-14 sm:items-center sm:gap-3 lg:px-4"
      aria-label={t("explorer.regions.label")}
    >
      {/* First row on phones: the kind (and the grade for basins). */}
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        <Select.Root value={props.regions} onValueChange={(v) => props.onRegions(v as RegionKind)}>
          <Select.Trigger
            className="inline-flex h-10 min-w-0 grow items-center justify-between gap-3 rounded-sm border border-ink-subtle bg-surface px-3 text-left text-sm text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:w-60 sm:shrink-0 sm:grow-0 xl:w-72"
            aria-labelledby="regions-label regions-value"
          >
            <span className="grid min-w-0">
              <span id="regions-label" className="text-2xs text-ink-subtle">
                {t("explorer.regions.label")}
              </span>
              <span id="regions-value" className="truncate font-medium">
                <Select.Value />
              </span>
            </span>
            <span className="flex items-center gap-2 text-2xs whitespace-nowrap text-ink-subtle">
              <span className="hidden xl:inline">{count(props.regions)}</span>
              <Select.Icon>
                <ChevronDown size={iconSize.sm} aria-hidden="true" />
              </Select.Icon>
            </span>
          </Select.Trigger>
          <Select.Portal>
            <Select.Content
              position="popper"
              sideOffset={4}
              className="z-(--ia-layer-popover) w-(--radix-select-trigger-width) min-w-60 overflow-hidden rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
            >
              <Select.Viewport>
                {regionKinds.map((kind) => (
                  <Select.Item
                    key={kind}
                    value={kind}
                    className="relative flex cursor-pointer items-center justify-between gap-3 rounded-sm py-2 pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-action-soft"
                  >
                    <Select.ItemIndicator className="absolute left-2 inline-flex">
                      <Check size={iconSize.sm} aria-hidden="true" />
                    </Select.ItemIndicator>
                    <Select.ItemText>{t(`explorer.regions.${kind}`)}</Select.ItemText>
                    <span className="text-2xs text-ink-subtle">{kind === "cuencas" ? null : count(kind)}</span>
                  </Select.Item>
                ))}
              </Select.Viewport>
            </Select.Content>
          </Select.Portal>
        </Select.Root>

        {props.regions === "cuencas" && (
          <div
            role="radiogroup"
            aria-labelledby="basin-grade-label"
            aria-describedby="basin-grade-hint"
            className="flex shrink-0 items-center gap-2"
          >
            <span id="basin-grade-label" className="sr-only text-2xs whitespace-nowrap text-ink-subtle xl:not-sr-only">
              {t("explorer.regions.grade")}
            </span>
            <span id="basin-grade-hint" className="sr-only">
              {t("explorer.regions.gradeHint")}
            </span>
            <div className="flex gap-1">
              {basinGrades.map((grade) => (
                <label
                  key={grade}
                  title={t("explorer.regions.gradeOption", { grade })}
                  className={cn(
                    "relative inline-flex size-8 cursor-pointer items-center justify-center rounded-sm border text-xs has-focus-visible:outline-2 has-focus-visible:outline-focus sm:size-9",
                    props.grade === grade ? pressed : "border-ink-subtle text-ink-muted hover:text-ink",
                  )}
                >
                  <input
                    type="radio"
                    name="basin-grade"
                    className="sr-only"
                    checked={props.grade === grade}
                    onChange={() => props.onGrade(grade)}
                    aria-label={t("explorer.regions.gradeOption", { grade })}
                  />
                  {grade}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Second row on phones: the search, or the reader's own zones. */}
      <div className="flex min-w-0 items-center gap-2 sm:contents">
        {props.regions !== "mine" ? (
          <div className="min-w-0 grow sm:max-w-md">
            <SearchBox manifest={props.manifest} scope={props.regions} onPick={props.onSearch} />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={() => file.current?.click()}
              className={cn(control, quiet, "w-10 xl:w-auto xl:px-3")}
              aria-label={uploadLabel}
              title={uploadLabel}
              aria-describedby="upload-hint"
            >
              <Upload size={iconSize.sm} aria-hidden="true" />
              <span className="hidden xl:inline">{uploadLabel}</span>
            </button>
            <span id="upload-hint" className="sr-only">
              {t("explorer.regions.uploadHint")}
            </span>
            <button
              type="button"
              onClick={() => props.onDraw(!props.drawing)}
              aria-pressed={props.drawing}
              className={cn(control, props.drawing ? pressed : quiet, "w-10 xl:w-auto xl:px-3")}
              aria-label={drawLabel}
              title={drawLabel}
            >
              <PenLine size={iconSize.sm} aria-hidden="true" />
              <span className="hidden xl:inline">{drawLabel}</span>
            </button>
            <input
              ref={file}
              type="file"
              accept={zoneFileTypes}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(e) => {
                const chosen = e.currentTarget.files?.[0];
                if (chosen) props.onUpload(chosen);
                e.currentTarget.value = "";
              }}
            />
            {/* The loaded files scroll sideways rather than growing the bar. */}
            <ul className="flex min-w-0 grow gap-2 overflow-x-auto">
              {props.layers.map((layer) => (
                <li
                  key={layer.key}
                  className="inline-flex h-9 max-w-64 shrink-0 items-center gap-2 rounded-pill border border-line pr-1 pl-3 text-xs"
                >
                  <span className="min-w-0 truncate text-ink">
                    {layer.source === "saved"
                      ? t("explorer.regions.saved")
                      : layer.source === "drawn"
                        ? t("explorer.regions.drawn")
                        : t("explorer.regions.file", { name: layer.name })}
                  </span>
                  <span className="text-2xs text-ink-subtle">{i18n.number(layer.zones.length)}</span>
                  {layer.source !== "saved" && (
                    <>
                      <button
                        type="button"
                        onClick={() => props.onSave(layer.key)}
                        disabled={props.saving !== null}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-action-soft hover:text-ink disabled:opacity-50"
                        aria-label={
                          props.saving === layer.key ? t("explorer.regions.saving") : t("explorer.regions.save")
                        }
                        title={props.saving === layer.key ? t("explorer.regions.saving") : t("explorer.regions.save")}
                      >
                        <CloudUpload size={iconSize.sm} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => props.onRemove(layer.key)}
                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-pill text-ink-muted hover:bg-action-soft hover:text-ink"
                        aria-label={t("explorer.regions.remove", { name: layer.name })}
                      >
                        <Trash2 size={iconSize.sm} aria-hidden="true" />
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <Popover.Root>
              <Popover.Trigger
                className={cn(control, "w-10 border-transparent text-ink-muted hover:bg-action-soft hover:text-ink")}
                aria-label={t("explorer.regions.aboutMine")}
                title={t("explorer.regions.aboutMine")}
              >
                <Info size={iconSize.sm} aria-hidden="true" />
              </Popover.Trigger>
              <Popover.Portal>
                <Popover.Content
                  align="end"
                  sideOffset={6}
                  collisionPadding={12}
                  className="z-(--ia-layer-popover) grid w-(--ia-layout-panel) gap-2 rounded-md border border-line bg-surface p-4 text-sm text-ink-muted shadow-overlay"
                >
                  <p>{t("explorer.regions.uploadHint")}</p>
                  <p>
                    {t("explorer.regions.sessionNote")}{" "}
                    {!props.signedIn && (
                      <a
                        href={props.signInHref}
                        className="text-link underline underline-offset-(--ia-link-underline-offset)"
                      >
                        {t("explorer.regions.mineSignInLink")}
                      </a>
                    )}
                  </p>
                </Popover.Content>
              </Popover.Portal>
            </Popover.Root>
          </>
        )}
      </div>
    </section>
  );
}
