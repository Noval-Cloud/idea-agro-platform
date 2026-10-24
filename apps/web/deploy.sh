#!/usr/bin/env bash
# Builds the website on Cloud Build and deploys its image to an environment's Cloud Run service.
set -euo pipefail

case "${1:-}" in
  dev | qa | prd) ENV="$1" ;;
  *)
    echo "usage: apps/web/deploy.sh <dev|qa|prd>" >&2
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
CI_PROJECT="$(tf output -raw ci_project)"
REGION="$(tf output -raw region)"
SERVICE="$(tf output -raw web_service)"
URL="$(tf output -raw web_url)"
API_URL="$(tf output -raw api_url)"
AUTH_DOMAIN="$(tf output -raw auth_domain)"
AUTH_KEY="$(tf output -raw auth_browser_key)"
CSP="$(tf output -json auth_csp)"
csp() { jq -r ".$1 | join(\" \")" <<<"$CSP"; }
CSP_CONNECT="$(csp connect)"
CSP_FRAME="$(csp frame)"
CSP_SCRIPT="$(csp script)"
CSP_IMAGES="$(csp images)"
BUILDER="$(tf output -raw builder_email)"
SOURCES="$(tf output -raw build_sources_bucket)"
IMAGES="$(tf output -raw image_repository)"

# The same pipeline as the trigger: the site is built on Cloud Build, from the repository as git sees it.
gcloud builds submit . --project="$CI_PROJECT" --region="$REGION" --config=apps/web/cloudbuild.yaml \
  --ignore-file=.ci.gcloudignore \
  --service-account="projects/$CI_PROJECT/serviceAccounts/$BUILDER" \
  --gcs-source-staging-dir="gs://$SOURCES/source" \
  --substitutions="^@^_CI_IMAGE=$(tf output -raw ci_image)@_IMAGE_REPOSITORY=$IMAGES@_PROJECT=$PROJECT@_SERVICE=$SERVICE@_REGION=$REGION@_SITE_URL=$URL@_API_URL=$API_URL@_AUTH_DOMAIN=$AUTH_DOMAIN@_AUTH_KEY=$AUTH_KEY@_CSP_CONNECT=$CSP_CONNECT@_CSP_FRAME=$CSP_FRAME@_CSP_SCRIPT=$CSP_SCRIPT@_CSP_IMAGES=$CSP_IMAGES"
echo "Deployed to $URL"
