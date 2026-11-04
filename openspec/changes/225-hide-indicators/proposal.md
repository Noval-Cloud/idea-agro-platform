## Why

Some indicators read Earth Engine assets that the team is fixing. Until they are fixed, those indicators' maps and values should not be published, and editors need to hide an indicator and bring it back without a deploy.

## What Changes

- **The switch:** each indicator's panel in Content → Indicators has a "Shown on the site" switch. The list marks the hidden indicators, and every change is audited (`indicator_hidden`, `indicator_shown`) and shown in Actions. Editors keep editing a hidden indicator's texts and articles.
- **Where it is kept:** the content database, one record per indicator switched (`indicator_visibility`); an indicator without one is shown.
- **API, for editors:** `GET /v1/indicators/visibility` lists every indicator with whether it is shown, and `PUT /v1/indicators/{indicator}/visibility` changes it. A change marks the site behind, as a text's publish does, so the data job's `site` task rebuilds it after the quiet minutes, or "Update now" at once. `GET /v1/indicators/articles` gives every indicator's citations, hidden ones too, which the Content pages read.
- **API, public:**
  - `GET /v1/indicators` lists the shown indicators; the website reads it when it is built.
  - The catalog (`indicators` and `seasonal`), a zone's seasonal series, a saved or project zone's series, and the citations in `/v1/articles` leave hidden indicators out.
  - A hidden indicator's maps (`/v1/maps/{indicator}/...`) and division values (`/v1/divisions/{division}/values/{indicator}`) answer 404 with the problem type `urn:idea-agro:problem:indicator-temporarily-unavailable`, and `Cache-Control: no-store`. 404 says it is temporary, and the type tells it from a wrong route.
  - The only route of an indicator's articles, `PUT /v1/indicators/{indicator}/articles`, is the editors': it keeps working, so editors edit a hidden indicator's articles.
  - The API keeps the switch's state for a few seconds per instance, so maps do not read the database on every request.
- **Website:** the build reads the shown indicators, as it reads the published texts, and leaves the hidden ones out of every page:
  - the indicators page's atlas;
  - the landing's journey: its list of indicators, its cycle of maps, links naming them, and a chapter drawn from a hidden indicator's data (grassland from COB; satellites, processing and decisions from PPNA);
  - the explorer's picker, the zone page's tabs and grassland fact, the menus, the resources page's citations;
  - the national data and the articles it reads.
- **Defaults:** a link to the explorer or the zone page that names a hidden indicator opens the default one, PPNA, or the first shown indicator while PPNA is hidden. The explorer's first picture and the landing's explore card show the default.
- **Data job:** unchanged. It keeps computing every indicator, hidden or not.

## Capabilities

### New Capabilities

- `indicator-visibility`: editors hide an indicator from the site, which makes it temporarily unavailable in the public API, and show it again, without a deploy.

### Modified Capabilities

None.

## Impact

- Affected specs: `indicator-visibility` (new).
- Affected code: `services/api` (visibility store and routes, catalog, maps, zones, saved and project zone series, articles), `apps/web` (build-time data, landing, indicators page, explorer, zone page, menus, Content → Indicators, Actions), `packages/api-client` (regenerated).
- API: version 1.18.0, backward compatible: new routes, and a new problem type on the indicator routes' 404.
- Story: #225.
