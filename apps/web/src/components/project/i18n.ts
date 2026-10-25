import type { Catalog } from "@/i18n";
import { createCatalogTranslator, intlLocale, type Leaves, type Locale } from "@/i18n/core";
import { degreesFormat } from "@/lib/degrees";
import { relativeTimeFormat } from "@/lib/relative-time";

/** The slice of the catalog the project island ships to the browser. */
export type ProjectCatalog = Pick<Catalog, "project" | "lists">;
export type ProjectKey = Leaves<ProjectCatalog>;
export const pickProjectCatalog = (catalog: Catalog): ProjectCatalog => ({
  project: catalog.project,
  lists: catalog.lists,
});

export function createProjectTranslator(locale: Locale, catalog: ProjectCatalog) {
  const translator = createCatalogTranslator(locale, catalog);
  const number = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(value);
  const moment = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  const time = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { timeStyle: "short" }).format(new Date(value));
  const day = (value: Date) =>
    new Intl.DateTimeFormat(intlLocale[locale], { weekday: "long", day: "numeric", month: "long" }).format(value);
  const collator = new Intl.Collator(intlLocale[locale], { sensitivity: "base", numeric: true });
  return {
    ...translator,
    number,
    moment,
    time,
    day,
    degrees: degreesFormat(locale),
    ago: relativeTimeFormat(locale),
    collator,
  };
}

export type ProjectTranslator = ReturnType<typeof createProjectTranslator>;
