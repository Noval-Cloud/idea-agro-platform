import { useState } from "react";
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
import { chooseSort, naturallyDescending, type Sort, type SortKind, type SortOption } from "./sort";

export * from "./sort";

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
  // Said once the arrow turns, since the item keeps focus and a changed label alone may go unheard.
  const [turned, setTurned] = useState("");
  return (
    <DropdownMenu onOpenChange={() => setTurned("")}>
      <DropdownMenuTrigger
        aria-label={`${t("lists.sort")}: ${current.label}, ${direction(current.kind, sort.descending)}`}
        className="inline-flex h-9 items-center gap-1.5 rounded-sm px-2.5 text-sm text-ink-muted hover:bg-action-soft hover:text-ink data-[state=open]:bg-action-soft"
      >
        <span className="max-w-32 truncate sm:max-w-none">{current.label}</span>
        <Arrow size={iconSize.sm} aria-hidden="true" className="shrink-0" />
      </DropdownMenuTrigger>
      <span aria-live="polite" className="sr-only">
        {turned}
      </span>
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
                  const next = chooseSort(sort, option.key, descending);
                  // The menu stays open while the arrow turns, so the change shows where it was made.
                  if (active) {
                    event.preventDefault();
                    setTurned(direction(option.kind, next.descending));
                  }
                  onSort(next);
                }}
              >
                <span className="grow">{option.label}</span>
                <Shown aria-hidden="true" className={active ? "text-ink!" : "opacity-50"} />
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
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
        onClick={() => onSort(chooseSort(sort, column, natural))}
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
