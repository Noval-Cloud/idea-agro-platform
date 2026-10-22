# Conventions

How code and text are written in this repository. The work process (stories, branches, pull requests) is in [workflow.md](workflow.md).

## Language

- **Everything in the repository is in English:** code, identifiers, comments, documentation, specs, commit messages, pull requests, issues and the agents' plans.
- The only exception is user-facing text in other languages, which lives in the website's message catalogs (see "Website").

## Comments

- **Short:** one line, two at most, and only where the reason is not obvious from the code.
- **No history in the code:** what failed, incidents and how a decision was reached go in the commit message, the OpenSpec change or the docs.

## Website (TypeScript)

- **No text in components.** Every user-facing string lives in a typed per-locale catalog (Spanish, English and Brazilian Portuguese) and is read through `t("area.key", values)`, with checked keys, `{placeholder}` interpolation and plurals through `Intl.PluralRules`.
- **Light and dark mode,** always.
- **Every visual value comes from design tokens:** colors, spacing, radii, type sizes, shadows, durations. Tokens are layered: primitive → semantic (light and dark) → Tailwind theme. No loose values in CSS or components.
- **Charts follow data-visualization rules:**
  - a legend whenever there are two or more series;
  - identity never carried by color alone;
  - color palettes validated for color-vision deficiency;
  - a table view of the data;
  - keyboard access.
- **Accessibility and performance:** Lighthouse close to 100 in every category on every page.
- Formatting and lint come from Vite+ (`vp fmt`, `vp lint`), with the settings in `vite.config.ts`.

## Python

- Typed code that passes **pyright in strict mode**.
- Ruff formats and lints; the settings live in the root `pyproject.toml`.
- Tests use pytest and sit next to the code of each service.
- Each service is a member of the uv workspace, with its own `pyproject.toml`.

## Dependencies

- Versions are pinned exactly: the pnpm catalog and lockfile, `uv.lock`, the tool pins listed in the README.
- New versions are adopted at least two weeks after their release.

## Secrets and configuration

- No secret values in any file of the repository. Configuration refers to secrets by their Secret Manager name.
- Local overrides go in `.env` files, which git ignores.

## Commits and pull requests

- **Conventional Commits** (`type(scope): description`) for commit messages and pull request titles. A squash merge makes the pull request title the commit on `main`.
- Every commit of a story references it: `Refs #<story>`.
- Run `make check` before opening a pull request. It is what CI runs.
