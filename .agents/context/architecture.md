# Architecture

The parts of the platform, how data flows between them, and what exists today. The domain words used here are defined in [domain.md](domain.md).

## Status

The repository is being built in stages (the project board's **Stage** field). Today it holds the tooling and the agent setup only. The parts below marked *planned* do not exist yet. Their decisions are taken, and each one arrives through its own stories.

## Parts

| Part | Folder | Stack | Status |
| :-- | :-- | :-- | :-- |
| Website | `apps/web` | Astro (static output), React islands, Tailwind, MapLibre GL | Planned (stage 0) |
| API | `services/api` | Python, FastAPI, on Cloud Run. Its OpenAPI document generates the website's typed client (Orval) | Planned (stage 1) |
| Data jobs | `services/<job>` | Python, on Cloud Run jobs. They export from Earth Engine, compute zone values and refresh caches | Planned (stage 1) |
| Earth Engine | `gee/` | Scripts and the documentation of the indicator assets | Planned |
| Infrastructure | `infrastructure/` | Terraform for every GCP resource, Cloud Build for CI/CD | Planned (stage 0) |

## Data flow

1. **Earth Engine holds the source data:** the indicator rasters and the geometries of the predefined zones. When the team publishes a new period or corrects a geometry, the assets change.
2. **BigQuery holds every value of every zone,** one row per zone, indicator and period. The values feed the zone pages, the dashboards, the alerts, the reports and the assistant, all of which query zones together with SQL.
   - **Divisions** (police districts, basins) are updated eagerly. On each asset update, Earth Engine computes the new period for all of them and exports the rows to BigQuery.
   - **Padrones and user zones** are computed on demand. They get their full history when added to a project, and missing periods are filled in when the zone is viewed.
   - A zone used by an alert, a scheduled report or a project dashboard is kept fresh automatically. Every series records the last period it covers.
   - Values of padrones and user zones that no project holds are deleted after a while, and recomputed if added again.
3. **Cloud Storage keeps a fast copy per zone** for its page. It is generated from BigQuery when the zone is first opened and regenerated when it falls behind. Cloud Storage also keeps simplified geometries of the divisions, regenerated when an Earth Engine asset changes.
4. **Firestore keeps the structure:** projects, members, the zones in each project, and each zone's count of alerts and reports.
5. **The API** serves all of the above to the website and to other applications through its OpenAPI contract.

## Constraints

- Everything runs on GCP, within free tiers wherever possible, with no managed SQL instance for now.
- The accepted costs are the Vertex AI models behind the content assistant.
- The backend hides each store behind its own interfaces, so a store can be replaced without changing the API.
