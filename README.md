# IDEA-Agro

Open platform of environmental and productive indicators for Uruguay's agricultural land (_Indicadores de DEsempeño Ambiental del sector Agropecuario_). The indicators are computed from satellite imagery and backed by research from INIA, Udelar and the University of Buenos Aires.

## Layout

| Folder            | What it holds                                                   |
| :---------------- | :-------------------------------------------------------------- |
| `apps/web`        | The website (Astro)                                             |
| `services/api`    | The API (Python)                                                |
| `services/<job>`  | Data jobs: Earth Engine exports, updates, on-demand zone values |
| `gee/`            | Earth Engine scripts and asset documentation                    |
| `infrastructure/` | Terraform, project setup and environments                       |
| `docs/`           | Project documentation                                           |

The folders are added as their parts arrive.

## Requirements

| Tool     | Version  | Pinned in                                                              |
| :------- | :------- | :--------------------------------------------------------------------- |
| Node.js  | 24 (LTS) | `.node-version`, `engines` in `package.json`                           |
| pnpm     | 12.15    | `packageManager` in `package.json` (pnpm switches to it automatically) |
| Python   | 3.15     | `.python-version` (uv downloads it when missing)                       |
| uv       | 0.13     | `required-version` in `pyproject.toml`                                 |
| GNU Make | any      |                                                                        |

No version manager is needed: each tool reads its own pin.

## Commands

Everything runs from the root through `make`; `make` alone lists the targets.

| Command          | What it does                                            |
| :--------------- | :------------------------------------------------------ |
| `make setup`     | Install every dependency (`pnpm install`, `uv sync`)    |
| `make lint`      | Check formatting and lint rules, without changing files |
| `make format`    | Format every file in place                              |
| `make typecheck` | Type-check TypeScript and Python                        |
| `make test`      | Run every test suite                                    |
| `make check`     | `lint`, `typecheck` and `test`: what CI runs            |

Targets only delegate to each language's tools (`vp`, `uv`, `terraform`); logic longer than one line goes to `scripts/`.

Infrastructure targets follow one convention:

- `ENV` names the environment and must be `dev`, `qa` or `prd`.
- Destructive targets ask for confirmation, unless `YES=1` is set (for agents and CI).

## Workflow

[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow): every change goes in its own branch and reaches `main` through a reviewed pull request. `main` is always deployable.

## License

[MIT](LICENSE).
