import { intlLocale, type Locale } from "@/i18n/core";

/** A latitude or longitude in degrees, to five decimals: about a meter. */
export const degreesFormat = (locale: Locale) => {
  const format = new Intl.NumberFormat(intlLocale[locale], { minimumFractionDigits: 5, maximumFractionDigits: 5 });
  return (value: number) => format.format(value).replace("-", "−");
};
