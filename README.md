# IDEA-Agro

Open platform of environmental and productive indicators for Uruguay's agricultural land (_Indicadores de DEsempeño Ambiental del sector Agropecuario_). The indicators are computed from satellite imagery and backed by research from INIA, Udelar and the University of Buenos Aires.

## Layout

| Folder            | What it holds                                                                 |
| :---------------- | :---------------------------------------------------------------------------- |
| `apps/web`        | The website (Astro)                                                           |
| `packages/`       | Shared TypeScript packages, such as the API client                            |
| `services/api`    | The API (Python)                                                              |
| `services/<job>`  | Data jobs: Earth Engine exports, updates, on-demand zone values               |
| `gee/`            | Earth Engine scripts and asset documentation                                  |
| `infrastructure/` | Terraform, project setup and environments                                     |
| `scripts/`        | Helper scripts that `make` targets and agents run                             |
| `openspec/`       | Living specs and the change of every story                                    |
| `.agents/`        | Context, roles and skills for coding agents (start at [AGENTS.md](AGENTS.md)) |
| `docs/`           | Project documentation                                                         |

Folders are added as their parts arrive.

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

| Command          | What it does                                                                |
| :--------------- | :-------------------------------------------------------------------------- |
| `make setup`     | Install every dependency from the lockfiles                                 |
| `make lint`      | Check formatting and lint rules, without changing files                     |
| `make format`    | Format every file in place                                                  |
| `make typecheck` | Type-check TypeScript and Python                                            |
| `make test`      | Run every test suite                                                        |
| `make specs`     | Validate the OpenSpec changes and specs                                     |
| `make check`     | `lint`, `typecheck`, `test` and `specs`: the gate before every pull request |

Targets only delegate to each language's tools (`vp`, `uv`, `terraform`); logic longer than one line goes to `scripts/`.

Infrastructure targets follow one convention:

- `ENV` names the environment and must be `dev`, `qa` or `prd`.
- Destructive targets ask for confirmation, unless `YES=1` is set (for agents and CI).

## Workflow

Work comes from the project board as user stories, and every story reaches `main` through one reviewed pull request ([GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow)). The full process is in [.agents/context/workflow.md](.agents/context/workflow.md).

## License

[MIT](LICENSE).
