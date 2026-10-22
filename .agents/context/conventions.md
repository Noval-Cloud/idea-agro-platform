# Conventions

How code and text are written in this repository. The work process (stories, branches, pull requests) is in [workflow.md](workflow.md).

## Language

- **Everything in the repository is in English:** code, identifiers, comments, documentation, specs, commit messages, pull requests, issues and the agents' plans.
- The exceptions are proper nouns, the Spanish glossary in [domain.md](domain.md), and user-facing text in other languages, which lives in the website's message catalogs (see "Website").

## Comments

- **Short:** one line, two at most, and only where the reason is not obvious from the code.
- **No history in the code:** what failed, incidents and how a decision was reached go in the commit message, the OpenSpec change or the docs.

## Documentation

- **Docs hold decisions and how to work, never state.** What exists and how far along it is live on the board and in the repository itself; a copy in the docs goes stale.
- **One README at the root, and one in each important part,** such as `infrastructure/`. A part's README says how it is laid out and how to work on it.
- **A part starts as a section of its parent's README.** When that section grows, it moves into the README of the part's own folder.
- **The parent keeps a summary** of the part that moved, and points to its README for the detail.
- **A directory tree shows only the important folders and files,** never the full structure.

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

- Dependencies are pinned to exact versions in the pnpm catalog, `pnpm-lock.yaml` and `uv.lock`. The toolchain pins (Node, pnpm, Python, uv) are listed in the README.

## Secrets and configuration

- No secret values in any file of the repository. Configuration refers to secrets by their Secret Manager name.
- Local overrides go in `.env` files, which git ignores.

## Commits

- Commit messages follow Conventional Commits (`type(scope): description`).
- Branches, pull requests and how commits reference their story are in [workflow.md](workflow.md).
