#!/usr/bin/env bash
# Runs an environment's data job once and waits for it: with the given arguments, or with the job's own.
set -euo pipefail

case "${1:-}" in
  dev | qa | prd) ENV="$1" ;;
  *)
    echo "usage: services/jobs/run.sh <dev|qa|prd> [task and options]" >&2
    exit 2
    ;;
esac
shift
cd "$(dirname "$0")/../.."

GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export GOOGLE_OAUTH_ACCESS_TOKEN
tf() { terraform -chdir=infrastructure/terraform "$@"; }
tf init -reconfigure -input=false -backend-config="../environments/$ENV/backend.tfvars" >/dev/null

overrides=()
if (($#)); then
  overrides=("--args=$(IFS=,; echo "$*")")
fi
gcloud run jobs execute "$(tf output -raw jobs_job)" --project="$(tf output -raw project)" \
  --region="$(tf output -raw region)" --wait ${overrides[@]+"${overrides[@]}"}
