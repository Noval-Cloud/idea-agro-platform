## ADDED Requirements

### Requirement: The Resources page lists the reference framework

The Resources page SHALL show a "Reference framework" card that lists every article marked as framework, newest first. Each entry SHALL show the article's title at body size, its short citation on one line (the first author's surname, "et al." when it has several authors, and the year) and its link. Five entries SHALL fit in the card on a 1280×720 screen. Framework articles SHALL stay out of the list of articles that back the indicators.

#### Scenario: Several framework articles

- **WHEN** editors mark three articles as framework and the site is rebuilt
- **THEN** the card lists the three, newest first, each with its title, a citation such as "Paruelo et al. 2024" and its link
- **AND** none of them appears in the list of articles that back the indicators

#### Scenario: No framework article

- **WHEN** no article is marked as framework
- **THEN** the Resources page shows no "Reference framework" card

### Requirement: The article form says where a framework article shows

The framework checkbox in the article form SHALL have a hint saying the article is shown on Resources, under Reference framework, in Spanish, English and Portuguese, and editable as a site text.

#### Scenario: An editor reads the checkbox

- **WHEN** an editor opens an article in Content → Articles
- **THEN** the framework checkbox reads "Shown on Resources, under Reference framework" under its label
