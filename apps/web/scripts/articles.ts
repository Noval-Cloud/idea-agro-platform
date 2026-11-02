// Writes src/data/articles.json, the copy of the articles that builds without an API read.
// Usage: node scripts/articles.ts [api url, default https://api.idea-agro.org]
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const base = process.argv[2] ?? "https://api.idea-agro.org";
const response = await fetch(new URL("/v1/articles", base));
if (!response.ok) throw new Error(`${response.status} /v1/articles`);
const file = fileURLToPath(new URL("../src/data/articles.json", import.meta.url));
writeFileSync(file, `${JSON.stringify(await response.json())}\n`);
// Formatted as the repository's checks expect.
execFileSync("pnpm", ["exec", "vp", "fmt", file], { stdio: "inherit" });
console.log(`articles.json written from ${base}`);
