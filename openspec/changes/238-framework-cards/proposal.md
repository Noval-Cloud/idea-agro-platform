## Why

After #234, the Resources page shows the three reference framework articles inside one "Reference framework" card, while the section's lead above it already speaks of the framework. The links also differ: an article with a link says "Read the article", and one with only a DOI says "DOI", although both open the article.

## What Changes

- **Lead:** the Science section's lead says plainly that the indicators follow the reference framework of the works right below it, in every locale and editable as a site text. The "Reference framework" label card goes away.
- **Cards:** each framework article has a card of its own, stacked under the lead in the section's left column, newest first: its title, its short citation and its link. The cards are not sticky, so the "five entries fit the card" limit no longer applies.
- **Link:** every framework card's link reads "Read the article", whether it opens the article's link or its DOI. The card-only "DOI" text goes away.
- **Papers list:** the list of articles that back the indicators stays as it is.

## Impact

- Story: #238
- Affected specs: `reference-framework` (modified).
- Affected code: `apps/web` (Resources page's Science section, the catalogs), `services/api/src/idea_agro_api/site_texts.json` (generated).
