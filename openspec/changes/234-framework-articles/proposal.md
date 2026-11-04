## Why

The team's reference framework is three documents, but the Resources page shows only one: its "Reference framework" card takes the first article marked as framework, and drops the others from the page. Each entry takes about 190 px of that sticky card, so three already overflow it on a 1280×720 screen. The article form's checkbox, "It is the reference framework the indicators follow", does not say what it changes or where.

## What Changes

- **Card:** the "Reference framework" card on the Resources page lists every article marked as framework, newest first. With none, the card is not shown.
- **Entries:** each shows its title at body size, a short citation on one line ("Paruelo et al. 2024", as the audit log cites articles) and its link, so five fit in the card on a 1280×720 screen.
- **Short citation:** the audit log and the card share one way to cite an article in short, each with its own editable texts.
- **Backing list:** framework articles stay out of the list of articles that back the indicators.
- **Form:** the article form's framework checkbox has a hint, "Shown on Resources, under Reference framework", in every locale and editable as a site text.

## Impact

- Story: #234
- Affected specs: `reference-framework` (added).
- Affected code: `apps/web` (Resources page's Science section, the article form, the audit log, the catalogs), `services/api/src/idea_agro_api/site_texts.json` (generated).
