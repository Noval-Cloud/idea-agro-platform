## MODIFIED Requirements

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
