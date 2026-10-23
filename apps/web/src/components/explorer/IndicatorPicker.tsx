import { indicators, indicatorsByGroup, type IndicatorGroup, type IndicatorId } from "@/data/indicators";
import { familyBackground } from "@/design/family-classes";
import { cn } from "@/lib/utils";
import { thumbnailUrl } from "./lib/data";
import { useI18n, type AppKey } from "./lib/i18n";
import type { MapThemeName } from "./lib/theme";

interface Props {
  value: IndicatorId | "none";
  onChange: (value: IndicatorId | "none") => void;
  /** "list" for the side panel, "tiles" (map thumbnails) for the layers menu. */
  variant: "list" | "tiles";
  theme: MapThemeName;
  name: string;
}

const groups: IndicatorGroup[] = ["structure", "environment"];

/** Choose the indicator painted under the regions. */
export default function IndicatorPicker({ value, onChange, variant, theme, name }: Props) {
  const { t } = useI18n();
  const label = (id: IndicatorId, field: "name" | "short") => t(`indicators.items.${id}.${field}` as AppKey);

  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-xs font-medium text-ink-subtle">{t("explorer.indicator.label")}</legend>
      {groups.map((group) => (
        <div key={group} className="mb-4 last:mb-0">
          <p className="mb-1.5 text-2xs text-ink-subtle">{t(`explorer.groups.${group}`)}</p>
          <div className={variant === "tiles" ? "grid grid-cols-3 gap-2" : "grid gap-0.5"}>
            {indicatorsByGroup(group).map((id) => {
              const checked = value === id;
              const input = (
                <input
                  type="radio"
                  name={name}
                  value={id}
                  checked={checked}
                  onChange={() => onChange(id)}
                  className="sr-only"
                />
              );
              return variant === "tiles" ? (
                <label
                  key={id}
                  className="group relative grid cursor-pointer gap-1 rounded-sm p-1 text-center has-focus-visible:outline-2 has-focus-visible:outline-focus"
                >
                  {input}
                  <img
                    src={thumbnailUrl(id, theme)}
                    alt=""
                    width={160}
                    height={120}
                    loading="lazy"
                    className={cn(
                      "aspect-4/3 w-full rounded-xs border object-cover",
                      checked ? "border-action outline-2 outline-action" : "border-line group-hover:border-line-strong",
                    )}
                  />
                  <span className={cn("truncate text-2xs", checked ? "font-medium text-ink" : "text-ink-muted")}>
                    {label(id, "short")}
                  </span>
                </label>
              ) : (
                <label
                  key={id}
                  className={cn(
                    "relative flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 text-sm transition-colors duration-(--ia-motion-fast) has-focus-visible:outline-2 has-focus-visible:outline-focus",
                    checked
                      ? "border-ink-subtle bg-surface-sunken text-ink"
                      : "border-transparent text-ink-muted hover:bg-action-soft hover:text-ink",
                  )}
                >
                  {input}
                  <span
                    className={cn("size-2.5 shrink-0 rounded-xs", familyBackground[indicators[id].family])}
                    aria-hidden="true"
                  />
                  <span className="grow">{label(id, "name")}</span>
                  <span className="text-2xs text-ink-subtle">{label(id, "short")}</span>
                </label>
              );
            })}
          </div>
        </div>
      ))}
      <label
        className={cn(
          "relative mt-2 flex cursor-pointer items-center gap-3 rounded-sm border px-3 py-2 text-sm has-focus-visible:outline-2 has-focus-visible:outline-focus",
          value === "none"
            ? "border-ink-subtle bg-surface-sunken text-ink"
            : "border-transparent text-ink-muted hover:bg-action-soft hover:text-ink",
        )}
      >
        <input
          type="radio"
          name={name}
          value="none"
          checked={value === "none"}
          onChange={() => onChange("none")}
          className="sr-only"
        />
        <span className="size-2.5 shrink-0 rounded-xs border border-ink-subtle" aria-hidden="true" />
        <span className="grow">{t("explorer.indicator.none")}</span>
      </label>
    </fieldset>
  );
}
