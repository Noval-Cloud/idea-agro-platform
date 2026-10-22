.DEFAULT_GOAL := help
.PHONY: help setup lint format typecheck test check

TERRAFORM_DIR := infrastructure/terraform

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
ifneq ($(wildcard $(TERRAFORM_DIR)),)
	terraform -chdir=$(TERRAFORM_DIR) fmt -check -recursive
endif

format: ## Format every file in place
	pnpm exec vp fmt
	uv run ruff format
ifneq ($(wildcard $(TERRAFORM_DIR)),)
	terraform -chdir=$(TERRAFORM_DIR) fmt -recursive
endif

typecheck: ## Type-check TypeScript and Python
	pnpm exec vp check --no-fmt --no-lint
	uv run pyright

test: ## Run every test suite
	pnpm test
	uv run pytest || [ $$? -eq 5 ] # 5: no tests collected yet

check: lint typecheck test ## Run lint, typecheck and test
