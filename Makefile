.DEFAULT_GOAL := help
.PHONY: help setup lint format typecheck test build generate contract specs check tf-setup tf-plan tf-apply web-deploy \
	api-dev api-deploy

TF := terraform -chdir=infrastructure/terraform
# Terraform starts from the person's gcloud credentials, then impersonates the operator account.
TF_AS_PERSON = token=$$(gcloud auth print-access-token) && GOOGLE_OAUTH_ACCESS_TOKEN=$$token $(TF)
TF_INIT = $(TF_AS_PERSON) init -reconfigure -input=false -backend-config=../environments/$(ENV)/backend.tfvars >/dev/null
require_env = $(if $(filter dev qa prd,$(ENV)),,$(error ENV must be dev, qa or prd))

help: ## List the available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install every dependency
	pnpm install --frozen-lockfile
	uv sync --locked --all-packages

lint: ## Check formatting and lint rules (read-only)
	pnpm exec vp fmt --check
	pnpm exec vp lint --deny-warnings
	uv run ruff format --check
	uv run ruff check
	git ls-files -z '*.sh' | xargs -0 uv run shellcheck
	$(TF) fmt -check -recursive
	TF_DATA_DIR=.terraform/validate $(TF) init -backend=false -input=false >/dev/null
	TF_DATA_DIR=.terraform/validate $(TF) validate

format: ## Format every file in place
	pnpm exec vp fmt
	uv run ruff format
	$(TF) fmt -recursive

typecheck: ## Type-check TypeScript, Astro and Python
	pnpm exec vp check --no-fmt --no-lint
	pnpm -r --if-present check
	uv run pyright

test: ## Run every test suite
	pnpm test
	uv run pytest

build: ## Build every app
	pnpm -r --if-present build

generate: ## Write the API's OpenAPI document and the client generated from it
	uv run python -m idea_agro_api.openapi > services/api/openapi.json
	pnpm --filter @idea-agro/api-client generate

contract: ## Check that the OpenAPI document and the generated client are up to date
	scripts/check-contract.sh

specs: ## Validate the OpenSpec changes and specs, and that archived changes have no open task
	pnpm openspec validate --all --strict --no-interactive
	! grep -rl -e '- \[ \]' openspec/changes/archive

check: lint typecheck test contract build specs ## Run lint, typecheck, test, contract, build and specs

tf-setup: ## Prepare ENV's GCP project for Terraform: a dry run, or APPLY=1 to apply
	$(require_env)
	infrastructure/setup/setup.sh --env $(ENV) $(if $(filter 1,$(APPLY)),--apply)

tf-plan: ## Save ENV's Terraform plan, read-only
	$(require_env)
	$(TF_INIT)
	$(TF_AS_PERSON) plan -input=false -var-file=../environments/$(ENV)/terraform.tfvars -out=$(ENV).tfplan

tf-apply: ## Apply the plan tf-plan saved for ENV
	$(require_env)
	$(TF_INIT)
	$(TF_AS_PERSON) apply -input=false $(ENV).tfplan

web-deploy: ## Build the website and deploy its image to ENV's Cloud Run
	$(require_env)
	apps/web/deploy.sh $(ENV)

api-dev: ## Run the API locally on port 8080, serving the website's prototype data
	ZONES_SOURCE=apps/web/public/explorer uv run uvicorn --factory idea_agro_api.app:create_app_from_env --reload --port 8080

api-deploy: ## Build the API's image from git and deploy it to ENV's Cloud Run
	$(require_env)
	services/api/deploy.sh $(ENV)
