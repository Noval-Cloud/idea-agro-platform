#!/usr/bin/env bash
# Builds the API's image from the repository and deploys it to an environment's Cloud Run service.
set -euo pipefail

case "${1:-}" in
  dev | qa | prd) ENV="$1" ;;
  *)
    echo "usage: services/api/deploy.sh <dev|qa|prd>" >&2
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
SERVICE="$(tf output -raw api_service)"
URL="$(tf output -raw api_url)"
BUILDER="$(tf output -raw builder_email)"
SOURCES="$(tf output -raw build_sources_bucket)"
IMAGES="$(tf output -raw image_repository)"

gcloud builds submit . --project="$PROJECT" --region="$REGION" --config=services/api/cloudbuild.yaml \
  --service-account="projects/$PROJECT/serviceAccounts/$BUILDER" \
  --gcs-source-staging-dir="gs://$SOURCES/source" \
  --substitutions="_IMAGE_REPOSITORY=$IMAGES,_SERVICE=$SERVICE,_REGION=$REGION"
echo "Deployed to $URL"
