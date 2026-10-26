# API

The public, read-only API of IDEA-Agro: FastAPI on Cloud Run. Any site or app may call it, with no key; the website is one of its clients.

## Contract

- `openapi.json` is the contract. `make generate` writes it from the code, and `make check` fails when it is out of date.
- `packages/api-client` is generated from it with Orval: typed functions, TanStack Query hooks and Zod schemas.
- A running API documents itself at `/docs` (Swagger UI) and `/redoc`.
- Every endpoint, parameter and field carries a description, with its unit where it has one. Operation ids are the route functions' names, so generated clients keep their names.

## Versions

- The major version is part of the path: `/v1/...`.
- Within a major version every change is backward compatible: new endpoints, new optional fields, new values in a response, including a new kind in a `oneOf` (such as a point among a zone's outlines). Clients ignore the fields and kinds they do not know.
- Breaking changes ship as a new major version, such as `/v2/...`. Breaking means removing or renaming an endpoint, a field or an enum value; making an optional field required; changing a type or a unit. The previous version keeps answering through a deprecation period, announced in the `Deprecation` and `Sunset` response headers.
- `API_VERSION` in `app.py` is the document's `info.version`, in semantic versioning: patch for documentation, minor for backward-compatible additions, major only together with a new path prefix.
- `make contract` compares `openapi.json` with `main`'s using oasdiff (`scripts/check-breaking.sh`): it prints the changelog and fails on any change that breaks existing clients, such as a removed path or a new required field. Removing something takes a deprecation first, or a new major version. A new kind in a response's `oneOf`, or a new value of a response's enum, is only a warning there (`scripts/oasdiff-levels.txt`), by the rule above.
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
- **Seasonal series:** `/v1/saved-zones/{id}/seasonal`, and the same through a project, give the current outline's productivity, radiation and evapotranspiration on the catalog's dates. The data job computes them (its `saved` task) and keeps them next to the outline as `<outline>.series.json`. Until it has, `computing` is true.
- **Computing right away:** a new outline (saved, imported or changed) starts the data job's `saved` task for that outline, through a `ZoneJobs` port. A restored outline brings its earlier series along. `ZONE_JOB` is `run://projects/<project>/locations/<region>/jobs/<job>` or `none`. A start that fails is only logged, because the nightly run catches up.
- **Documents:** the owner attaches files to a saved zone (`/v1/saved-zones/{id}/documents`): PDF, images, text, CSV, spreadsheets and text documents, by extension, which also sets the type they are served with, always as attachments. Their files live in the outlines' bucket under `documents/<zone>/`, apart from what the data job reads, and their records in `zone_documents`. The members of the zone's projects list and download them. The limits are `DOCUMENT_MAX_BYTES` (10 MB), `DOCUMENTS_PER_ZONE` (20) and `DOCUMENTS_MAX_BYTES_PER_ACCOUNT` (200 MB). They are checked before each upload, so uploads made at the same moment can pass one by a few. A name with control or formatting characters is refused. Deleting the zone deletes its documents.

## Invitations to the platform

A signed-in person invites an email to the platform under `/v1/me/invitations` (private), and sees each invitation's state.

- **Accepted** once an account with that verified email is created within `INVITATION_DAYS` (7). Such an invitation grants nothing, so its link needs no code: it leads to sign-in.
- **Against spam:** only a verified email invites. Every email, first or again, counts against `PLATFORM_INVITATIONS_PER_DAY` (10) a day. Deleting an invitation only hides it, so it cannot refill that budget. At most `PLATFORM_INVITATIONS_PENDING` (50) are pending at once, and resending waits `INVITATION_RESEND_MINUTES` (10) and renews the term.
- **The email** is the `platform-invitation` kind (see Emails). It shows the inviter's name, cleaned and cut short, and their verified address.

## Emails

Every email is a kind (`emails/templates.py`), written in the inviter's or reader's language, `es`, `en` or `pt`.

- **Sending:** a sender calls `compose` with the kind, the values of the kind's placeholders and, for a button, its link, then hands the `Email` to the `Mailer`. It never writes HTML.
- **Words:** they come from a `Templates` port, the code's own (`emails/words.py`) today. A store people edit can replace it as `Services.templates`. `check` refuses a template that places a value its kind does not give, lacks a part its kind writes, or breaks a one-line part; a refused template leaves the email unsent, never the request failed.
- **Look:** `emails/layout.py` gives every email the same plain layout, built to hold up in Outlook, with inline styles, a plain-text copy and an inbox preview line. Its own few words (the footer and the line under the button) stay in the code. Dates are written in Uruguay time, and numbers with the language's separators.
- **Provider:** behind the `Mailer` port (`mail.py`). `MAILER` is `resend://`, with `MAIL_API_KEY` and `MAIL_FROM`, or `none`, which sends nothing. Links point to `SITE_URL`.
- **A new kind:** add it to `Kind` with its `Shape` (its placeholders, and whether it has a button), then add its words in every language; the tests check them.

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
