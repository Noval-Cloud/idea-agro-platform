import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
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

/** The sort as a menu: the key and its direction, in every view; a table's headers sort too. */
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
  const direction = (descending: boolean) => t(`lists.order.${current.kind}.${descending ? "desc" : "asc"}`);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`${t("lists.sort")}: ${current.label}, ${direction(sort.descending)}`}
        className="inline-flex h-9 items-center gap-2 rounded-sm px-2.5 text-sm text-ink-muted hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft"
      >
        <ArrowUpDown size={iconSize.sm} aria-hidden="true" />
        <span className="hidden sm:inline">
          {current.label} · {direction(sort.descending)}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="min-w-56">
        <DropdownMenuLabel>{t("lists.order.by")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={current.key}
          onValueChange={(key) => {
            const option = options.find((o) => o.key === key);
            if (option) onSort({ key: option.key, descending: naturallyDescending(option.kind) });
          }}
        >
          {options.map((option) => (
            <DropdownMenuRadioItem key={option.key} value={option.key}>
              {option.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("lists.order.label")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={sort.descending ? "desc" : "asc"}
          onValueChange={(value) => onSort({ key: current.key, descending: value === "desc" })}
        >
          {/* Each kind's usual direction comes first. */}
          {(naturallyDescending(current.kind) ? [true, false] : [false, true]).map((descending) => (
            <DropdownMenuRadioItem key={String(descending)} value={descending ? "desc" : "asc"}>
              {direction(descending)}
            </DropdownMenuRadioItem>
          ))}
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
