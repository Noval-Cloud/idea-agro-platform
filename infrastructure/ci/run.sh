#!/usr/bin/env bash
# Runs a CI pipeline on an environment's Cloud Build by hand, as its trigger would.
set -euo pipefail

usage() {
  echo "usage: infrastructure/ci/run.sh <dev|qa|prd> <image|checks>" >&2
  exit 2
}
case "${1:-}" in dev | qa | prd) ENV="$1" ;; *) usage ;; esac
case "${2:-}" in image | checks) PIPELINE="$2" ;; *) usage ;; esac
cd "$(dirname "$0")/../.."

GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export GOOGLE_OAUTH_ACCESS_TOKEN
tf() { terraform -chdir=infrastructure/terraform "$@"; }
tf init -reconfigure -input=false -backend-config="../environments/$ENV/backend.tfvars" >/dev/null

PROJECT="$(tf output -raw ci_project)"
gcloud builds submit . --project="$PROJECT" --region="$(tf output -raw region)" \
  --config="infrastructure/ci/$PIPELINE.cloudbuild.yaml" --ignore-file=.ci.gcloudignore \
  --service-account="projects/$PROJECT/serviceAccounts/$(tf output -raw builder_email)" \
  --gcs-source-staging-dir="gs://$(tf output -raw build_sources_bucket)/source" \
  --substitutions="_CI_IMAGE=$(tf output -raw ci_image)"
