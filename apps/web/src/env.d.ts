/// <reference types="astro/client" />

interface ImportMetaEnv {
  /** Versioned URL of the unbundled MapLibre module (see plugins/maplibre-vendor.mjs). */
  readonly MAPLIBRE_URL: string;
  /** Origin of the IDEA-Agro API; the local API (`make api-dev`) when unset. */
  readonly PUBLIC_API_URL?: string;
  /** The sign-in provider's browser key; sign-in is off when unset. */
  readonly PUBLIC_AUTH_KEY?: string;
  /** The domain that serves the sign-in provider's pages. */
  readonly PUBLIC_AUTH_DOMAIN?: string;
}
