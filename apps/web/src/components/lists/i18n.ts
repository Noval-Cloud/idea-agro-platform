import type { Catalog } from "@/i18n";
import type { Leaves, Values } from "@/i18n/core";

/** The words every list shares: search, views, sorting, menus. Islands with lists ship this slice too. */
export type ListsCatalog = Pick<Catalog, "lists">;
export type ListsKey = Leaves<ListsCatalog>;
export type ListsT = (key: ListsKey, values?: Values) => string;
export const pickListsCatalog = (catalog: Catalog): ListsCatalog => ({ lists: catalog.lists });
