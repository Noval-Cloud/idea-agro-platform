## Why

Saving an article keeps its side panel open, and the only sign that a save is running is a disabled button. Panels and buttons behave differently across Content and Administration: some confirm with a line in the panel, some with a line under the list, and some not at all.

## What Changes

- **Single-action panels** (adding or editing an article, choosing an indicator's articles) close when their action succeeds and return to the list, and a toast confirms it: "Article added", "Article saved", "Article deleted", "You added 2 articles".
- **Multi-action panels** (a site text's draft, publish, discard and restore; a user's roles, sessions, access and recovery) stay open after each action, and each one confirms with the same toast.
- **The account's other confirmations** move to the toast too: an invitation sent or resent, areas imported from a file, an indicator's articles reordered or put back. Removing an article from an indicator keeps its line under the list, because that line holds its Undo.
- **On failure** the panel stays open and shows the error where it does today. The article picker, which closed before its save, now waits for it and shows a failure in its footer.
- **One toast for the account:** at the bottom of the screen, in its right corner on larger screens and across it on phones, with a visible close button. It is announced to screen readers through `role="status"`, gone after five seconds (held while hovered or focused), in light and dark. Its messages are site texts in Spanish, English and Portuguese.
- **The shared `Button` gets a busy state:** while its action runs it is disabled and shows a spinner inside it, keeping its width and its accessible name. Every account button that starts a request uses it, which retires the "Saving…", "Creating…" and "Inviting…" labels.

## Impact

- Story: #239
- Affected specs: `account-actions` (added).
- Affected code: `apps/web` (the `Button` and a new toast in `components/ui`, the account island and its panels, the catalogs, the design tokens' layers), `services/api/src/idea_agro_api/site_texts.json` (generated).
