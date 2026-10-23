// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import maplibreVendor from "./plugins/maplibre-vendor.mjs";

export default defineConfig({
  // Absolute URLs (canonical, hreflang) are emitted once the public domain is set.
  site: process.env.SITE_URL,
  integrations: [react()],
  // The stylesheet is small; inlining it removes the only render-blocking request.
  build: { inlineStylesheets: "always" },
  vite: {
    plugins: [tailwindcss(), maplibreVendor()],
    // Loaded on demand (drawing, file upload): bundled up front in dev, or the first use hits a stale bundle.
    optimizeDeps: { include: ["terra-draw", "terra-draw-maplibre-gl-adapter", "shpjs", "@tmcw/togeojson"] },
  },
  i18n: {
    locales: ["es", "en", "pt"],
    defaultLocale: "es",
    routing: { prefixDefaultLocale: false },
  },
  fonts: [
    {
      name: "Newsreader",
      cssVariable: "--font-newsreader",
      provider: fontProviders.fontsource(),
      weights: ["500"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["Georgia", "serif"],
    },
    {
      name: "Schibsted Grotesk",
      cssVariable: "--font-schibsted",
      provider: fontProviders.fontsource(),
      weights: ["400 700"],
      styles: ["normal"],
      subsets: ["latin"],
      fallbacks: ["sans-serif"],
    },
  ],
});
