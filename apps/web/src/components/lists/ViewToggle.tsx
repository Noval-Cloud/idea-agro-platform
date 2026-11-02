import { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { Tooltip } from "@/components/ui/tooltip";
import { iconSize } from "@/design/tokens";
import type { ListsT } from "./i18n";

export type ListView = "table" | "cards";

/** The view a list was last shown in, kept per list in this browser. */
export function useListView(list: string): [ListView, (view: ListView) => void] {
  const key = `ia-view:${list}`;
  const [view, setView] = useState<ListView>("table");
  useEffect(() => {
    try {
      if (localStorage.getItem(key) === "cards") setView("cards");
    } catch {
      // Storage can be blocked; the list still shows as a table.
    }
  }, [key]);
  const choose = (next: ListView) => {
    setView(next);
    try {
      localStorage.setItem(key, next);
    } catch {
      // Not remembered, but still applied.
    }
  };
  return [view, choose];
}

/** Table or cards: both on a wide screen; on a phone, one icon that switches to the other. */
export function ViewToggle({ t, view, onView }: { t: ListsT; view: ListView; onView: (view: ListView) => void }) {
  const other = view === "table" ? "cards" : "table";
  const Other = other === "table" ? Rows3 : LayoutGrid;
  return (
    <>
      <Segmented
        value={view}
        onValueChange={(value) => onView(value as ListView)}
        aria-label={t("lists.view.label")}
        className="hidden sm:inline-flex"
      >
        <Tooltip label={t("lists.view.table")}>
          <SegmentedItem value="table" aria-label={t("lists.view.table")} className="px-2.5">
            <Rows3 aria-hidden="true" />
          </SegmentedItem>
        </Tooltip>
        <Tooltip label={t("lists.view.cards")}>
          <SegmentedItem value="cards" aria-label={t("lists.view.cards")} className="px-2.5">
            <LayoutGrid aria-hidden="true" />
          </SegmentedItem>
        </Tooltip>
      </Segmented>
      <button
        type="button"
        aria-label={t(`lists.view.show.${other}`)}
        onClick={() => onView(other)}
        className="inline-flex size-9 items-center justify-center rounded-sm text-ink-muted hover:bg-action-soft hover:text-ink sm:hidden"
      >
        <Other size={iconSize.sm} aria-hidden="true" />
      </button>
    </>
  );
}
