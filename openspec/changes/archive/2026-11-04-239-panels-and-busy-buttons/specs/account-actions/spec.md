## ADDED Requirements

### Requirement: A panel opened for one action closes when it succeeds

A side panel opened for one action (adding an article, editing or deleting an article, choosing the articles an indicator cites) SHALL close when that action succeeds, return to the list it came from, and confirm the action with a toast. Focus SHALL return to what opened the panel, or to the list's search when that is gone.

#### Scenario: An editor adds an article

- **WHEN** an editor fills in a new article in Content → Articles and adds it
- **THEN** the panel closes, the list shows the article, and a toast reads "Article added"
- **AND** focus is back on "Add article"

#### Scenario: An editor saves or deletes an article

- **WHEN** an editor saves changes to an article, or deletes it after confirming
- **THEN** the panel closes and a toast reads "Article saved" or "Article deleted"

#### Scenario: An editor chooses an indicator's articles

- **WHEN** an editor picks two articles in an indicator's article picker and adds them
- **THEN** the picker closes once they are saved, the indicator lists them, and a toast reads "You added 2 articles"

### Requirement: A panel with several actions stays open after each one

A side panel holding several actions (a site text's draft, publish, discard, restore and return to the default; a user's roles, sessions, access and recovery link) SHALL stay open after each action succeeds, and SHALL confirm each one with the same toast.

#### Scenario: An editor publishes a text

- **WHEN** an editor publishes a site text from its panel
- **THEN** the panel stays open with the text as published, and a toast confirms it

#### Scenario: An admin saves a user's roles

- **WHEN** an admin saves the roles of another user from their panel
- **THEN** the panel stays open with the roles saved, and a toast reads "Roles saved"

### Requirement: A failed action keeps its panel open

When an account action fails, its panel SHALL stay open and SHALL show the error where the panel shows errors, with what was typed kept. While the action runs, the panel SHALL ignore requests to close it (its close button, Escape and a click outside). No toast SHALL be shown for a failure.

#### Scenario: Saving an article fails

- **WHEN** the API refuses or does not answer while an editor saves an article
- **THEN** the panel stays open, its footer says the change could not be saved, and the form keeps the editor's values

#### Scenario: Adding articles to an indicator fails

- **WHEN** saving the articles chosen in an indicator's picker fails
- **THEN** the picker stays open with its choice, and its footer says the change could not be saved

#### Scenario: Closing while a save runs

- **WHEN** an editor presses Escape or clicks outside the article picker while its articles are being saved
- **THEN** the picker stays open until the save answers, and shows its error if it fails

### Requirement: The account confirms with one toast

The account SHALL confirm every successful action with one toast component, over any panel: announced to screen readers through `role="status"`, gone after five seconds unless hovered or focused, and drawn from the design tokens in light and dark. Its messages SHALL be site texts in Spanish, English and Portuguese.

#### Scenario: A screen reader hears the confirmation

- **WHEN** an editor using a screen reader saves a draft of a text
- **THEN** the screen reader announces "Draft saved." without moving focus

#### Scenario: The toast goes by itself

- **WHEN** a toast appears and the person neither hovers nor focuses it
- **THEN** it is gone after five seconds

### Requirement: The toast sits at the bottom and can be closed

The toast SHALL sit at the bottom of the screen: in its right corner on larger screens, and across its width on phones. Every toast SHALL have a visible close button with an X icon, named by a site text, so a person closes a toast that hides something.

#### Scenario: A toast on a phone

- **WHEN** an editor publishes a text on a phone
- **THEN** the toast appears at the bottom of the screen, over the panel

#### Scenario: A person closes a toast

- **WHEN** a toast hides a button the person wants, and they press its close button
- **THEN** the toast is gone and the button can be used

### Requirement: The account's other confirmations use the toast

An invitation sent, resent or deleted, a project deleted, an area renamed or deleted, areas imported from a file, and an indicator's articles reordered or put back SHALL be confirmed with the toast. Removing an article from an indicator SHALL keep its line under the list, with its Undo.

#### Scenario: An invitation is sent

- **WHEN** a person sends an invitation from Invitations
- **THEN** the dialog closes and a toast reads "Invitation sent to" the address

#### Scenario: An area is deleted

- **WHEN** a person deletes an area from My areas after confirming
- **THEN** the area leaves the list and a toast reads "Area deleted."

### Requirement: Buttons show when their action is running

The shared `Button` SHALL have a busy state: while its action runs it SHALL be disabled, show a spinner inside it and keep its width and accessible name. Every account button that starts a request SHALL use it, and only the button whose action runs SHALL show the spinner.

#### Scenario: Publishing shows a spinner

- **WHEN** an editor presses "Publish" in a text's panel
- **THEN** "Publish" shows a spinner at its same width until the API answers, and the panel's other actions are disabled meanwhile

#### Scenario: An admin ends a user's sessions

- **WHEN** an admin confirms ending a user's sessions
- **THEN** only "End their sessions" shows the spinner while the request runs
