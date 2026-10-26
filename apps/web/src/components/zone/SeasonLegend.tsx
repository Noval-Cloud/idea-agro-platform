import { Select } from "radix-ui";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";

export type Compared = { year: number; color: string };

const chip =
  "inline-flex h-8 items-center gap-2 rounded-pill border px-3 text-xs whitespace-nowrap transition-colors duration-(--ia-motion-fast)";

/**
 * The productive year chart's legend, which is also how it is read: the chosen year (pick another), the mean and
 * the range of the complete years (shown or hidden), and up to two more years to compare (added or removed).
 */
export default function SeasonLegend({
  text,
  years,
  yearName,
  chosen,
  chosenColor,
  onChoose,
  compared,
  limit,
  onCompare,
  onUncompare,
  mean,
  onMean,
  range,
  onRange,
}: {
  text: {
    year: string;
    mean: string;
    range: string;
    compare: string;
    remove: (year: string) => string;
    full: string;
  };
  /** Every productive year with data, newest first. */
  years: number[];
  yearName: (year: number) => string;
  chosen: number;
  chosenColor: string;
  onChoose: (year: number) => void;
  compared: Compared[];
  limit: number;
  onCompare: (year: number) => void;
  onUncompare: (year: number) => void;
  mean: boolean;
  onMean: (shown: boolean) => void;
  range: boolean;
  onRange: (shown: boolean) => void;
}) {
  const free = years.filter((y) => y !== chosen && !compared.some((c) => c.year === y));
  const toggle = (label: string, shown: boolean, onShown: (shown: boolean) => void, key: "line" | "band") => (
    <button
      type="button"
      aria-pressed={shown}
      onClick={() => onShown(!shown)}
      className={cn(
        chip,
        shown
          ? "border-line text-ink hover:border-ink-subtle"
          : "border-dashed border-line text-ink-subtle hover:text-ink",
      )}
    >
      <span
        className={cn(key === "line" ? "chart-key" : "chart-swatch opacity-40", !shown && "opacity-30")}
        style={{ ["--series-color" as string]: "var(--ia-viz-series-reference)" }}
      />
      {label}
    </button>
  );

  return (
    <TooltipProvider delayDuration={300}>
      <ul className="mb-4 flex flex-wrap items-center gap-2" aria-label={text.year}>
        <li>
          <Select.Root value={String(chosen)} onValueChange={(value) => onChoose(Number(value))}>
            <Select.Trigger
              aria-label={text.year}
              className={cn(chip, "border-ink-subtle font-medium text-ink hover:bg-action-soft")}
            >
              <span className="chart-key" style={{ ["--series-color" as string]: chosenColor }} />
              <Select.Value />
              <ChevronDown size={iconSize.xs} aria-hidden="true" className="text-ink-subtle" />
            </Select.Trigger>
            <Select.Portal>
              <Select.Content
                position="popper"
                sideOffset={4}
                className="ia-pop z-(--ia-layer-popover) max-h-80 min-w-48 overflow-y-auto rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
              >
                <Select.Viewport>
                  {years.map((y) => (
                    <Select.Item
                      key={y}
                      value={String(y)}
                      className="relative flex h-8 cursor-pointer items-center rounded-sm pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-action-soft"
                    >
                      <Select.ItemIndicator className="absolute left-2 inline-flex">
                        <Check size={iconSize.sm} aria-hidden="true" />
                      </Select.ItemIndicator>
                      <Select.ItemText>{yearName(y)}</Select.ItemText>
                    </Select.Item>
                  ))}
                </Select.Viewport>
              </Select.Content>
            </Select.Portal>
          </Select.Root>
        </li>
        <li>{toggle(text.mean, mean, onMean, "line")}</li>
        <li>{toggle(text.range, range, onRange, "band")}</li>
        {compared.map((c) => (
          <li key={c.year}>
            <span className={cn(chip, "border-line pr-1 text-ink")}>
              <span className="chart-key" style={{ ["--series-color" as string]: c.color }} />
              {yearName(c.year)}
              <button
                type="button"
                aria-label={text.remove(yearName(c.year))}
                onClick={() => onUncompare(c.year)}
                className="inline-flex size-6 items-center justify-center rounded-pill text-ink-subtle hover:bg-action-soft hover:text-ink"
              >
                <X size={iconSize.xs} aria-hidden="true" />
              </button>
            </span>
          </li>
        ))}
        <li>
          {compared.length >= limit ? (
            <Tooltip label={text.full}>
              <span tabIndex={0} className={cn(chip, "border-dashed border-line text-ink-subtle")}>
                <Plus size={iconSize.xs} aria-hidden="true" />
                {text.compare}
              </span>
            </Tooltip>
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  chip,
                  "border-dashed border-ink-subtle text-ink-muted hover:bg-action-soft hover:text-ink",
                )}
              >
                <Plus size={iconSize.xs} aria-hidden="true" />
                {text.compare}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="max-h-80 overflow-y-auto">
                {free.map((y) => (
                  <DropdownMenuItem key={y} onSelect={() => onCompare(y)}>
                    {yearName(y)}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </li>
      </ul>
    </TooltipProvider>
  );
}
