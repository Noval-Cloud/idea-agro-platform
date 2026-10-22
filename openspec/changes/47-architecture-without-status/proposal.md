## Why

`architecture.md` keeps a status of what exists, and it goes stale with every part that arrives. What exists, and how far along it is, is already on the board and in the repository itself.

## What Changes

- Remove the Status section, the Status column and "what exists today" from `.agents/context/architecture.md`.
- Describe `architecture.md` in `AGENTS.md` without "what exists today".
- In `conventions.md`, the READMEs section becomes Documentation. It says that the docs hold decisions and how to work, never what exists or how far along it is, and that a README's directory tree shows only the important folders and files.

## Impact

- Affected specs: none.
- Affected code: `.agents/context/architecture.md`, `.agents/context/conventions.md`, `AGENTS.md`.
- Story: #47.
