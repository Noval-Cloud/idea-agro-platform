// Writes the site's texts as the API reads them: each key's format and its default in every language.
// Usage: node scripts/export-texts.ts (`make generate` runs it; `make contract` fails when its output is behind).
import { writeFileSync } from "node:fs";
import { en } from "../src/i18n/messages/en.ts";
import { es } from "../src/i18n/messages/es.ts";
import { pt } from "../src/i18n/messages/pt.ts";
import { isMarkdown, texts, type Text } from "../src/i18n/texts.ts";

const catalogs = { es, en, pt };
const defaults = new Map<string, Record<string, Text>>();
for (const [locale, catalog] of Object.entries(catalogs)) {
  for (const [key, text] of texts(catalog)) defaults.set(key, { ...defaults.get(key), [locale]: text });
}

const site = Object.fromEntries(
  [...defaults]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => {
      const format = typeof value.es === "string" ? (isMarkdown(key) ? "markdown" : "plain") : "plural";
      return [key, { format, default: value }];
    }),
);
const target = new URL("../../../services/api/src/idea_agro_api/site_texts.json", import.meta.url);
writeFileSync(target, `${JSON.stringify(site, null, 2)}\n`);
console.log(`${defaults.size} texts written to services/api/src/idea_agro_api/site_texts.json`);
