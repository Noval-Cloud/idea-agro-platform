## ADDED Requirements

### Requirement: The site also hides what it learns is unavailable

The explorer and the zone page SHALL also treat as hidden every indicator that the catalog they load marks unavailable, and every indicator whose maps or values the API answers as temporarily unavailable, in the same disabled state, with the same info button and dialog.

#### Scenario: An indicator is hidden after the site was built

- **WHEN** the explorer or the zone page loads a catalog that marks an indicator unavailable
- **THEN** the page shows it disabled, with an info button, as one hidden at build time

#### Scenario: The API answers a map as unavailable

- **WHEN** a map or values request of an indicator is answered with the problem type `urn:idea-agro:problem:indicator-temporarily-unavailable`
- **THEN** the page stops loading it and shows the indicator disabled, with an info button

#### Scenario: A link names an indicator hidden since the build

- **WHEN** someone opens the explorer or a zone's page with a link that names an indicator the catalog marks unavailable
- **THEN** the page opens on the default indicator, and the hidden one is disabled
