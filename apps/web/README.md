# Website

The IDEA-Agro website: the landing, the map explorer, the zone page, the indicator atlas and the resources.

## Stack

- [Astro 7](https://astro.build) with static output. Content pages ship almost no JavaScript; the map explorer and the zone page are React islands.
- [MapLibre GL JS 6](https://maplibre.org) on an [OpenFreeMap](https://openfreemap.org) basemap styled with the design tokens. MapLibre is served unbundled under `/vendor/` (`plugins/maplibre-vendor.mjs`), so its worker and the page share one copy of its code.
- Tailwind CSS 4 restricted to the design tokens, and shadcn/ui conventions for UI primitives.
- Spanish, English and Brazilian Portuguese, with typed message catalogs.

## Commands

From `apps/web`, after `make setup` at the root:

| Command        | What it does                                                                   |
| :------------- | :----------------------------------------------------------------------------- |
| `pnpm dev`     | Starts the dev server                                                          |
| `pnpm build`   | Builds the static site into `dist/`                                            |
| `pnpm preview` | Serves the build                                                               |
| `pnpm check`   | Astro's type check                                                             |
| `pnpm tokens`  | Regenerates `src/styles/tokens.css`, the map ramps and the favicon from tokens |

Format, lint and the checks of the whole repository run from the root with `make lint` and `make check`. Set `SITE_URL` at build time to emit canonical and `hreflang` links.

## Layout

```text
src/
  design/tokens.ts       every visual value; `pnpm tokens` renders it to CSS
  i18n/                  translator and per-locale catalogs
  data/                  indicator registry, references, and the country's series the landing and Indicators pages draw
  components/            site chrome, the landing's story, the explorer and zone islands, ui primitives
  pages/                 one file per route, with its /en/ and /pt/ versions
scripts/prototype-data/  extraction of the explorer's data from Earth Engine
```

## Sign-in

`src/lib/account.ts` is the only module that knows the sign-in provider (Firebase Authentication).

- **What goes through it:** the rest of the site signs in and signs out through it, and makes every private API call through `privately()`. Public data calls never carry a token.
- **Expired sessions:** a refused token is renewed once; if the provider refuses too, the session ends on this device as well.
- **Loading:** its SDK loads on first use, never with the page. The header draws the account from what `src/lib/account-hint.ts` remembers.

Sign-in needs `PUBLIC_AUTH_KEY` and `PUBLIC_AUTH_DOMAIN` at build time (`make web-deploy` takes them from Terraform); without them, the sign-in page says it is not available. `PUBLIC_API_URL` is the API's origin.

Every page carries a Content Security Policy.

- Astro hashes each script and style it emits (`security.csp` in `astro.config.mjs`).
- The provider's origins come from Terraform's `auth_csp` output, through `AUTH_CSP_*` at build time.
- `deploy/security-headers.conf` adds the headers a `<meta>` cannot carry.

## Data

The explorer and the zone page read everything through the API, with its generated client, in the browser. `src/components/explorer/lib/data.ts` turns the API's answers into the website's types. Locally, the site calls `PUBLIC_API_URL`, `http://localhost:8080` by default, where `make api-dev` serves the data (see `services/api/README.md`).

The home and Indicators pages draw the country's series when the site is built. `src/data/series.ts` reads the API's `uruguay` zone when `PUBLIC_API_URL` is an `https` address, and fails the build if it cannot. Without one (checks, local builds) it reads `src/data/national.json`, a copy of the same answers that `node scripts/national.ts` refreshes.

The prototype's data, extracted once from Earth Engine by `scripts/prototype-data/`, lives in `.cache/prototype-data/explorer/`, which git ignores. `make public-data` turns it into what the API serves, until the data jobs regenerate it from Earth Engine.

## Deploy

`make web-deploy ENV=<env>` at the root builds the site with its public URL, then Cloud Build builds the image (`Dockerfile`, nginx with `deploy/nginx.conf`), pushes it and updates only the image of the environment's `web` service. The upload holds only what the image needs (`.gcloudignore`), prototype data included. The service itself is in Terraform (`infrastructure/terraform/modules/services/web`).
