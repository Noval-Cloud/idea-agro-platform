import { useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import { matches } from "./filter";
import type { ListsT } from "./i18n";

export type Choice = { value: string; label: string };
export type ChoiceSection = { label?: string; choices: Choice[] };

/** A filter's button, marked once it narrows the list. */
export const filterTrigger = (active: boolean) =>
  cn(
    "inline-flex h-9 max-w-56 min-w-0 items-center gap-2 rounded-sm border px-3 text-sm whitespace-nowrap hover:border-ink-subtle data-[state=open]:border-ink-subtle",
    active ? "border-ink-subtle bg-action-soft text-ink" : "border-input text-ink-muted",
  );

/** The choices ticked, by their names, for the filter's chip. */
export const chosenLabels = (sections: ChoiceSection[], selected: string[]) =>
  sections
    .flatMap((s) => s.choices)
    .filter((c) => selected.includes(c.value))
    .map((c) => c.label);

/**
 * Several choices of one filter, ticked in a list as when forwarding a message; with many, a search narrows them.
 * Each tick applies at once.
 */
export function MultiFilter({
  t,
  label,
  sections,
  selected,
  onChange,
  searchable,
  fallback = [],
}: {
  t: ListsT;
  label: string;
  sections: ChoiceSection[];
  selected: string[];
  onChange: (selected: string[]) => void;
  /** A search over the choices; by default, once they are many. */
  searchable?: boolean;
  /** What is ticked before anyone narrows the list; only a change from it marks the filter. */
  fallback?: string[];
}) {
  const [query, setQuery] = useState("");
  const total = sections.reduce((sum, s) => sum + s.choices.length, 0);
  const shown = sections
    .map((s) => ({ ...s, choices: s.choices.filter((c) => matches(query, c.label)) }))
    .filter((s) => s.choices.length > 0);
  const active = selected.length !== fallback.length || selected.some((v) => !fallback.includes(v));
  const toggle = (value: string) =>
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);

  return (
    <Popover onOpenChange={(open) => !open && setQuery("")}>
      <PopoverTrigger className={filterTrigger(active)}>
        <span className="truncate">{label}</span>
        {active && selected.length > 0 && (
          <span className="rounded-pill bg-ink px-1.5 text-2xs leading-4 font-medium text-canvas tabular-nums">
            {selected.length}
          </span>
        )}
        <ChevronDown size={iconSize.sm} aria-hidden="true" className="shrink-0 text-ink-subtle" />
      </PopoverTrigger>
      <PopoverContent align="start" aria-label={label} className="grid w-72 gap-0 p-0">
        {(searchable ?? total > 7) && (
          <div className="relative border-b border-line p-2">
            <Search
              size={iconSize.sm}
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-ink-subtle"
            />
            <input
              type="search"
              value={query}
              aria-label={`${t("lists.filters.search")} ${label}`}
              placeholder={t("lists.filters.search")}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => setQuery(event.currentTarget.value)}
              className="h-9 w-full rounded-sm border border-input bg-surface pr-3 pl-9 text-sm text-ink placeholder:text-ink-subtle focus-visible:border-focus [&::-webkit-search-cancel-button]:hidden"
            />
          </div>
        )}
        <div className="grid max-h-72 gap-2 overflow-y-auto p-1.5">
          {shown.map((section, index) => (
            <div key={section.label ?? index} role="group" aria-label={section.label} className="grid">
              {section.label && (
                <p
                  aria-hidden="true"
                  className="px-2 pt-1.5 pb-1 text-2xs font-medium tracking-wide text-ink-subtle uppercase"
                >
                  {section.label}
                </p>
              )}
              {section.choices.map((choice) => (
                <label
                  key={choice.value}
                  className="flex min-h-10 cursor-pointer items-center gap-3 rounded-sm px-2 text-sm text-ink hover:bg-action-soft has-focus-visible:bg-action-soft"
                >
                  <input
                    type="checkbox"
                    className="peer sr-only"
                    checked={selected.includes(choice.value)}
                    onChange={() => toggle(choice.value)}
                  />
                  <span className="grid size-5 shrink-0 place-items-center rounded-full border border-line-strong text-transparent transition-colors duration-(--ia-motion-fast) peer-checked:border-action peer-checked:bg-action peer-checked:text-action-ink peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus">
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                  <span className="min-w-0 truncate">{choice.label}</span>
                </label>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p className="px-2 py-3 text-sm text-ink-muted">{t("lists.noResults.title")}</p>}
        </div>
        <div className="flex items-center gap-2 border-t border-line px-3 py-2">
          <p aria-live="polite" className="grow text-xs text-ink-subtle tabular-nums">
            {selected.length > 0 ? t("lists.filters.chosen", { count: selected.length }) : ""}
          </p>
          <button
            type="button"
            disabled={!active}
            onClick={() => onChange(fallback)}
            className="rounded-xs px-1.5 py-1 text-sm text-link hover:underline disabled:pointer-events-none disabled:opacity-40"
          >
            {t("lists.filters.clear")}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
