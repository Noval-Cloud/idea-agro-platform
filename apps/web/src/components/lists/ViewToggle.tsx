import { useEffect, useState } from "react";
import { LayoutGrid, Rows3 } from "lucide-react";
import { Segmented, SegmentedItem } from "@/components/ui/toggle-group";
import { Tooltip } from "@/components/ui/tooltip";
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

export function ViewToggle({ t, view, onView }: { t: ListsT; view: ListView; onView: (view: ListView) => void }) {
  return (
    <Segmented value={view} onValueChange={(value) => onView(value as ListView)} aria-label={t("lists.view.label")}>
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
  );
}
