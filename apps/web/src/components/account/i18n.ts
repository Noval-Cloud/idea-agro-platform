import type { Catalog } from "@/i18n";
import { createCatalogTranslator, intlLocale, type Leaves, type Locale } from "@/i18n/core";

/** The slice of the catalog the account island ships to the browser. */
export type AccountCatalog = Pick<Catalog, "account">;
export type AccountKey = Leaves<AccountCatalog>;
export const pickAccountCatalog = (catalog: Catalog): AccountCatalog => ({ account: catalog.account });

export function createAccountTranslator(locale: Locale, catalog: AccountCatalog) {
  const translator = createCatalogTranslator(locale, catalog);
  const date = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "long" }).format(new Date(value));
  const number = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: 1 }).format(value);
  return { ...translator, date, number };
}

export type AccountTranslator = ReturnType<typeof createAccountTranslator>;
