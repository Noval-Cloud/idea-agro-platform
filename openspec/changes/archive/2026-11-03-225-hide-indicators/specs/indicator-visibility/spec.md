## ADDED Requirements

### Requirement: Editors show or hide each indicator

Each indicator's panel in Content → Indicators SHALL have a "Shown on the site" switch that editors and admins change. An indicator is shown until an editor hides it. Every change SHALL be recorded in Actions, and editors SHALL keep seeing and editing a hidden indicator's texts and articles.

#### Scenario: An editor hides an indicator

- **WHEN** an editor turns off "Shown on the site" in an indicator's panel
- **THEN** the indicator is hidden
- **AND** the list of indicators marks it as hidden
- **AND** Actions records who hid it and when

#### Scenario: An editor shows it again

- **WHEN** an editor turns the switch of a hidden indicator back on
- **THEN** the indicator is shown, and Actions records who showed it and when

#### Scenario: Only editors change it

- **WHEN** a signed-in person who is neither editor nor admin asks to change an indicator's switch
- **THEN** the API refuses with 403, and nothing changes

#### Scenario: A hidden indicator stays editable

- **WHEN** an indicator is hidden
- **THEN** editors still see and change its texts, and see and change the articles it cites

### Requirement: Changing the switch rebuilds the site

A change of an indicator's switch SHALL reach the site the way a published text does.

#### Scenario: The site rebuilds after the quiet minutes

- **WHEN** an editor shows or hides an indicator
- **THEN** the site is behind, and it is rebuilt once no text or switch has changed for the quiet minutes

#### Scenario: The site rebuilds at once

- **WHEN** an editor changes a switch and then chooses "Update now"
- **THEN** the site's build is asked for at once

### Requirement: The site leaves hidden indicators out

The site SHALL read which indicators are shown when it is built, and SHALL leave a hidden indicator out of every page in Spanish, English and Portuguese: the landing's journey, the indicators page's atlas, the explorer's picker, the zone page and the menus. A journey chapter drawn from a hidden indicator's data SHALL be left out with it.

#### Scenario: A page built while an indicator is hidden

- **WHEN** the site is built while an indicator is hidden
- **THEN** no page lists it, links to it or shows its map or values
- **AND** no page shows it first and hides it after

#### Scenario: A link to the explorer names a hidden indicator

- **WHEN** someone opens the explorer with a link that names a hidden indicator
- **THEN** the explorer opens with the default indicator: productivity (PPNA), or the first shown indicator while PPNA is hidden

#### Scenario: A link to a zone names a hidden indicator

- **WHEN** someone opens a zone's page with a link that names a hidden indicator
- **THEN** the zone page opens on the default indicator

### Requirement: The public API leaves hidden indicators out of every list

The public API SHALL leave a hidden indicator out of the catalog and of every response that lists indicators.

#### Scenario: The catalog

- **WHEN** a client reads the catalog while an indicator is hidden
- **THEN** neither its indicators nor its seasonal calendars hold the hidden indicator

#### Scenario: Seasonal series

- **WHEN** a client reads a zone's seasonal series, or a member reads a saved or project zone's series, while a seasonal indicator is hidden
- **THEN** the series leave that indicator out

#### Scenario: The indicators shown and the articles' citations

- **WHEN** a client reads the shown indicators or the published articles while an indicator is hidden
- **THEN** the hidden indicator is neither among the shown indicators nor among the articles' citations

### Requirement: A hidden indicator's routes say it is temporarily unavailable

The API routes of a hidden indicator (its maps, thumbnails, previews and division values) SHALL answer 404 with a problem of type `urn:idea-agro:problem:indicator-temporarily-unavailable`, whose detail says the indicator is temporarily unavailable while its data is reviewed, and SHALL send `Cache-Control: no-store`. 404 says it is temporary; the problem type tells it from a wrong route.

#### Scenario: A client asks for a hidden indicator's map

- **WHEN** a client asks for a map, thumbnail, preview or division values of a hidden indicator
- **THEN** the API answers 404 with the problem type `urn:idea-agro:problem:indicator-temporarily-unavailable`
- **AND** the answer carries `Cache-Control: no-store`

#### Scenario: The indicator is shown again

- **WHEN** an editor shows the indicator again
- **THEN** within seconds its routes answer with its data, as before it was hidden

#### Scenario: A wrong route

- **WHEN** a client asks for an indicator that does not exist, or a year an indicator has no map for
- **THEN** the answer's problem type is not `urn:idea-agro:problem:indicator-temporarily-unavailable`

### Requirement: The data job keeps computing hidden indicators

The data job SHALL compute and publish every indicator whether it is shown or hidden, so a hidden indicator's data is ready when it is shown again.

#### Scenario: The job runs while an indicator is hidden

- **WHEN** the data job runs while an indicator is hidden
- **THEN** it computes and writes that indicator's maps and values as for a shown one
