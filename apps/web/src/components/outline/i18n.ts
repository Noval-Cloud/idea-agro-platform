import type { Catalog } from "@/i18n";
import type { Leaves } from "@/i18n/core";

/** The slice of the catalog the outline editor ships to the browser. */
export type OutlineCatalog = Pick<Catalog, "outline">;
export type OutlineKey = Leaves<OutlineCatalog>;
export const pickOutlineCatalog = (catalog: Catalog): OutlineCatalog => ({ outline: catalog.outline });
