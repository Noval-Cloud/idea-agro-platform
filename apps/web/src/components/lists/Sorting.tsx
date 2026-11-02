import { ArrowDown, ArrowUp } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { ListsT } from "./i18n";

export type Sort<K extends string> = { key: K; descending: boolean };

/** Rows in the sort's order: text by the locale's collation, numbers and times by value. */
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

/** What a sort key holds, which names its two directions and decides the one it starts with. */
export type SortKind = "text" | "date" | "number";
export type SortOption<K extends string> = { key: K; label: string; kind: SortKind };

/** Text starts from A, dates from the newest, numbers from the largest. */
export const naturallyDescending = (kind: SortKind) => kind !== "text";

/**
 * The sort as a menu, in every view: each key on its row with the arrow of its direction. Choosing another key sorts
 * by it in its usual direction; choosing the current one turns it around. A table's headers sort too.
 */
export function SortMenu<K extends string>({
  t,
  sort,
  options,
  onSort,
}: {
  t: ListsT;
  sort: Sort<K>;
  options: SortOption<K>[];
  onSort: (sort: Sort<K>) => void;
}) {
  const current = options.find((o) => o.key === sort.key) ?? options[0];
  // The arrow shows the direction; readers hear it in words.
  const direction = (kind: SortKind, descending: boolean) => t(`lists.order.${kind}.${descending ? "desc" : "asc"}`);
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("lists.sort")}: ${current.label}, ${direction(current.kind, sort.descending)}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink-muted hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft"
      >
        {current.label}
        <Arrow size={iconSize.sm} aria-hidden="true" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        <DropdownMenuRadioGroup value={current.key}>
          {options.map((option) => {
            const active = option.key === current.key;
            const descending = active ? sort.descending : naturallyDescending(option.kind);
            const Shown = descending ? ArrowDown : ArrowUp;
            return (
              <DropdownMenuRadioItem
                key={option.key}
                value={option.key}
                aria-label={`${option.label}, ${direction(option.kind, descending)}`}
                onSelect={(event) => {
                  // The menu stays open while the arrow turns, so the change shows where it was made.
                  if (active) event.preventDefault();
                  onSort({ key: option.key, descending: active ? !sort.descending : descending });
                }}
              >
                <span className="grow">{option.label}</span>
                <Shown
                  aria-hidden="true"
                  className={active ? "text-ink!" : "opacity-0 group-data-highlighted:opacity-100"}
                />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A sort as it goes in the address: the key, after a minus when descending. */
export const encodeSort = <K extends string>(sort: Sort<K>) => `${sort.descending ? "-" : ""}${sort.key}`;

export function decodeSort<K extends string>(value: string, keys: readonly K[], fallback: Sort<K>): Sort<K> {
  const key = value.replace(/^-/, "") as K;
  return keys.includes(key) ? { key, descending: value.startsWith("-") } : fallback;
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
        <Arrow size={iconSize.xs} aria-hidden="true" className={active ? "opacity-100" : "opacity-0"} />
      </button>
    </th>
  );
}
