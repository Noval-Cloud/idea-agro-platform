// Writes src/data/national.json, the copy of the country's indicators that builds without an API read.
// Usage: node scripts/national.ts [api url, default https://api.idea-agro.org]
import { writeFileSync } from "node:fs";
import { fetchNational } from "../src/data/national-source.ts";

const base = process.argv[2] ?? "https://api.idea-agro.org";
const national = await fetchNational(base);
writeFileSync(new URL("../src/data/national.json", import.meta.url), `${JSON.stringify(national)}\n`);
console.log(`national.json written from ${base}`);
