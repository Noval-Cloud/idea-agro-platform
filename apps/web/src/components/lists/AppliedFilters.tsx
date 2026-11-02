import { useEffect, useRef, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { ListsT } from "./i18n";

export type Applied = { key: string; label: string; value: string; onRemove: () => void };

/** Whether a list's filter controls show, kept per list in this browser; hidden at first. */
export function useFiltersShown(list: string): [boolean, (shown: boolean) => void] {
  const key = `ia-filters:${list}`;
  const [shown, setShown] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "shown") setShown(true);
    } catch {
      // Storage can be blocked; the controls start hidden.
    }
  }, [key]);
  const choose = (next: boolean) => {
    setShown(next);
    try {
      localStorage.setItem(key, next ? "shown" : "hidden");
    } catch {
      // Not remembered, but still applied.
    }
  };
  return [shown, choose];
}

/** The toggle's id, for whatever hands focus back to it. */
export const toggleId = (controls: string) => `${controls}-toggle`;

/** Shows or hides the filter controls; the number says how many filters narrow the list. */
export function FiltersToggle({
  t,
  shown,
  active,
  controls,
  onToggle,
}: {
  t: ListsT;
  shown: boolean;
  active: number;
  controls: string;
  onToggle: () => void;
}) {
  return (
    <button
      id={toggleId(controls)}
      type="button"
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
      className={cn(
        "inline-flex h-9 items-center gap-2 rounded-sm border px-3 text-sm transition-colors duration-(--ia-motion-fast)",
        shown ? "border-ink-subtle bg-action-soft text-ink" : "border-input text-ink-muted hover:border-ink-subtle",
      )}
    >
      <SlidersHorizontal size={iconSize.sm} aria-hidden="true" />
      {t("lists.filters.label")}
      {active > 0 && (
        <span className="rounded-pill bg-ink px-1.5 text-2xs leading-4 font-medium text-canvas tabular-nums">
          {active}
        </span>
      )}
    </button>
  );
}

/**
 * The filters that narrow the list, each as a chip that removes it, and one way to remove them all. Focus moves to
 * the next chip, or to `returnFocus` once none is left.
 */
export function AppliedFilters({
  t,
  applied,
  onClear,
  returnFocus,
}: {
  t: ListsT;
  applied: Applied[];
  onClear: () => void;
  returnFocus: string;
}) {
  const list = useRef<HTMLUListElement>(null);
  const then = (index: number, act: () => void) => {
    act();
    requestAnimationFrame(() => {
      const left = list.current?.querySelectorAll<HTMLButtonElement>("button[data-remove]") ?? [];
      (left[Math.min(index, left.length - 1)] ?? document.getElementById(returnFocus))?.focus();
    });
  };
  if (applied.length === 0) return null;
  return (
    <ul ref={list} className="flex flex-wrap items-center gap-2">
      {applied.map((filter, index) => (
        <li
          key={filter.key}
          className="inline-flex h-7 max-w-full items-center gap-1 rounded-pill border border-line bg-surface pr-0.5 pl-3 text-xs"
        >
          <span className="shrink-0 text-ink-muted">{filter.label}:</span>
          <span className="truncate font-medium text-ink">{filter.value}</span>
          <button
            type="button"
            data-remove
            aria-label={t("lists.filters.remove", { label: filter.label })}
            onClick={() => then(index, filter.onRemove)}
            className="grid size-6 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-action-soft hover:text-ink"
          >
            <X size={iconSize.xs} aria-hidden="true" />
          </button>
        </li>
      ))}
      <li>
        <button
          type="button"
          onClick={() => then(applied.length, onClear)}
          className="px-1.5 text-xs text-link hover:underline"
        >
          {t("lists.clearFilters")}
        </button>
      </li>
    </ul>
  );
}
