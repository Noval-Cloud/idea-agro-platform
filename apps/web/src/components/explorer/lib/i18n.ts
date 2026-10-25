import { createContext, useContext } from "react";
import type { Catalog } from "@/i18n";
import { createCatalogTranslator, intlLocale, type Leaves, type Locale } from "@/i18n/core";
import { indicators, type IndicatorId } from "@/data/indicators";
import type { IndicatorManifest } from "./data";
import { degreesFormat } from "@/lib/degrees";

/** The slice of the catalog the explorer and zone islands ship to the browser. */
export type AppCatalog = Pick<Catalog, "explorer" | "zone" | "indicators" | "communities" | "science">;
/** A message key of that slice; dynamic keys (built from ids) are cast to it. */
export type AppKey = Leaves<AppCatalog>;
export const pickAppCatalog = (catalog: Catalog): AppCatalog => ({
  explorer: catalog.explorer,
  zone: catalog.zone,
  indicators: catalog.indicators,
  communities: catalog.communities,
  science: catalog.science,
});

export function createAppTranslator(locale: Locale, catalog: AppCatalog) {
  const translator = createCatalogTranslator(locale, catalog);
  const { t } = translator;
  const number = (value: number, digits = 0) =>
    new Intl.NumberFormat(intlLocale[locale], { maximumFractionDigits: digits, minimumFractionDigits: 0 })
      .format(value)
      .replace("-", "−");
  const signedPercent = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0, signDisplay: "exceptZero" })
      .format(value)
      .replace("-", "−");
  const percent = (value: number) =>
    new Intl.NumberFormat(intlLocale[locale], { style: "percent", maximumFractionDigits: 0 }).format(value);

  /** "2025–26" for productive years (July–June), "2021" for calendar years. */
  const yearLabel = (indicator: IndicatorId, year: number) =>
    indicators[indicator].yearStyle === "productive"
      ? t("explorer.time.productiveYear", { from: year, to: String((year + 1) % 100).padStart(2, "0") })
      : String(year);

  /** Converts a raster gray level back to the indicator's value. */
  const fromGray = (manifest: IndicatorManifest, gray: number) =>
    (manifest.min ?? 0) + (gray / 255) * ((manifest.max ?? 1) - (manifest.min ?? 0));

  const value = (indicator: IndicatorId, v: number) => number(v, indicators[indicator].digits);

  return { ...translator, number, percent, signedPercent, yearLabel, fromGray, value, degrees: degreesFormat(locale) };
}

export type AppTranslator = ReturnType<typeof createAppTranslator>;
export const I18nContext = createContext<AppTranslator | null>(null);

export function useI18n(): AppTranslator {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n outside I18nContext");
  return context;
}
