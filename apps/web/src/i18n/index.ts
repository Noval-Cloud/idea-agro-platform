import { es } from "./messages/es";
import { en } from "./messages/en";
import { pt } from "./messages/pt";
import { createCatalogTranslator, type CatalogShape, type Leaves, type Locale } from "./core";

/*
 * Every text the site shows lives in a per-locale catalog. Components never carry copy:
 * they ask for a key (`t("journey.title")`). A placeholder is `{name}`; a message that depends
 * on a count has `one` and `other` forms. Adding a language means adding a catalog with the
 * same shape as `es` (TypeScript rejects a missing or extra key).
 */

export * from "./core";

export type Catalog = CatalogShape<typeof es>;
export type MessageKey = Leaves<typeof es>;

export const catalogs: Record<Locale, Catalog> = { es, en, pt };

export function createTranslator(locale: Locale) {
  return createCatalogTranslator(locale, catalogs[locale]);
}

export type Translator = ReturnType<typeof createTranslator>;
