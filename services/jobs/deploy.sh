#!/usr/bin/env bash
# Builds the data jobs' image from the repository and deploys it to an environment's Cloud Run job.
set -euo pipefail

case "${1:-}" in
  dev | qa | prd) ENV="$1" ;;
  *)
    echo "usage: services/jobs/deploy.sh <dev|qa|prd>" >&2
    exit 2
    ;;
esac
cd "$(dirname "$0")/../.."

# Terraform reads the state with the person's gcloud credentials, then as the operator account.
GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
export GOOGLE_OAUTH_ACCESS_TOKEN
tf() { terraform -chdir=infrastructure/terraform "$@"; }
tf init -reconfigure -input=false -backend-config="../environments/$ENV/backend.tfvars" >/dev/null

PROJECT="$(tf output -raw project)"
REGION="$(tf output -raw region)"
JOB="$(tf output -raw jobs_job)"
gcloud builds submit . --project="$PROJECT" --region="$REGION" --config=services/jobs/cloudbuild.yaml \
  --ignore-file=.ci.gcloudignore \
  --service-account="projects/$PROJECT/serviceAccounts/$(tf output -raw builder_email)" \
  --gcs-source-staging-dir="gs://$(tf output -raw build_sources_bucket)/source" \
  --substitutions="_IMAGE_REPOSITORY=$(tf output -raw image_repository),_JOB=$JOB,_REGION=$REGION"
echo "Deployed the job $JOB"
