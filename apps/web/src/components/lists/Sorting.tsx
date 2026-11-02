import { ArrowDown, ArrowUp } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { chooseSort, type Sort } from "./sort";

export * from "./sort";

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
