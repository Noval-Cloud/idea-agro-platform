import { ArrowRight, Trash2, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { useI18n } from "./lib/i18n";

export type ZoneSummary = {
  key: string;
  kind: string;
  title: string;
  subtitle?: string;
  area: string;
  /** A point's place, shown instead of its area. */
  coordinates?: { latitude: string; longitude: string };
  value:
    | { state: "value"; label: string; text: string; delta?: string; approximate: boolean }
    | { state: "none"; label: string }
    | { state: "loading"; label: string }
    | null;
  href: string;
  /** For the reader's own zones: asks to delete it. */
  onDelete?: () => void;
};

interface Props {
  zone: ZoneSummary;
  onClose: () => void;
  variant: "popup" | "sheet";
}

/** What a region is, how big, the background indicator's value there, and the way into its indicators. */
export default function ZoneCard({ zone, onClose, variant }: Props) {
  const { t } = useI18n();
  return (
    <article
      className={
        variant === "popup"
          ? "w-72 rounded-md border border-line bg-surface p-4 text-ink shadow-overlay"
          : "rounded-t-lg border-t border-line bg-surface p-5 text-ink shadow-overlay"
      }
      aria-label={zone.title}
    >
      <header className="flex items-start gap-3">
        <div className="min-w-0 grow">
          <p className="text-2xs font-medium text-ink-subtle">{zone.kind}</p>
          <h2 className="mt-1 font-display text-lg leading-tight text-ink">{zone.title}</h2>
          {zone.subtitle && <p className="mt-0.5 truncate text-sm text-ink-muted">{zone.subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="-mt-1 -mr-1 inline-flex size-8 shrink-0 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink"
          aria-label={t("explorer.zone.close")}
        >
          <X size={iconSize.sm} aria-hidden="true" />
        </button>
      </header>

      <dl className="mt-4 grid gap-3 border-t border-line pt-3 text-sm">
        {zone.coordinates ? (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">{t("explorer.zone.latitude")}</dt>
              <dd className="font-medium text-ink tabular-nums">{zone.coordinates.latitude}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-muted">{t("explorer.zone.longitude")}</dt>
              <dd className="font-medium text-ink tabular-nums">{zone.coordinates.longitude}</dd>
            </div>
          </>
        ) : (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-ink-muted">{t("explorer.zone.area")}</dt>
            <dd className="font-medium text-ink">{zone.area}</dd>
          </div>
        )}
        {zone.value && (
          <div>
            <dt className="text-ink-muted">{zone.value.label}</dt>
            <dd className="mt-0.5">
              {zone.value.state === "value" ? (
                <>
                  <span className="font-medium text-ink">{zone.value.text}</span>
                  {zone.value.delta && <span className="block text-xs text-ink-muted">{zone.value.delta}</span>}
                  {zone.value.approximate && (
                    <span className="block text-xs text-ink-subtle">{t("explorer.zone.approximate")}</span>
                  )}
                </>
              ) : zone.value.state === "loading" ? (
                <span className="block h-5 w-32 animate-pulse rounded-xs bg-surface-muted" />
              ) : (
                <span className="text-ink-subtle">{t("explorer.zone.noValue")}</span>
              )}
            </dd>
          </div>
        )}
      </dl>

      <div className="mt-4 flex gap-2">
        <a
          href={zone.href}
          className="inline-flex h-10 grow items-center justify-center gap-2 rounded-sm bg-action px-4 text-sm font-medium text-action-ink transition-colors duration-(--ia-motion-fast) hover:bg-action-hover"
        >
          {t("explorer.zone.open")}
          <ArrowRight size={iconSize.sm} aria-hidden="true" />
        </a>
        {zone.onDelete && (
          <button
            type="button"
            onClick={zone.onDelete}
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-sm border border-ink-subtle text-ink-muted hover:bg-action-soft hover:text-ink"
            aria-label={t("explorer.mine.delete")}
            title={t("explorer.mine.delete")}
          >
            <Trash2 size={iconSize.sm} aria-hidden="true" />
          </button>
        )}
      </div>
    </article>
  );
}
