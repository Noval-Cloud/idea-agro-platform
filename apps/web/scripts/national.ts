// Writes src/data/national.json, the copy of the country's indicators that builds without an API read.
// Usage: node scripts/national.ts [api url, default https://api.idea-agro.org]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { fetchNational } from "../src/data/national-source.ts";

const base = process.argv[2] ?? "https://api.idea-agro.org";
const national = await fetchNational(base);
const file = fileURLToPath(new URL("../src/data/national.json", import.meta.url));
writeFileSync(file, `${JSON.stringify(national)}\n`);
// Formatted as the repository's checks expect.
execFileSync("pnpm", ["exec", "vp", "fmt", file], { stdio: "inherit" });
console.log(`national.json written from ${base}`);
