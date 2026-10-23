/*
 * Locale plumbing that does not depend on any catalog, so interactive islands can ship it to
 * the browser with only the part of the catalog they need (see `createCatalogTranslator`).
 */

export const locales = ["es", "en", "pt"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "es";

/** BCP 47 tags used for number, date and plural formatting. */
export const intlLocale: Record<Locale, string> = { es: "es-UY", en: "en-GB", pt: "pt-BR" };

/** The language of each locale's pages (`lang`, `hreflang`). */
export const htmlLang: Record<Locale, string> = { es: "es", en: "en", pt: "pt-BR" };

export type Plural = { readonly one: string; readonly other: string };
export type CatalogShape<T> = {
  readonly [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : CatalogShape<T[K]>;
};
export type Leaves<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | Plural ? `${P}${K}` : Leaves<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Values = Record<string, string | number>;

export function isLocale(value: string | undefined): value is Locale {
  return locales.includes(value as Locale);
}

export function resolveLocale(value: string | undefined): Locale {
  return isLocale(value) ? value : defaultLocale;
}

function lookup(catalog: object, locale: Locale, key: string): string | Plural {
  let node: unknown = catalog;
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "other" in node) return node as Plural;
  throw new Error(`Unknown message key "${key}" for locale "${locale}"`);
}

/** A translator over a catalog (or a slice of one, with the same nesting) for one locale. */
export function createCatalogTranslator<C extends object>(locale: Locale, catalog: C) {
  type Key = Leaves<C>;
  const plurals = new Intl.PluralRules(intlLocale[locale]);
  const numberFormat = (options?: Intl.NumberFormatOptions) => new Intl.NumberFormat(intlLocale[locale], options);

  const pick = (message: string | Plural, values?: Values) => {
    if (typeof message === "string") return message;
    return plurals.select(Number(values?.count ?? 0)) === "one" ? message.one : message.other;
  };
  const fill = (template: string, values?: Values) =>
    values
      ? template.replace(/\{(\w+)\}/g, (match, name: string) => (name in values ? String(values[name]) : match))
      : template;

  /** The text of a key, with its placeholders filled. A `count` value chooses the plural form. */
  const t = (key: Key, values?: Values) => fill(pick(lookup(catalog, locale, key), values), values);

  /** Splits a message around its placeholders, so a component can put an element (a link) in one. */
  const parts = (key: Key, values?: Values) =>
    pick(lookup(catalog, locale, key), values)
      .split(/(\{\w+\})/g)
      .filter(Boolean)
      .map((part) => {
        const name = /^\{(\w+)\}$/.exec(part)?.[1];
        return name ? { slot: name } : { text: fill(part, values) };
      });

  /** Whether a key exists: for labels built from codes (`indicators.${id}.name`). */
  const has = (key: string): key is Key => {
    try {
      lookup(catalog, locale, key);
      return true;
    } catch {
      return false;
    }
  };

  const number = (value: number, options?: Intl.NumberFormatOptions) => numberFormat(options).format(value);
  const compact = (value: number) => numberFormat({ notation: "compact", maximumFractionDigits: 1 }).format(value);
  // Readers get a true minus sign; machine formats (CSV) never go through these helpers.
  const minus = (text: string) => text.replace("-", "\u2212");
  const percent = (value: number, options?: Intl.NumberFormatOptions) =>
    minus(numberFormat({ style: "percent", maximumFractionDigits: 0, ...options }).format(value));
  const signedPercent = (value: number) =>
    minus(numberFormat({ style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" }).format(value));
  const date = (
    value: Date,
    options: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", year: "numeric" },
  ) => new Intl.DateTimeFormat(intlLocale[locale], { timeZone: "UTC", ...options }).format(value);
  const dateRange = (start: Date, end: Date) =>
    new Intl.DateTimeFormat(intlLocale[locale], {
      timeZone: "UTC",
      day: "numeric",
      month: "long",
      year: "numeric",
    }).formatRange(start, end);

  return { locale, t, parts, has, number, compact, percent, signedPercent, date, dateRange };
}

/** The URL of a site path in a locale (the default locale has no prefix). */
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  return clean === "/" ? `/${locale}/` : `/${locale}${clean}`;
}

/** Where a language switch leads: the same page in the other language, or home from the 404 (one page for all). */
export function languageSwitchPath(pathname: string): string {
  const path = stripLocale(pathname);
  return /^\/404(\.html|\/)?$/.test(path) ? "/" : path;
}

/** The site path without its locale prefix: `/en/login` → `/login`. */
export function stripLocale(pathname: string): string {
  const [, first, ...rest] = pathname.split("/");
  if (isLocale(first) && first !== defaultLocale) return `/${rest.join("/")}`;
  return pathname;
}
