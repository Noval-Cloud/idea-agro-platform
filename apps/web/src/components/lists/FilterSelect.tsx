import { Select } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";

/** One value out of many, as a filter: "all" first, then the values the list holds. */
export function FilterSelect({
  label,
  value,
  all,
  options,
  labelOf = (option) => option,
  onChange,
}: {
  label: string;
  value: string;
  all: string;
  options: string[];
  /** The words for an option, when its value is a code. */
  labelOf?: (option: string) => string;
  onChange: (value: string) => void;
}) {
  return (
    <Select.Root value={value} onValueChange={onChange}>
      <Select.Trigger
        aria-label={label}
        className={cn(
          "inline-flex h-9 max-w-56 min-w-0 items-center gap-2 rounded-sm border px-3 text-sm whitespace-nowrap hover:border-ink-subtle data-[state=open]:border-ink-subtle",
          value === "all" ? "border-input text-ink-muted" : "border-ink-subtle bg-action-soft text-ink",
        )}
      >
        <span className="truncate">
          <Select.Value />
        </span>
        <ChevronDown size={iconSize.sm} aria-hidden="true" className="shrink-0 text-ink-subtle" />
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          sideOffset={4}
          className="ia-pop z-(--ia-layer-popover) max-h-80 min-w-(--radix-select-trigger-width) overflow-y-auto rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
        >
          <Select.Viewport>
            {[{ value: "all", label: all }, ...options.map((o) => ({ value: o, label: labelOf(o) }))].map((option) => (
              <Select.Item
                key={option.value}
                value={option.value}
                className="relative flex h-9 cursor-pointer items-center rounded-sm pr-3 pl-8 text-sm outline-none select-none data-highlighted:bg-action-soft"
              >
                <Select.ItemIndicator className="absolute left-2 inline-flex">
                  <Check size={iconSize.sm} aria-hidden="true" />
                </Select.ItemIndicator>
                <Select.ItemText>{option.label}</Select.ItemText>
              </Select.Item>
            ))}
          </Select.Viewport>
        </Select.Content>
      </Select.Portal>
    </Select.Root>
  );
}
