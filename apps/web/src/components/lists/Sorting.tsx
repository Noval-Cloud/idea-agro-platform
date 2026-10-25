import { Select } from "radix-ui";
import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { ListsT } from "./i18n";

export type Sort<K extends string> = { key: K; descending: boolean };

/** Sorts rows by a key; `natural` says which keys read first-to-last as descending (newest, largest). */
export function sortRows<T, K extends string>(
  rows: T[],
  sort: Sort<K>,
  value: (row: T, key: K) => string | number,
  collator: Intl.Collator,
): T[] {
  return [...rows].sort((a, b) => {
    const x = value(a, sort.key);
    const y = value(b, sort.key);
    const order = typeof x === "string" && typeof y === "string" ? collator.compare(x, y) : Number(x) - Number(y);
    return sort.descending ? -order : order;
  });
}

/** The sort as a menu, for the cards view and small screens; the table's headers sort too. */
export function SortMenu<K extends string>({
  t,
  sort,
  options,
  onSort,
}: {
  t: ListsT;
  sort: Sort<K>;
  options: { key: K; label: string; descending: boolean }[];
  onSort: (sort: Sort<K>) => void;
}) {
  return (
    <Select.Root
      value={sort.key}
      onValueChange={(key) => {
        const option = options.find((o) => o.key === key);
        if (option) onSort({ key: option.key, descending: option.descending });
      }}
    >
      <Select.Trigger
        aria-label={t("lists.sort")}
        className="inline-flex h-9 items-center gap-2 rounded-sm px-2.5 text-sm text-ink-muted hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft"
      >
        <ArrowUpDown size={iconSize.sm} aria-hidden="true" />
        <span className="hidden sm:inline">
          <Select.Value />
        </span>
      </Select.Trigger>
      <Select.Portal>
        <Select.Content
          position="popper"
          align="end"
          sideOffset={4}
          className="ia-pop z-(--ia-layer-popover) min-w-48 rounded-md border border-line bg-surface p-1 text-ink shadow-overlay"
        >
          <Select.Viewport>
            {options.map((option) => (
              <Select.Item
                key={option.key}
                value={option.key}
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

/** A table header that sorts by its column: once by the column's natural order, again to reverse it. */
export function SortHeader<K extends string>({
  label,
  column,
  sort,
  natural,
  onSort,
  className,
}: {
  label: string;
  column: K;
  sort: Sort<K>;
  natural: boolean;
  onSort: (sort: Sort<K>) => void;
  className?: string;
}) {
  const active = sort.key === column;
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.descending ? "descending" : "ascending") : "none"}
      className={cn("px-3 py-0 font-medium", className)}
    >
      <button
        type="button"
        onClick={() => onSort({ key: column, descending: active ? !sort.descending : natural })}
        className={cn(
          "-mx-1.5 inline-flex h-10 items-center gap-1 rounded-xs px-1.5 hover:text-ink",
          active && "text-ink",
        )}
      >
        {label}
        <Arrow size={iconSize.sm - 2} aria-hidden="true" className={active ? "opacity-100" : "opacity-0"} />
      </button>
    </th>
  );
}
