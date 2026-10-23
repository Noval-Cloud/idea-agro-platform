#!/usr/bin/env bash
# Fails when the API's OpenAPI document or the client generated from it is out of date.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! uv run python -m idea_agro_api.openapi | diff -u services/api/openapi.json -; then
  echo "services/api/openapi.json is out of date: run make generate" >&2
  exit 1
fi

digest() { find packages/api-client/src/generated -type f -print0 | sort -z | xargs -0 shasum; }
before="$(digest)"
pnpm --filter @idea-agro/api-client generate >/dev/null
if [ "$(digest)" != "$before" ]; then
  echo "packages/api-client is out of date: run make generate" >&2
  exit 1
fi
