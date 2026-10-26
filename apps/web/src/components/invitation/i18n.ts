import type { Catalog } from "@/i18n";
import { createCatalogTranslator, intlLocale, type Leaves, type Locale } from "@/i18n/core";

/** The slice of the catalog the invitation island ships to the browser. */
export type InvitationCatalog = Pick<Catalog, "invitation">;
export type InvitationKey = Leaves<InvitationCatalog>;
export const pickInvitationCatalog = (catalog: Catalog): InvitationCatalog => ({ invitation: catalog.invitation });

export function createInvitationTranslator(locale: Locale, catalog: InvitationCatalog) {
  const translator = createCatalogTranslator(locale, catalog);
  const date = (value: string) =>
    new Intl.DateTimeFormat(intlLocale[locale], { dateStyle: "long" }).format(new Date(value));
  return { ...translator, date };
}
