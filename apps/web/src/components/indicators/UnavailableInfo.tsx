import { Dialog } from "radix-ui";
import { Info, X } from "lucide-react";
import { useI18n, type AppKey } from "@/components/explorer/lib/i18n";
import type { IndicatorId } from "@/data/indicators";
import { iconSize } from "@/design/tokens";
import { markdown } from "@/i18n/markdown";
import { cn } from "@/lib/utils";

/**
 * Beside a hidden indicator, which is not focusable: a button of its own that opens a dialog with its text on why
 * it is unavailable. The pages' twin is `UnavailableInfo.astro`.
 */
export function UnavailableInfo({ indicator, className }: { indicator: IndicatorId; className?: string }) {
  const { t } = useI18n();
  const name = t(`indicators.items.${indicator}.name` as AppKey);
  return (
    <Dialog.Root>
      <Dialog.Trigger
        aria-label={t("indicators.unavailable.info", { name })}
        className={cn(
          "inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted transition-colors duration-(--ia-motion-fast) hover:bg-action-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-focus",
          className,
        )}
      >
        <Info size={iconSize.sm} aria-hidden="true" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-(--ia-layer-modal) bg-scrim/50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 z-(--ia-layer-modal) grid w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 gap-3 rounded-md border border-line bg-surface p-5 text-ink shadow-overlay">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display text-lg">{name}</Dialog.Title>
              <p className="mt-1 text-sm text-ink-subtle">{t("indicators.unavailable.label")}</p>
            </div>
            <Dialog.Close
              className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink"
              aria-label={t("indicators.unavailable.close")}
            >
              <X size={iconSize.sm} aria-hidden="true" />
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div
              className="rich-text text-sm text-ink-muted"
              dangerouslySetInnerHTML={{ __html: markdown(t(`indicators.items.${indicator}.unavailable` as AppKey)) }}
            />
          </Dialog.Description>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
