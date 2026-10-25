import type { ReactNode } from "react";
import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { basinGrades, type BasinGrade, type Manifest } from "./lib/data";
import { useI18n } from "./lib/i18n";
import type { SearchResult } from "./lib/search";
import { regionKinds, type RegionKind } from "./lib/state";
import SearchBox from "./SearchBox";

interface Props {
  manifest: Manifest | null;
  regions: RegionKind;
  grade: BasinGrade;
  counts: Partial<Record<string, number>>;
  /** How many zones of the reader's own there are. */
  mineCount: number;
  onRegions: (regions: RegionKind) => void;
  onGrade: (grade: BasinGrade) => void;
  onSearch: (result: SearchResult) => void;
  /** The tools for the reader's own zones or projects, shown when those are the regions on the map. */
  tools: ReactNode;
}

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
  const countKey = (kind: RegionKind) =>
    kind === "cuencas" ? `cuencas-${props.grade}` : kind === "mine" || kind === "projects" ? null : kind;
  const count = (kind: RegionKind) => {
    const key = countKey(kind);
    const n = kind === "mine" ? props.mineCount : key ? props.counts[key] : undefined;
    return n === undefined || kind === "none" ? null : t("explorer.regions.count", { count: n, value: i18n.number(n) });
  };

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
        {props.regions === "mine" || props.regions === "projects" ? (
          props.tools
        ) : (
          <div className="min-w-0 grow sm:max-w-md">
            <SearchBox manifest={props.manifest} scope={props.regions} onPick={props.onSearch} />
          </div>
        )}
      </div>
    </section>
  );
}
