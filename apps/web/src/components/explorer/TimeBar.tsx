import { ChevronLeft, ChevronRight, Pause, Play } from "lucide-react";
import { Slider } from "radix-ui";
import { iconSize } from "@/design/tokens";
import { indicators, type IndicatorId } from "@/data/indicators";
import { familyBackground } from "@/design/family-classes";
import type { IndicatorManifest } from "./lib/data";
import { useI18n, type AppKey } from "./lib/i18n";
import { cn } from "@/lib/utils";

interface Props {
  indicator: IndicatorId;
  manifest: IndicatorManifest;
  year: number | null;
  playing: boolean;
  community: number;
  compact: boolean;
  onYear: (year: number) => void;
  onPlay: (playing: boolean) => void;
  onCommunity: (community: number) => void;
}

const iconButton =
  "inline-flex size-9 shrink-0 items-center justify-center rounded-sm text-ink hover:bg-action-soft disabled:opacity-40";

/** The order (I–VI) of each community class in the source raster. */
const communityClasses = [4, 5, 2, 3, 1] as const;

/** "No data" in the legend: where the raster is empty, the basemap shows through. */
const NoData = ({ label }: { label: string }) => (
  <span className="flex items-center gap-1.5 text-2xs whitespace-nowrap text-ink-subtle">
    <span className="size-2.5 rounded-xs border border-ink-subtle bg-canvas" aria-hidden="true" />
    {label}
  </span>
);

/** Time control and legend of the background indicator, floating over the map. */
export default function TimeBar(props: Props) {
  const i18n = useI18n();
  const { t } = i18n;
  const { indicator, manifest, year, playing, compact } = props;
  const years = manifest.years;
  const family = indicators[indicator].family;
  const index = years && year !== null ? years.indexOf(year) : -1;
  const unit = t(`indicators.items.${indicator}.unit` as AppKey);

  const legend =
    manifest.kind === "continuous" ? (
      <div className="min-w-0 grow sm:max-w-72">
        <div
          className="h-2.5 rounded-xs"
          style={{
            backgroundImage: `linear-gradient(to right, ${Array.from({ length: 7 }, (_, i) => `var(--ia-viz-${family}-${i + 1})`).join(", ")})`,
          }}
          aria-hidden="true"
        />
        {/* The scale is fixed across years and clips the extremes: the ends read "at most" and "at least". */}
        <div className="mt-1 flex items-baseline justify-between gap-2 text-2xs text-ink-muted">
          <span>≤ {i18n.value(indicator, manifest.min ?? 0)}</span>
          <span className="truncate text-ink-subtle">{unit}</span>
          <span>≥ {i18n.value(indicator, manifest.max ?? 0)}</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <NoData label={t("explorer.legend.noData")} />
          <span className="text-2xs text-ink-subtle">{t("explorer.legend.resolution")}</span>
        </div>
      </div>
    ) : manifest.kind === "binary" ? (
      <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
        <li className="flex items-center gap-2">
          <span className={cn("size-3 rounded-xs", familyBackground[family])} aria-hidden="true" />
          {t("explorer.legend.grassland")}
        </li>
        <li className="flex items-center gap-2">
          <span className="size-3 rounded-xs bg-ink-subtle" aria-hidden="true" />
          {t("explorer.legend.otherUses")}
        </li>
        <li>
          <NoData label={t("explorer.legend.noData")} />
        </li>
      </ul>
    ) : (
      <fieldset className="min-w-0">
        <legend className="mb-1 text-2xs text-ink-subtle">{t("explorer.legend.communityPick")}</legend>
        <div className="flex flex-wrap items-center gap-1">
          {communityClasses.map((cls) => (
            <label
              key={cls}
              title={t(`communities.${cls}.name` as AppKey)}
              className="relative inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-pill border border-ink-subtle px-3 text-xs text-ink-muted has-checked:border-ink has-checked:bg-action-soft has-checked:text-ink has-focus-visible:outline-2 has-focus-visible:outline-focus"
            >
              <input
                type="radio"
                name="community"
                className="sr-only"
                checked={props.community === cls}
                onChange={() => props.onCommunity(cls)}
                aria-label={`${t("communities.label", { order: t(`communities.${cls}.order` as AppKey) })}: ${t(`communities.${cls}.name` as AppKey)}`}
              />
              <span
                className={cn(
                  "size-2 rounded-xs",
                  props.community === cls ? familyBackground[family] : "bg-ink-subtle",
                )}
                aria-hidden="true"
              />
              {t(`communities.${cls}.order` as AppKey)}
            </label>
          ))}
        </div>
        <p className="mt-1 text-2xs text-ink-subtle">{t("communities.missing" as AppKey)}</p>
      </fieldset>
    );

  const slider = years && index >= 0 && (
    <Slider.Root
      className={cn("relative flex h-9 min-w-0 grow touch-none items-center select-none", !compact && "ml-2 min-w-24")}
      min={0}
      max={years.length - 1}
      step={1}
      value={[index]}
      onValueChange={([i]) => props.onYear(years[i])}
      aria-label={t("explorer.time.label")}
    >
      <Slider.Track className="relative h-1 grow rounded-pill bg-ink-subtle">
        <Slider.Range className="absolute h-full rounded-pill bg-ink" />
      </Slider.Track>
      <Slider.Thumb
        className="block size-4 rounded-pill border-2 border-surface bg-action shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label={t("explorer.time.label")}
        aria-valuetext={i18n.yearLabel(indicator, years[index])}
      />
    </Slider.Root>
  );

  return (
    <section
      className="pointer-events-auto min-w-0 rounded-md border border-line bg-surface p-3 shadow-raised"
      aria-label={t("explorer.time.label")}
    >
      <p className={cn("mb-2 text-xs text-ink-muted", compact ? "line-clamp-2" : "truncate")}>
        <span className="font-medium text-ink">{t(`indicators.items.${indicator}.name` as AppKey)}</span>
        {" · "}
        {t(`explorer.mapShows.${indicator}` as AppKey, { year: year !== null ? i18n.yearLabel(indicator, year) : "" })}
      </p>
      <div className={cn("flex min-w-0 gap-3", compact ? "flex-col" : "flex-col sm:flex-row sm:items-center")}>
        {years && index >= 0 ? (
          <div className="flex min-w-0 grow items-center gap-1">
            <button
              type="button"
              className={iconButton}
              onClick={() => props.onPlay(!playing)}
              aria-label={playing ? t("explorer.time.pause") : t("explorer.time.play")}
              aria-pressed={playing}
            >
              {playing ? (
                <Pause size={iconSize.sm} aria-hidden="true" />
              ) : (
                <Play size={iconSize.sm} aria-hidden="true" />
              )}
            </button>
            {!compact && (
              <button
                type="button"
                className={iconButton}
                onClick={() => props.onYear(years[index - 1])}
                disabled={index <= 0}
                aria-label={t("explorer.time.previous")}
              >
                <ChevronLeft size={iconSize.sm} aria-hidden="true" />
              </button>
            )}
            <output
              className="w-20 shrink-0 text-center font-display text-lg leading-none whitespace-nowrap text-ink"
              aria-live={playing ? "off" : "polite"}
            >
              {i18n.yearLabel(indicator, years[index])}
            </output>
            {!compact && (
              <button
                type="button"
                className={iconButton}
                onClick={() => props.onYear(years[index + 1])}
                disabled={index >= years.length - 1}
                aria-label={t("explorer.time.next")}
              >
                <ChevronRight size={iconSize.sm} aria-hidden="true" />
              </button>
            )}
            {slider}
          </div>
        ) : (
          <p className="grow text-xs text-ink-muted">
            {t("explorer.time.period", { period: t(`indicators.items.${indicator}.period` as AppKey) })}
          </p>
        )}
        {legend}
      </div>
    </section>
  );
}
