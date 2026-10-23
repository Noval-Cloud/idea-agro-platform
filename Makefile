.DEFAULT_GOAL := help
.PHONY: help setup lint format typecheck test build specs check tf-setup

TERRAFORM_DIR := infrastructure/terraform
require_env = $(if $(filter dev qa prd,$(ENV)),,$(error ENV must be dev, qa or prd))

help: ## List the available targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-z-]+:.*## / {printf "  %-10s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

setup: ## Install every dependency
	pnpm install --frozen-lockfile
	uv sync --locked

lint: ## Check formatting and lint rules (read-only)
	pnpm exec vp fmt --check
	pnpm exec vp lint --deny-warnings
	uv run ruff format --check
	uv run ruff check
	git ls-files -z '*.sh' | xargs -0 uv run shellcheck
ifneq ($(wildcard $(TERRAFORM_DIR)),)
	terraform -chdir=$(TERRAFORM_DIR) fmt -check -recursive
endif

format: ## Format every file in place
	pnpm exec vp fmt
	uv run ruff format
ifneq ($(wildcard $(TERRAFORM_DIR)),)
	terraform -chdir=$(TERRAFORM_DIR) fmt -recursive
endif

typecheck: ## Type-check TypeScript, Astro and Python
	pnpm exec vp check --no-fmt --no-lint
	pnpm -r --if-present check
	uv run pyright

test: ## Run every test suite
	pnpm test
	uv run pytest

build: ## Build every app
	pnpm -r --if-present build

specs: ## Validate the OpenSpec changes and specs, and that archived changes have no open task
	pnpm openspec validate --all --strict --no-interactive
	! grep -rl -e '- \[ \]' openspec/changes/archive

check: lint typecheck test build specs ## Run lint, typecheck, test, build and specs

tf-setup: ## Prepare ENV's GCP project for Terraform: a dry run, or APPLY=1 to apply
	$(require_env)
	infrastructure/setup/setup.sh --env $(ENV) $(if $(filter 1,$(APPLY)),--apply)
