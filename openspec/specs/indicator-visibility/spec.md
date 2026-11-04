# indicator-visibility Specification

## Purpose

Editors hide an indicator while its data is reviewed: the site shows it as temporarily unavailable, and the public API withholds its data. They show it again without a deploy.

## Requirements

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

### Requirement: Each indicator explains why it is unavailable

Each indicator SHALL have an editable text, in Spanish, English and Portuguese, that explains why it is unavailable. By default it SHALL say the indicator is temporarily unavailable while its data is reviewed.

#### Scenario: An editor explains a hidden indicator

- **WHEN** an editor opens an indicator's texts in Content → Indicators
- **THEN** its text on why it is unavailable is listed with its other texts, and is edited and published like them

### Requirement: Changing the switch rebuilds the site

A change of an indicator's switch SHALL reach the site the way a published text does.

#### Scenario: The site rebuilds after the quiet minutes

- **WHEN** an editor shows or hides an indicator
- **THEN** the site is behind, and it is rebuilt once no text or switch has changed for the quiet minutes

#### Scenario: The site rebuilds at once

- **WHEN** an editor changes a switch and then chooses "Update now"
- **THEN** the site's build is asked for at once

### Requirement: The site keeps a hidden indicator, disabled

The site SHALL read which indicators are hidden, and their texts, when it is built. The explorer and the zone page SHALL also treat as hidden every indicator that the catalog they load marks unavailable, and every indicator whose maps or values the API answers as temporarily unavailable. It SHALL keep a hidden indicator wherever it lists it, in Spanish, English and Portuguese (the menus, the indicators page, the explorer's picker, the zone page and the landing), grayed out as disabled, with an info button beside it that opens a dialog with the indicator's text.

#### Scenario: A page built while an indicator is hidden

- **WHEN** the site is built while an indicator is hidden
- **THEN** every page that lists it shows it disabled, with an info button

#### Scenario: An indicator is hidden after the site was built

- **WHEN** the explorer or the zone page loads a catalog that marks an indicator unavailable
- **THEN** the page shows it disabled, with an info button, as one hidden at build time

#### Scenario: The API answers a map as unavailable

- **WHEN** a map or values request of an indicator is answered with the problem type `urn:idea-agro:problem:indicator-temporarily-unavailable`
- **THEN** the page stops loading it and shows the indicator disabled, with an info button

#### Scenario: Someone asks why it is unavailable

- **WHEN** someone activates the info button beside a hidden indicator
- **THEN** a dialog opens with the indicator's name and its text on why it is unavailable
- **AND** closing it returns the focus to the info button

#### Scenario: A disabled indicator is not picked

- **WHEN** someone moves through a list of indicators with the keyboard
- **THEN** the hidden indicator cannot be picked, and its info button is reachable as a button of its own

### Requirement: The site shows none of a hidden indicator's data

The site SHALL show no map, chart or value of a hidden indicator. Where they would be, it SHALL show the same disabled state and info button.

#### Scenario: A page that draws the indicator's data

- **WHEN** a page that draws a hidden indicator's map, chart or values is built
- **THEN** it shows the disabled state and the info button in their place
- **AND** no page shows them first and hides them after

### Requirement: The explorer and the zone page open on a shown indicator

The explorer and the zone page SHALL open on the default indicator: productivity (PPNA), or the first shown indicator while PPNA is hidden, whether it was hidden when the site was built or since.

#### Scenario: A link to the explorer names a hidden indicator

- **WHEN** someone opens the explorer with a link that names a hidden indicator
- **THEN** the explorer opens with the default indicator, and the hidden one is disabled in its picker

#### Scenario: A link to a zone names a hidden indicator

- **WHEN** someone opens a zone's page with a link that names a hidden indicator
- **THEN** the zone page opens on the default indicator, and the hidden one is disabled in its list

#### Scenario: A link names an indicator hidden since the build

- **WHEN** someone opens the explorer or a zone's page with a link that names an indicator the catalog marks unavailable
- **THEN** the page opens on the default indicator, and the hidden one is disabled

### Requirement: The public API withholds a hidden indicator's data

The public API SHALL keep a hidden indicator in the catalog, marked as unavailable, and SHALL leave its values out of the responses that hold several indicators.

#### Scenario: The catalog

- **WHEN** a client reads the catalog while an indicator is hidden
- **THEN** the indicator is in it, marked as unavailable

#### Scenario: Seasonal series

- **WHEN** a client reads a zone's seasonal series, or a member reads a saved or project zone's series, while a seasonal indicator is hidden
- **THEN** the series leave that indicator out

### Requirement: A hidden indicator's data routes say it is temporarily unavailable

The API routes of a hidden indicator's data (its maps, thumbnails, previews and division values) SHALL answer 404 with a problem of type `urn:idea-agro:problem:indicator-temporarily-unavailable`, whose detail says the indicator is temporarily unavailable while its data is reviewed, and SHALL send `Cache-Control: no-store`. 404 says it is temporary; the problem type tells it from a wrong route.

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
