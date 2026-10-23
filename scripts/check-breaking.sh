#!/usr/bin/env bash
# Prints how the API's contract changes from the one on main, and fails on a change that breaks its clients.
set -euo pipefail
cd "$(dirname "$0")/.."

document=services/api/openapi.json
published="${CONTRACT_MAIN_URL:-https://raw.githubusercontent.com/Noval-Cloud/idea-agro-platform/main/$document}"
main="$(mktemp)"
trap 'rm -f "$main"' EXIT

# main's contract from git when its history is here, or else from where main is published.
if ! git show "origin/main:$document" >"$main" 2>/dev/null; then
  curl -fsSL "$published" >"$main"
fi
scripts/oasdiff.sh changelog "$main" "$document"
scripts/oasdiff.sh breaking "$main" "$document" --fail-on ERR
