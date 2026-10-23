/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Versioned URL of the unbundled MapLibre module (see plugins/maplibre-vendor.mjs). */
  readonly MAPLIBRE_URL: string;
}
