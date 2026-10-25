import { Search, X } from "lucide-react";
import { iconSize } from "@/design/tokens";
import type { ListsT } from "./i18n";

/** Narrows a list as one types; Escape or the cross clears it. */
export function SearchField({
  t,
  value,
  label,
  placeholder,
  onChange,
}: {
  t: ListsT;
  value: string;
  label: string;
  placeholder: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="relative w-full min-w-0 sm:w-64">
      <Search
        size={iconSize.sm}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        value={value}
        aria-label={label}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            onChange("");
          }
        }}
        className="h-9 w-full rounded-sm border border-input bg-surface pr-9 pl-9 text-sm text-ink transition-colors duration-(--ia-motion-fast) placeholder:text-ink-subtle hover:border-ink-subtle focus-visible:border-focus [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          aria-label={t("lists.clearSearch")}
          onClick={() => onChange("")}
          className="absolute top-1/2 right-1 flex size-7 -translate-y-1/2 items-center justify-center rounded-xs text-ink-subtle hover:bg-action-soft hover:text-ink"
        >
          <X size={iconSize.sm} aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
