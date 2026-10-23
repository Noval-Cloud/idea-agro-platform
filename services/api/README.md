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
- A change to `openapi.json` shows up in the pull request; reviewing it against these rules is part of the review.

## Errors

Every error is a Problem Details object (RFC 9457) served as `application/problem+json`: `type`, `title`, `status`, `detail`, `instance`, and `errors` for invalid parameters.

## Running it

```bash
make api-dev    # http://localhost:8080, serving the website's prototype data
```

With it running, `pnpm dev` in `apps/web` reads from it. Tests run in `make test`, against local files shaped like the bucket.

## Data

The API reads `ZONES_SOURCE`, a bucket (`gs://<project>-zones`) or a local folder, with:

- `manifest.json`, whose `seasonal` lists each indicator's composites (`b2001-17` starts on day 17 of 2001);
- `series/<division>/<zone>.json`, each indicator's values in the zone, in the manifest's order.

To load the website's prototype data into an environment's bucket:

```bash
gcloud storage cp apps/web/public/explorer/manifest.json gs://<project>-zones/
gcloud storage cp -r apps/web/public/explorer/series gs://<project>-zones/
```

## Deploy

`make api-deploy ENV=<env>` has Cloud Build build the image from the repository (`Dockerfile`, with the root `.gcloudignore`), push it and update only the image of the environment's `api` service. The service and its bucket are in Terraform (`infrastructure/terraform/modules/services/api`).
