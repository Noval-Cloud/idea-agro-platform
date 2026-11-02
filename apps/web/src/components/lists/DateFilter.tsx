import { useId } from "react";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { datePresets, type DateValue } from "./dates";
import type { ListsT } from "./i18n";
import { filterTrigger } from "./MultiFilter";

/** What a date filter covers, in words, for its chip. */
export function dateLabel(t: ListsT, value: DateValue, formatDay: (day: string) => string) {
  if ("preset" in value) return t(`lists.dates.${value.preset}`);
  if (value.from && value.to) return t("lists.dates.between", { from: formatDay(value.from), to: formatDay(value.to) });
  return value.from
    ? t("lists.dates.since", { day: formatDay(value.from) })
    : t("lists.dates.until", { day: formatDay(value.to) });
}

/** A stretch up to now, chosen in one tap, or a range of days between two dates. */
export function DateFilter({
  t,
  value,
  onChange,
}: {
  t: ListsT;
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
}) {
  const id = useId();
  const range = value && "from" in value ? value : null;
  const pick = (from: string, to: string) => onChange(from || to ? { from, to } : null);
  const option = (active: boolean) =>
    cn(
      "h-9 rounded-sm border px-3 text-sm transition-colors duration-(--ia-motion-fast)",
      active ? "border-action bg-action text-action-ink" : "border-input text-ink hover:bg-action-soft",
    );

  return (
    <Popover>
      <PopoverTrigger className={filterTrigger(value !== null)}>
        <span className="truncate">{t("lists.dates.label")}</span>
        <ChevronDown size={iconSize.sm} aria-hidden="true" className="shrink-0 text-ink-subtle" />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={t("lists.dates.label")} className="grid w-80 gap-4">
        <div role="group" aria-label={t("lists.dates.label")} className="flex flex-wrap gap-2">
          {datePresets.map((preset) => {
            const active = value !== null && "preset" in value && value.preset === preset;
            return (
              <button
                key={preset}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(active ? null : { preset })}
                className={option(active)}
              >
                {t(`lists.dates.${preset}`)}
              </button>
            );
          })}
        </div>
        <fieldset className="grid gap-2">
          <legend className="pb-2 text-xs font-medium text-ink-subtle">{t("lists.dates.range")}</legend>
          <div className="grid grid-cols-2 gap-2">
            {(["from", "to"] as const).map((side) => (
              <label key={side} htmlFor={`${id}-${side}`} className="grid gap-1 text-xs text-ink-muted">
                {t(`lists.dates.${side}`)}
                <input
                  id={`${id}-${side}`}
                  type="date"
                  value={range?.[side] ?? ""}
                  min={side === "to" ? range?.from || undefined : undefined}
                  max={side === "from" ? range?.to || undefined : undefined}
                  onChange={(event) =>
                    side === "from"
                      ? pick(event.currentTarget.value, range?.to ?? "")
                      : pick(range?.from ?? "", event.currentTarget.value)
                  }
                  className="h-9 rounded-sm border border-input bg-surface px-2 text-sm text-ink focus-visible:border-focus"
                />
              </label>
            ))}
          </div>
        </fieldset>
        <div className="flex justify-end border-t border-line pt-3">
          <button
            type="button"
            disabled={value === null}
            onClick={() => onChange(null)}
            className="rounded-xs px-1.5 py-1 text-sm text-link hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {t("lists.filters.clear")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
