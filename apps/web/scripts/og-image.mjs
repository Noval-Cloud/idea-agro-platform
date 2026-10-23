// The social preview (Open Graph) image: the brand, the tagline and the national productivity map.
// Usage: node scripts/og-image.mjs  (writes public/og.png)
import { readFileSync } from "node:fs";
import sharp from "sharp";
import { es } from "../src/i18n/messages/es.ts";

const theme = JSON.parse(readFileSync("src/design/generated/map-theme.json", "utf8")).dark.chrome;
const [W, H] = [1200, 630];
const map = await sharp("src/assets/maps/ppna-dark.webp").resize({ height: 540 }).png().toBuffer();
const { width: mapWidth } = await sharp(map).metadata();
const escape = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const [line1, line2] = es.journey.title.split(". ").map((s, i, all) => (i < all.length - 1 ? `${s}.` : s));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <rect width="100%" height="100%" fill="${theme.canvas}"/>
  <text x="72" y="120" font-family="Georgia, serif" font-size="44" fill="${theme.ink}">${escape(es.meta.siteName)}</text>
  <text x="72" y="300" font-family="Georgia, serif" font-size="60" fill="${theme.ink}">${escape(line1)}</text>
  <text x="72" y="376" font-family="Georgia, serif" font-size="60" fill="${theme.ink}">${escape(line2)}</text>
  <text x="72" y="540" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="${theme["ink-muted"]}">${escape(es.journey.eyebrow)}</text>
</svg>`;
await sharp(Buffer.from(svg))
  .composite([{ input: map, left: W - mapWidth - 48, top: 45 }])
  .png()
  .toFile("public/og.png");
console.log("public/og.png");
