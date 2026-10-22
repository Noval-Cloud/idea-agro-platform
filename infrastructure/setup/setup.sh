#!/usr/bin/env bash
# Prepares an environment's GCP project for Terraform; infrastructure/README.md describes it.
# It must keep running on macOS's /bin/bash 3.2.
set -euo pipefail

usage() {
  echo "usage: infrastructure/setup/setup.sh --env <dev|qa|prd> [--apply]" >&2
  exit 2
}

ENV=""
APPLY=0
while [ $# -gt 0 ]; do
  case "$1" in
    --env)
      [ $# -ge 2 ] || usage
      ENV="$2"
      shift 2
      ;;
    --apply)
      APPLY=1
      shift
      ;;
    *) usage ;;
  esac
done
case "$ENV" in
  dev | qa | prd) ;;
  *) usage ;;
esac

cd "$(dirname "$0")/../.."
ENV_FILE="infrastructure/environments/$ENV/setup.env"
OUT_DIR="infrastructure/setup/outputs"

if [ ! -f "$ENV_FILE" ]; then
  echo "$ENV_FILE does not exist" >&2
  exit 2
fi
# Only the environment's file decides, never a value left in the shell.
unset GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION SETUP_REGISTRY SETUP_OPERATOR_SA SETUP_STATE_BUCKET \
  SETUP_APIS SETUP_OPERATOR_ROLES
# shellcheck source=/dev/null
. "$ENV_FILE"

missing=""
for name in GOOGLE_CLOUD_PROJECT GOOGLE_CLOUD_REGION SETUP_REGISTRY; do
  [ -n "${!name:-}" ] || missing="$missing $name"
done
if [ -n "$missing" ]; then
  echo "$ENV_FILE is missing:$missing" >&2
  exit 2
fi

PROJECT="$GOOGLE_CLOUD_PROJECT"
REGION="$GOOGLE_CLOUD_REGION"
REGISTRY="$SETUP_REGISTRY"
OPERATOR="${SETUP_OPERATOR_SA:-terraform-operator}"
OPERATOR_EMAIL="$OPERATOR@$PROJECT.iam.gserviceaccount.com"
STATE_BUCKET="${SETUP_STATE_BUCKET:-$PROJECT-tfstate}"
# The APIs this script works through, so they are not left to setup.env.
OWN_APIS="
iam.googleapis.com
cloudresourcemanager.googleapis.com
storage.googleapis.com
artifactregistry.googleapis.com
"

command -v gcloud >/dev/null || {
  echo "gcloud is not installed" >&2
  exit 2
}
# Never stop on a prompt: a dry run must not offer to enable an API.
export CLOUDSDK_CORE_DISABLE_PROMPTS=1

# One item per line, without surrounding spaces or blank lines.
items() { printf '%s\n' "$1" | tr -d '\r' | awk 'NF { $1 = $1; print }'; }

# has <lines> <item>: whether one line is exactly the item.
has() { grep -Fqx -- "$2" <<<"$1"; }

CHANGES=0
# say <what>: one line per missing item, and the count.
say() {
  CHANGES=$((CHANGES + 1))
  if [ "$APPLY" -eq 1 ]; then echo "  $1"; else echo "  would $1"; fi
}

# change <what> <command...>: runs the command only with --apply.
change() {
  say "$1"
  shift
  if [ "$APPLY" -eq 1 ]; then "$@" </dev/null >/dev/null; fi
}

SEEN_APIS=""
# enable_apis <list>: one call for the APIs of the list that are still off.
# shellcheck disable=SC2086 # $batch holds one API per word
enable_apis() {
  local api batch=""
  while read -r api; do
    if [ -z "$api" ] || has "$SEEN_APIS" "$api"; then continue; fi
    SEEN_APIS="$SEEN_APIS
$api"
    if has "$ENABLED" "$api"; then continue; fi
    say "enable $api"
    batch="$batch $api"
  done <<<"$(items "$1")"
  if [ "$APPLY" -eq 1 ] && [ -n "$batch" ]; then
    gcloud services enable $batch --project="$PROJECT" </dev/null >/dev/null
    ENABLED="$ENABLED$(printf '\n%s' $batch)"
  fi
}

# A resource behind an API that is still off counts as missing, without asking for it.
api_on() { has "$ENABLED" "$1"; }

# A new account can take a minute to be visible to IAM policies.
grant() {
  local attempt
  for attempt in 1 2 3 4 5 6; do
    if gcloud projects add-iam-policy-binding "$PROJECT" --member="serviceAccount:$OPERATOR_EMAIL" \
      --role="$1" --condition=None; then
      return
    fi
    [ "$attempt" -lt 6 ] || return 1
    sleep 10
  done
}

create_state_bucket() {
  gcloud storage buckets create "gs://$STATE_BUCKET" --project="$PROJECT" --location="$REGION" \
    --uniform-bucket-level-access --public-access-prevention
  gcloud storage buckets update "gs://$STATE_BUCKET" --project="$PROJECT" --versioning
}

if [ "$APPLY" -eq 1 ]; then
  echo "$ENV: project $PROJECT, region $REGION"
else
  echo "$ENV: project $PROJECT, region $REGION (dry run)"
fi
if ! gcloud projects describe "$PROJECT" --format='value(projectId)' >/dev/null; then
  echo "The active gcloud account cannot read project $PROJECT" >&2
  exit 1
fi

ENABLED="$(gcloud services list --enabled --project="$PROJECT" --format='value(config.name)')"
enable_apis "$OWN_APIS"
enable_apis "${SETUP_APIS:-}"

ACCOUNTS=""
if api_on iam.googleapis.com; then
  ACCOUNTS="$(gcloud iam service-accounts list --project="$PROJECT" --format='value(email)')"
fi
GRANTED=""
if has "$ACCOUNTS" "$OPERATOR_EMAIL"; then
  if api_on cloudresourcemanager.googleapis.com; then
    GRANTED="$(gcloud projects get-iam-policy "$PROJECT" --flatten='bindings[].members' \
      --format='value(bindings.role,bindings.members)' |
      awk -F '\t' -v member="serviceAccount:$OPERATOR_EMAIL" '$2 == member { print $1 }')"
  fi
else
  change "create service account $OPERATOR_EMAIL" \
    gcloud iam service-accounts create "$OPERATOR" --project="$PROJECT" --display-name="Terraform operator"
fi
while read -r role; do
  if [ -z "$role" ] || has "$GRANTED" "$role"; then continue; fi
  GRANTED="$GRANTED
$role"
  change "grant $role to $OPERATOR_EMAIL" grant "$role"
done <<<"$(items "${SETUP_OPERATOR_ROLES:-}")"

BUCKETS=""
if api_on storage.googleapis.com; then
  BUCKETS="$(gcloud storage buckets list --project="$PROJECT" --format='value(name)')"
fi
if ! has "$BUCKETS" "$STATE_BUCKET"; then
  change "create bucket gs://$STATE_BUCKET in $REGION, versioned" create_state_bucket
fi

REPOSITORIES=""
if api_on artifactregistry.googleapis.com; then
  REPOSITORIES="$(gcloud artifacts repositories list --project="$PROJECT" --location="$REGION" \
    --format='value(name)' | awk -F / '{ print $NF }')"
fi
if ! has "$REPOSITORIES" "$REGISTRY"; then
  change "create Docker repository $REGISTRY in $REGION" \
    gcloud artifacts repositories create "$REGISTRY" --project="$PROJECT" --location="$REGION" \
    --repository-format=docker
fi

if [ "$APPLY" -eq 0 ]; then
  echo "Changes: $CHANGES"
  exit 0
fi
echo "Changes made: $CHANGES"

mkdir -p "$OUT_DIR"
cat >"$OUT_DIR/$ENV.backend.tfvars" <<EOF
# Written by setup.sh: copy what is needed into infrastructure/environments/$ENV/backend.tfvars.
bucket = "$STATE_BUCKET"
EOF
cat >"$OUT_DIR/$ENV.terraform.tfvars" <<EOF
# Written by setup.sh: copy what is needed into infrastructure/environments/$ENV/terraform.tfvars.
project = "$PROJECT"
region  = "$REGION"
EOF
echo
echo "Values for Terraform, also written to $OUT_DIR/:"
for file in "$OUT_DIR/$ENV.backend.tfvars" "$OUT_DIR/$ENV.terraform.tfvars"; do
  echo "  ${file##*/}"
  grep -v '^#' "$file" | sed 's/^/    /'
done
