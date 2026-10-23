# API

The public, read-only API of IDEA-Agro: FastAPI on Cloud Run. Any site or app may call it, with no key; the website is one of its clients.

## Contract

- `openapi.json` is the contract. `make generate` writes it from the code, and `make check` fails when it is out of date.
- `packages/api-client` is generated from it with Orval: typed functions, TanStack Query hooks and Zod schemas.
- A running API documents itself at `/docs` (Swagger UI) and `/redoc`.
- Every endpoint, parameter and field carries a description, with its unit where it has one. Operation ids are the route functions' names, so generated clients keep their names.

## Versions

- The major version is part of the path: `/v1/...`.
- Within a major version every change is backward compatible: new endpoints, new optional fields, new values in a response. Clients ignore the fields they do not know.
- Breaking changes ship as a new major version, such as `/v2/...`. Breaking means removing or renaming an endpoint, a field or an enum value; making an optional field required; changing a type or a unit. The previous version keeps answering through a deprecation period, announced in the `Deprecation` and `Sunset` response headers.
- `API_VERSION` in `app.py` is the document's `info.version`, in semantic versioning: patch for documentation, minor for backward-compatible additions, major only together with a new path prefix.
- `make contract` compares `openapi.json` with `main`'s using oasdiff (`scripts/check-breaking.sh`): it prints the changelog and fails on any change that breaks existing clients, such as a removed path or a new required field. Removing something takes a deprecation first, or a new major version.
- A change to `openapi.json` shows up in the pull request; reviewing it against these rules is part of the review.

## Signing in

Only the routes about the caller's own account, zones and projects are private. They take a token from the sign-in provider in `Authorization: Bearer <token>`.

- **Verification:** tokens are checked as standard OIDC JWTs, with signature, issuer, audience and expiry, using `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL`. No provider SDK is involved, so another provider means other values.
- **Routes:** they declare `CallerDep` (`deps.py`) and never learn how sign-in works.
- **Accounts:**
  - they are created on the first authenticated request;
  - their id derives from the provider identity, and that identity is a field linked to it;
  - they live behind an `AccountStore`: `RECORDS_SOURCE` is `firestore://<database>` or `memory://` (with `ALLOW_MEMORY_RECORDS=1`, for local runs only).
- **Roles:** every account is `client`, and `editor` and `admin` combine on top of it.
- **"Log out everywhere":**
  - it revokes the provider's sessions through `IdentityAdmin` (`IDENTITY_ADMIN` is `identity-platform://<project>` or `none`);
  - it stamps the account, so tokens from an earlier sign-in (their `auth_time`) are refused at once, refreshed or not;
  - a disabled account is refused.
- **Limits and headers:** private routes are limited to `PRIVATE_REQUESTS_PER_MINUTE` per client and instance (60 by default). Every response carries security headers.

## Saved zones

A person's library of zones, apart from any project, under `/v1/saved-zones` (private).

- **Checks on save:** the outline must be a valid Polygon or MultiPolygon that touches Uruguay. Its geodesic area, bounding box and department (from the police districts in `divisions/seccionales.geojson` of `ZONES_SOURCE`) are computed on save.
- **Storage:**
  - each version of an outline is an immutable GeoJSON file, behind a `GeometryStore`: `GEOMETRIES_SOURCE` is `gs://<bucket>` (private, reachable only by the API) or `memory://`;
  - the metadata lives in the records store (`RECORDS_SOURCE`).
- **Import:** `POST /v1/saved-zones/import` saves up to `ZONES_PER_IMPORT` zones (100) at once, all or none.
- **Limits:** `SAVED_ZONES_PER_ACCOUNT` (500), `GEOMETRY_MAX_BYTES` (1 MB) and `IMPORT_MAX_BYTES` (5 MB).
- **Privacy:** another person's zone answers 404, as if it did not exist.

## Errors

Every error is a Problem Details object (RFC 9457) served as `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, and `errors` for invalid parameters.

## Running it

```bash
make api-dev    # http://localhost:8080, serving the website's prototype data
```

With it running, `pnpm dev` in `apps/web` reads from it. Private routes answer 503 until `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL` are set; for a run without Firestore, set `RECORDS_SOURCE=memory://` and `ALLOW_MEMORY_RECORDS=1`. Tests run in `make test`, against local files shaped like the bucket.

## Data

The API serves the public data from `ZONES_SOURCE`, a bucket (`gs://<project>-zones`) or a local folder, as it is stored (`public_data.py` names every file):

| File                                          | What it holds                                                          |
| :-------------------------------------------- | :--------------------------------------------------------------------- |
| `catalog.json`                                | Indicators, seasonal calendars, divisions, parcels and the maps' frame |
| `divisions/<division>.geojson`                | A division's zones, simplified for the map                             |
| `divisions/<division>/<zone>.json`            | A zone with its full outline                                           |
| `values/<division>/<indicator>.json`          | An indicator's values in every zone of a division                      |
| `series/<division>/<zone>.json`               | A zone's seasonal series, in the order of the catalog's calendars      |
| `zone-index.json`                             | Every zone and department, for the map's search                        |
| `padrones/index.json`, `<department>.geojson` | The parcel numbers of each department, and its parcels                 |
| `maps/<indicator>/[lite/]<period>.webp`       | An indicator's map of a year (or `static`), full or light              |
| `maps/thumbnails/<indicator>-<theme>.webp`    | A small picture of each indicator's map                                |

The data jobs (`services/jobs`) write it, and keep every zone's values in BigQuery. The series files are a cache of BigQuery that the API keeps itself:

- When a zone's file is missing, or shorter than the catalog's calendars, the API builds it from the dataset in `VALUES_SOURCE` (`bigquery://<project>/<dataset>`) and saves it. In the bucket, it may write only `series/`.
- If BigQuery fails, a file that is behind is served as it is.
- Without `VALUES_SOURCE`, as in `make api-dev`, the files are served as they are.
- The catalog is reread every five minutes, so a new composite reaches the zone pages without a deploy.

Until the data jobs compute it from Earth Engine, it comes from the prototype's data (`apps/web/.cache/prototype-data/explorer/`):

```bash
make public-data   # writes .cache/public-data, which make api-dev serves
gcloud storage rsync --recursive --delete-unmatched-destination-objects .cache/public-data gs://<project>-zones
```

## Deploy

`make api-deploy ENV=<env>` has Cloud Build build the image from the repository (`Dockerfile`, with the root `.gcloudignore`), push it and update only the image of the environment's `api` service. The service and its bucket are in Terraform (`infrastructure/terraform/modules/services/api`).
