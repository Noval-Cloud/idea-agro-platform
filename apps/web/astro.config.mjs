// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import maplibreVendor from "./plugins/maplibre-vendor.mjs";

// Origins the pages may reach, besides their own: the API (data and map images), the map's tiles, and those the sign-in provider
// needs, which come from the infrastructure (`auth_csp` in Terraform) so no provider is named here. The map
// reads the indicator images the page paints through `blob:` URLs.
const apiOrigin = new URL(process.env.PUBLIC_API_URL ?? "http://localhost:8080").origin;
const authConnect = process.env.AUTH_CSP_CONNECT ?? "";
const authFrame = process.env.AUTH_CSP_FRAME || "'none'";
const authScript = process.env.AUTH_CSP_SCRIPT ?? "";

export default defineConfig({
  // Absolute URLs (canonical, hreflang) are emitted once the public domain is set.
  site: process.env.SITE_URL,
  integrations: [react()],
  // A <meta> policy with the hash of every script and style Astro emits; nginx adds frame-ancestors.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `connect-src 'self' blob: ${apiOrigin} ${authConnect} https://tiles.openfreemap.org`,
        `img-src 'self' data: blob: ${apiOrigin} ${process.env.AUTH_CSP_IMAGES ?? ""}`,
        "worker-src 'self' blob:",
        "font-src 'self'",
        `frame-src ${authFrame}`,
        "form-action 'self'",
        "object-src 'none'",
      ],
      scriptDirective: { resources: ["'self'", ...authScript.split(" ").filter(Boolean)] },
      // Inline style attributes, as in server-rendered charts; style elements still need their hash.
      styleDirective: { resources: ["'self'", { resource: "'unsafe-inline'", kind: "attribute" }] },
    },
  },
  // The stylesheet is small; inlining it removes the only render-blocking request.
  build: { inlineStylesheets: "always" },
  vite: {
    plugins: [tailwindcss(), maplibreVendor()],
    // Loaded on demand (drawing, file upload): bundled up front in dev, or the first use hits a stale bundle.
    optimizeDeps: { include: ["terra-draw", "terra-draw-maplibre-gl-adapter", "shpjs", "@tmcw/togeojson"] },
  },
  // Signing in creates the account, so the old sign-up page leads to sign-in.
  redirects: { "/register": "/login/", "/en/register": "/en/login/", "/pt/register": "/pt/login/" },
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
