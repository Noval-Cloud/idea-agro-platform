import { cn } from "@/lib/utils";
import type { Manifest } from "./lib/data";
import { useI18n } from "./lib/i18n";
import { bases, baseTiles, type Base } from "./lib/map-style";

type Outline = Manifest["outline"] | null;

interface Props {
  value: Base;
  onChange: (value: Base) => void;
  /** The country's outline, drawn as the quiet map's thumbnail once the manifest is in. */
  outline: Outline;
  name: string;
  /** Hides the heading where the menu around it already says "Base map". */
  quietLegend?: boolean;
}

/** One tile of each IDE base as its thumbnail: farmland from above, and a town's streets by a river. */
const thumbnails: Record<Exclude<Base, "map">, string> = {
  satellite: tileAt(baseTiles.satellite, 12, 1409, 2436),
  streets: tileAt(baseTiles.streets, 14, 5644, 9713),
};

function tileAt(template: string, z: number, x: number, y: number) {
  return template.replace("{z}", String(z)).replace("{x}", String(x)).replace("{y}", String(y));
}

/** A base's picture: the country on the quiet map's colors, or a tile of IDE's. */
export function BaseThumbnail({ base, outline, className }: { base: Base; outline: Outline; className?: string }) {
  return base === "map" ? (
    <svg
      viewBox={outline ? `0 0 ${outline.width} ${outline.height}` : "0 0 4 3"}
      className={cn("bg-(--ia-map-water)", className)}
      aria-hidden="true"
    >
      {outline && (
        <path
          d={outline.d}
          className="fill-(--ia-map-land) stroke-(--ia-map-boundary)"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  ) : (
    <img
      src={thumbnails[base]}
      alt=""
      width={256}
      height={256}
      loading="lazy"
      className={cn("object-cover", className)}
    />
  );
}

/** Choose what lies under the data, as Google Maps does: the quiet map, the land from above, or the streets. */
export default function BasePicker({ value, onChange, outline, name, quietLegend }: Props) {
  const { t } = useI18n();
  return (
    <fieldset className="min-w-0">
      <legend className={quietLegend ? "sr-only" : "mb-2 text-xs font-medium text-ink-subtle"}>
        {t("explorer.base.label")}
      </legend>
      <div className="grid grid-cols-3 gap-2">
        {bases.map((base) => {
          const checked = value === base;
          return (
            <label
              key={base}
              className="group relative grid cursor-pointer gap-1 rounded-sm p-1 text-center has-focus-visible:outline-2 has-focus-visible:outline-focus"
            >
              <input
                type="radio"
                name={name}
                value={base}
                checked={checked}
                onChange={() => onChange(base)}
                className="sr-only"
              />
              <BaseThumbnail
                base={base}
                outline={outline}
                className={cn(
                  "aspect-4/3 w-full rounded-xs border",
                  checked ? "border-action outline-2 outline-action" : "border-line group-hover:border-line-strong",
                )}
              />
              <span className={cn("truncate text-2xs", checked ? "font-medium text-ink" : "text-ink-muted")}>
                {t(`explorer.base.${base}`)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
