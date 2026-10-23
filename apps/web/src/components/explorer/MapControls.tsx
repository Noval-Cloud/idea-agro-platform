import type { ReactNode } from "react";
import { Popover } from "radix-ui";
import { Layers, LocateFixed, Maximize2, Minimize2, Minus, Plus, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import type { IndicatorId } from "@/data/indicators";
import { cn } from "@/lib/utils";
import { thumbnailUrl } from "./lib/data";
import { useI18n } from "./lib/i18n";
import type { MapThemeName } from "./lib/theme";

const control =
  "inline-flex size-10 items-center justify-center text-ink hover:bg-action-soft focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus";

interface ButtonsProps {
  full: boolean;
  canLocate: boolean;
  onZoom: (delta: 1 | -1) => void;
  onLocate: () => void;
  onFull: (full: boolean) => void;
}

/** Zoom, location and full view: our own buttons, so they share the site's look and labels. */
export function MapButtons({ full, canLocate, onZoom, onLocate, onFull }: ButtonsProps) {
  const { t } = useI18n();
  return (
    <div className="pointer-events-auto flex flex-col gap-2">
      <div className="flex flex-col divide-y divide-line overflow-hidden rounded-md border border-line bg-surface shadow-raised">
        <button type="button" className={control} onClick={() => onZoom(1)} aria-label={t("explorer.controls.zoomIn")}>
          <Plus size={iconSize.md} aria-hidden="true" />
        </button>
        <button
          type="button"
          className={control}
          onClick={() => onZoom(-1)}
          aria-label={t("explorer.controls.zoomOut")}
        >
          <Minus size={iconSize.md} aria-hidden="true" />
        </button>
      </div>
      {canLocate && (
        <button
          type="button"
          className={cn(control, "rounded-md border border-line bg-surface shadow-raised")}
          onClick={onLocate}
          aria-label={t("explorer.controls.locate")}
        >
          <LocateFixed size={iconSize.md} aria-hidden="true" />
        </button>
      )}
      <button
        type="button"
        className={cn(control, "hidden rounded-md border border-line bg-surface shadow-raised lg:inline-flex")}
        onClick={() => onFull(!full)}
        aria-pressed={full}
        aria-label={full ? t("explorer.controls.exitFullView") : t("explorer.controls.fullView")}
        title={full ? t("explorer.controls.exitFullView") : t("explorer.controls.fullView")}
      >
        {full ? (
          <Minimize2 size={iconSize.md} aria-hidden="true" />
        ) : (
          <Maximize2 size={iconSize.md} aria-hidden="true" />
        )}
      </button>
    </div>
  );
}

interface LayersProps {
  indicator: IndicatorId | "none";
  theme: MapThemeName;
  open: boolean;
  onOpen: (open: boolean) => void;
  children: ReactNode;
}

/** The layers button of the full view (and of small screens): Google Maps style, with the current layer's thumbnail. */
export function LayersMenu({ indicator, theme, open, onOpen, children }: LayersProps) {
  const { t } = useI18n();
  return (
    <Popover.Root open={open} onOpenChange={onOpen}>
      <Popover.Trigger
        className="pointer-events-auto group relative inline-flex size-16 shrink-0 flex-col items-center justify-end overflow-hidden rounded-md border-2 border-surface bg-surface-muted shadow-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        aria-label={t("explorer.controls.layers")}
      >
        {indicator !== "none" && (
          <img src={thumbnailUrl(indicator, theme)} alt="" className="absolute inset-0 size-full object-cover" />
        )}
        <span className="relative flex w-full items-center justify-center gap-1 bg-surface py-0.5 text-2xs font-medium text-ink">
          <Layers size={iconSize.sm} aria-hidden="true" />
          {t("explorer.controls.layers")}
        </span>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-(--ia-layer-popover) max-h-(--radix-popover-content-available-height) w-(--ia-layout-panel) overflow-y-auto rounded-md border border-line bg-surface p-4 text-ink shadow-overlay"
        >
          <div className="mb-3 flex items-center justify-between">
            <p className="text-sm font-semibold">{t("explorer.controls.layers")}</p>
            <Popover.Close
              className="inline-flex size-8 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft"
              aria-label={t("explorer.controls.closeLayers")}
            >
              <X size={iconSize.sm} aria-hidden="true" />
            </Popover.Close>
          </div>
          <div className="grid gap-5">{children}</div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
