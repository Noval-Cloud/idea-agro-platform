import type { Catalog } from "@/i18n";
import { createCatalogTranslator, intlLocale, type Leaves, type Locale } from "@/i18n/core";

/** The slice of the catalog the project island ships to the browser. */
export type ProjectCatalog = Pick<Catalog, "project">;
export type ProjectKey = Leaves<ProjectCatalog>;
export const pickProjectCatalog = (catalog: Catalog): ProjectCatalog => ({ project: catalog.project });

export function createProjectTranslator(locale: Locale, catalog: ProjectCatalog) {
  const translator = createCatalogTranslator(locale, catalog);
  const number = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(value);
  return { ...translator, number };
}

export type ProjectTranslator = ReturnType<typeof createProjectTranslator>;
