## MODIFIED Requirements

### Requirement: The Resources page lists the reference framework

The Science section of the Resources page SHALL show, under its lead, one card for each article marked as framework, newest first, and the cards SHALL scroll with the page. Each card SHALL show the article's title at body size, its short citation and a link that reads "Read the article", whether it opens the article's link or its DOI. Framework articles SHALL stay out of the list of articles that back the indicators.

#### Scenario: Several framework articles

- **WHEN** editors mark three articles as framework and the site is rebuilt
- **THEN** the section shows three cards under its lead, newest first, each with its title, a citation such as "Paruelo et al. 2024" and its link
- **AND** none of them appears in the list of articles that back the indicators

#### Scenario: Short citations

- **WHEN** a framework article has one author, two, or three or more
- **THEN** it is cited by the first author's surname and the year, with the second author's surname when there are two, or "et al." when there are three or more: "Monteith 1972", "Cazzuli & Paruelo 2023" or "Paruelo et al. 2025"

#### Scenario: A framework article with only a DOI

- **WHEN** one framework article has a link and another has only a DOI
- **THEN** both cards' links read "Read the article", and open the article's link and its DOI

#### Scenario: No framework article

- **WHEN** no article is marked as framework
- **THEN** the Science section shows no framework card

### Requirement: The article form says where a framework article shows

The framework checkbox in the article form SHALL have a hint saying the article is shown on Resources in a card of its own, as the reference framework, in Spanish, English and Portuguese, and editable as a site text.

#### Scenario: An editor reads the checkbox

- **WHEN** an editor opens an article in Content → Articles
- **THEN** the framework checkbox reads "Shown on Resources in a card of its own, as the reference framework" under its label

## ADDED Requirements

### Requirement: The Science section's lead points to the framework

The Science section's lead SHALL say that the indicators follow the reference framework of the works right below it, in Spanish, English and Portuguese, and editable as a site text. No "Reference framework" label card SHALL stand between the lead and the cards.

#### Scenario: A visitor reads the lead

- **WHEN** a visitor opens the Resources page
- **THEN** the Science section's lead says the indicators follow the reference framework of the works below it, and the framework cards follow it
