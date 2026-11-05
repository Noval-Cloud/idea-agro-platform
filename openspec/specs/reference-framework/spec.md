# reference-framework Specification

## Purpose

Editors mark the articles of the reference framework the indicators follow, and the Resources page lists them apart from the articles that back each indicator.

## Requirements

### Requirement: The Resources page lists the reference framework

The Resources page SHALL show a "Reference framework" card that lists every article marked as framework, newest first. Each entry SHALL show the article's title at body size, its short citation on one line (the first author's surname and the year, with the second author's surname when there are two, or "et al." when there are three or more) and its link. Five entries SHALL fit in the card on a 1280×720 screen. Framework articles SHALL stay out of the list of articles that back the indicators.

#### Scenario: Several framework articles

- **WHEN** editors mark three articles as framework and the site is rebuilt
- **THEN** the card lists the three, newest first, each with its title, a citation such as "Paruelo et al. 2024" and its link
- **AND** none of them appears in the list of articles that back the indicators

#### Scenario: Short citations

- **WHEN** a framework article has one author, two, or three or more
- **THEN** it is cited as "Monteith 1972", "Cazzuli & Paruelo 2023" or "Paruelo et al. 2025"

#### Scenario: No framework article

- **WHEN** no article is marked as framework
- **THEN** the Resources page shows no "Reference framework" card

### Requirement: The article form says where a framework article shows

The framework checkbox in the article form SHALL have a hint saying the article is shown on Resources, under Reference framework, in Spanish, English and Portuguese, and editable as a site text.

#### Scenario: An editor reads the checkbox

- **WHEN** an editor opens an article in Content → Articles
- **THEN** the framework checkbox reads "Shown on Resources, under Reference framework" under its label
