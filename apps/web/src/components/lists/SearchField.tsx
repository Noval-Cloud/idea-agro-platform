import { useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import { cn } from "@/lib/utils";
import type { ListsT } from "./i18n";

/**
 * Narrows a list as one types; Escape or the cross clears it. On a phone it folds into a magnifier until opened,
 * and folds back when left empty.
 */
export function SearchField({
  id = "list-search",
  t,
  value,
  label,
  placeholder,
  onChange,
  className,
  collapsible = true,
}: {
  id?: string;
  className?: string;
  t: ListsT;
  value: string;
  label: string;
  placeholder?: string;
  onChange: (value: string) => void;
  /** Whether a phone shows only the magnifier until the search is opened. */
  collapsible?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const folded = collapsible && !open && !value;

  return (
    <>
      {folded && (
        <button
          ref={opener}
          type="button"
          aria-label={label}
          aria-controls={id}
          aria-expanded={false}
          onClick={() => {
            setOpen(true);
            // The box shows on this render; focus waits for it.
            requestAnimationFrame(() => document.getElementById(id)?.focus());
          }}
          className="inline-flex size-9 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink sm:hidden"
        >
          <Search size={iconSize.sm} aria-hidden="true" />
        </button>
      )}
      <div className={cn("relative min-w-40 flex-1 sm:w-64 sm:flex-none", folded && "hidden sm:block", className)}>
        <Search
          size={iconSize.sm}
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
        />
        <input
          id={id}
          type="search"
          value={value}
          aria-label={label}
          placeholder={placeholder ?? t("lists.search")}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => onChange(event.currentTarget.value)}
          onBlur={(event) => {
            if (!event.currentTarget.value) setOpen(false);
          }}
          onKeyDown={(event) => {
            if (event.key !== "Escape") return;
            if (value) {
              event.preventDefault();
              onChange("");
            } else if (open) {
              setOpen(false);
              requestAnimationFrame(() => opener.current?.focus());
            }
          }}
          className="h-9 w-full rounded-sm border border-input bg-surface pr-9 pl-9 text-sm text-ink transition-colors duration-(--ia-motion-fast) placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus [&::-webkit-search-cancel-button]:hidden"
        />
        {value && (
          <button
            type="button"
            aria-label={t("lists.clearSearch")}
            onClick={() => {
              onChange("");
              document.getElementById(id)?.focus();
            }}
            className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-xs text-ink-subtle hover:bg-action-soft hover:text-ink"
          >
            <X size={iconSize.sm} aria-hidden="true" />
          </button>
        )}
      </div>
    </>
  );
}
