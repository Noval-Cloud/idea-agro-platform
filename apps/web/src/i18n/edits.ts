import { locales, type Locale } from "./core";
import type { Edits, Text } from "./texts";

/*
 * The editors' published texts, which replace the catalogs' defaults. A deploy build reads them from the API, and
 * fails if it cannot; a build without one (checks, local) shows the defaults.
 */

async function fetchEdits(base: string): Promise<Record<Locale, Edits>> {
  // A deploy build that waits on an API that does not answer would hang until Cloud Build gives up.
  const response = await fetch(new URL("/v1/texts", base), { signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${response.status} /v1/texts`);
  const { texts } = (await response.json()) as { texts: Record<string, Partial<Record<Locale, Text>>> };
  const edits = Object.fromEntries(locales.map((locale) => [locale, {} as Edits])) as Record<Locale, Edits>;
  for (const [key, byLocale] of Object.entries(texts)) {
    for (const locale of locales) {
      const text = byLocale[locale];
      if (text !== undefined) edits[locale][key] = text;
    }
  }
  return edits;
}

const api = import.meta.env.PUBLIC_API_URL;
export const edits: Record<Locale, Edits> = api?.startsWith("https://")
  ? await fetchEdits(api)
  : { es: {}, en: {}, pt: {} };
