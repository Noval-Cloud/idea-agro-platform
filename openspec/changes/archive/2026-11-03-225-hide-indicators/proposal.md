## Why

Some indicators read Earth Engine assets that the team is fixing. Until they are fixed, those indicators' maps and values should not be published, and editors need to hide an indicator and bring it back without a deploy. The site keeps the indicator where it is and says it is temporarily unavailable, so nothing else on the site changes.

## What Changes

- **The switch:** each indicator's panel in Content → Indicators has a "Shown on the site" switch. The list marks the hidden indicators, and every change is audited (`indicator_hidden`, `indicator_shown`) and shown in Actions. Editors keep editing a hidden indicator's texts and articles.
- **Its explanation:** each indicator has a new editable text, `indicators.items.<id>.unavailable` (Markdown), in Spanish, English and Portuguese, that says why it is unavailable. By default it says it is temporarily unavailable while its data is reviewed. Editors edit it in the indicator's panel, like its other texts.
- **Where it is kept:** the content database, one record per indicator switched (`indicator_visibility`); an indicator without one is shown.
- **API, for editors:** `GET /v1/indicators/visibility` lists every indicator with whether it is shown, and `PUT /v1/indicators/{indicator}/visibility` changes it. A change marks the site behind, as a text's publish does, so the data job's `site` task rebuilds it after the quiet minutes, or "Update now" at once.
- **API, public:**
  - The catalog keeps a hidden indicator, with `unavailable: true`. The website reads it when it is built.
  - A zone's seasonal series, and a saved or project zone's series, leave a hidden indicator's values out.
  - A hidden indicator's maps (`/v1/maps/{indicator}/...`) and division values (`/v1/divisions/{division}/values/{indicator}`) answer 404 with the problem type `urn:idea-agro:problem:indicator-temporarily-unavailable`, and `Cache-Control: no-store`. 404 says it is temporary, and the type tells it from a wrong route.
  - While an indicator is hidden, the catalog and the series are cacheable for a minute instead of an hour, so it comes back soon after it is shown.
  - The API keeps the switch's state for a few seconds per instance, so maps do not read the database on every request.
- **Website:** the build reads which indicators are unavailable from the catalog, and their texts, as it reads every text. A hidden indicator stays wherever the site lists it (the menus, the indicators page, the explorer's picker, the zone page and the landing), grayed out as disabled, with an info button beside it that opens a dialog with its text. None of its data is shown: where its map, chart or value would be, the same disabled state and info button stand instead. The PPNA download is not published while PPNA is hidden.
- **Defaults:** the explorer and the zone page open on PPNA, or the first shown indicator while PPNA is hidden. A link that names a hidden indicator opens the default one, with the hidden one disabled.
- **Zone page:** its indicators become a group of radio buttons instead of tabs, so a hidden indicator's info button can sit beside it.
- **Data job:** unchanged. It keeps computing every indicator, hidden or not.

## Capabilities

### New Capabilities

- `indicator-visibility`: editors hide an indicator while its data is reviewed, the site shows it as temporarily unavailable and the public API withholds its data, and they show it again, without a deploy.

### Modified Capabilities

None.

## Impact

- Affected specs: `indicator-visibility` (new).
- Affected code: `services/api` (visibility store and routes, catalog, maps, zones, saved and project zone series), `apps/web` (texts, build-time data, landing, indicators page, resources page, explorer, zone page, menus, Content → Indicators, Actions), `packages/api-client` (regenerated).
- API: version 1.18.0, backward compatible: new routes, a new optional field in the catalog, and a new problem type on the indicator routes' 404.
- Story: #225.
