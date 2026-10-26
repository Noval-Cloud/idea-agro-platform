#!/usr/bin/env bash
# Stores the mail provider's API key as a new version of the secret the API reads.
# The key is asked for and piped to Secret Manager: it is never written to disk or passed as an argument.
set -euo pipefail

ENV="${1:-}"
cd "$(dirname "$0")/../.."
if [ -z "$ENV" ] || [ ! -f "infrastructure/environments/$ENV/setup.env" ]; then
  echo "usage: infrastructure/setup/mail-key.sh <environment>" >&2
  exit 2
fi
GCP_PROJECT_ID=""
# shellcheck source=/dev/null
. "infrastructure/environments/$ENV/setup.env"
# The secret the API's module declares.
SECRET="mail-api-key"

read -r -s -p "Mail provider (Resend) API key, for $GCP_PROJECT_ID: " KEY
echo
if [ -z "$KEY" ]; then
  echo "No key given" >&2
  exit 2
fi
printf '%s' "$KEY" | gcloud secrets versions add "$SECRET" --project="$GCP_PROJECT_ID" --data-file=- \
  --format='value(name)'
