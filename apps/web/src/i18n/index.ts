import { es } from "./messages/es";
import { en } from "./messages/en";
import { pt } from "./messages/pt";
import { createCatalogTranslator, type CatalogShape, type Leaves, type Locale } from "./core";
import { edits } from "./edits";
import { markdown } from "./markdown";
import { withEdits } from "./texts";

/*
 * Every text the site shows lives in a per-locale catalog. Components never carry copy:
 * they ask for a key (`t("journey.title")`). A placeholder is `{name}`; a message that depends
 * on a count has `one` and `other` forms. Adding a language means adding a catalog with the
 * same shape as `es` (TypeScript rejects a missing or extra key). The catalogs hold the
 * defaults; editors' published texts replace them when the site is built (`edits.ts`).
 */

export * from "./core";

export type Catalog = CatalogShape<typeof es>;
export type MessageKey = Leaves<typeof es>;

export const catalogs: Record<Locale, Catalog> = {
  es: withEdits(es, edits.es),
  en: withEdits(en, edits.en),
  pt: withEdits(pt, edits.pt),
};

export function createTranslator(locale: Locale) {
  const translator = createCatalogTranslator(locale, catalogs[locale]);
  /** The HTML of a Markdown text (see `texts.ts` for which ones), with its placeholders filled. */
  const md = (key: MessageKey, values?: Parameters<typeof translator.t>[1]) => markdown(translator.t(key, values));
  return { ...translator, md };
}

export type Translator = ReturnType<typeof createTranslator>;
