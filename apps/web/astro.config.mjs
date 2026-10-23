// @ts-check
import { defineConfig, fontProviders } from "astro/config";
import react from "@astrojs/react";
import tailwindcss from "@tailwindcss/vite";
import maplibreVendor from "./plugins/maplibre-vendor.mjs";

// Origins the pages may reach, besides their own: the API, the sign-in provider and the map's tiles.
const apiOrigin = new URL(process.env.PUBLIC_API_URL ?? "http://localhost:8080").origin;
const authFrame = process.env.PUBLIC_AUTH_DOMAIN ? `https://${process.env.PUBLIC_AUTH_DOMAIN}` : "'none'";
const signInApis = "https://identitytoolkit.googleapis.com https://securetoken.googleapis.com";

export default defineConfig({
  // Absolute URLs (canonical, hreflang) are emitted once the public domain is set.
  site: process.env.SITE_URL,
  integrations: [react()],
  // A <meta> policy with the hash of every script and style Astro emits; nginx adds frame-ancestors.
  security: {
    csp: {
      directives: [
        "default-src 'self'",
        `connect-src 'self' ${apiOrigin} ${signInApis} https://tiles.openfreemap.org`,
        "img-src 'self' data: blob: https://lh3.googleusercontent.com",
        "worker-src 'self' blob:",
        "font-src 'self'",
        `frame-src ${authFrame}`,
        "form-action 'self'",
        "object-src 'none'",
      ],
      // The provider's popup sign-in loads Google's iframe helper.
      scriptDirective: { resources: ["'self'", "https://apis.google.com"] },
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
