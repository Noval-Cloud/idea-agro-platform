# IDEA-Agro

Open platform of environmental and productive indicators for Uruguay's agricultural land (*Indicadores de DEsempeño Ambiental del sector Agropecuario*). The indicators are computed from satellite imagery and backed by research from INIA, Udelar and the University of Buenos Aires.

## Layout

| Folder | What it holds |
| :-- | :-- |
| `apps/web` | The website (Astro) |
| `services/api` | The API (Python) |
| `services/<job>` | Data jobs: Earth Engine exports, updates, on-demand zone values |
| `gee/` | Earth Engine scripts and asset documentation |
| `infrastructure/` | Terraform, project setup and environments |
| `docs/` | Project documentation |

The folders are added as their parts arrive.

## Requirements

| Tool | Version | Pinned in |
| :-- | :-- | :-- |
| Node.js | 24 (LTS) | `.node-version`, `engines` in `package.json` |
| pnpm | 12.15 | `packageManager` in `package.json` (pnpm switches to it automatically) |
| Python | 3.15 | `.python-version` (uv downloads it when missing) |
| uv | 0.13 | `required-version` in `pyproject.toml` |
| GNU Make | any | |

No version manager is needed: each tool reads its own pin.

## Workflow

[GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow): every change goes in its own branch and reaches `main` through a reviewed pull request. `main` is always deployable.

## License

[MIT](LICENSE).
