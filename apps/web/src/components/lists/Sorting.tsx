import { ArrowDown, ArrowUp, ArrowUpDown, Check } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  const current = options.find((o) => o.key === sort.key);
  // The arrow says the direction, which a table header may have turned around.
  const Arrow = sort.descending ? ArrowDown : ArrowUp;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("lists.sort")}: ${current?.label ?? ""}`}
        className="inline-flex h-9 items-center gap-2 rounded-sm px-2.5 text-sm text-ink-muted hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft"
      >
        <ArrowUpDown size={iconSize.sm} aria-hidden="true" />
        <span className="hidden items-center gap-1 sm:inline-flex">
          {current?.label}
          {current && current.descending !== sort.descending && <Arrow size={iconSize.xs} aria-hidden="true" />}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-48">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.key}
            onSelect={() => onSort({ key: option.key, descending: option.descending })}
          >
            <Check aria-hidden="true" className={option.key === sort.key ? "opacity-100" : "opacity-0"} />
            {option.label}
          </DropdownMenuItem>
        ))}
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
