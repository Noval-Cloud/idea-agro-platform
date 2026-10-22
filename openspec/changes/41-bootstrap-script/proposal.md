## Why

Terraform cannot create the bucket its own state lives in, and the APIs must be on before its first plan. One script prepares any environment's GCP project for Terraform, from that environment's `setup.env`, and holds no value of this project.

## What Changes

- Add `infrastructure/setup/setup.sh --env <dev|qa|prd> [--apply]`, a Bash script that also runs on macOS's `/bin/bash` 3.2:
  - it sources `infrastructure/environments/<env>/setup.env`, and refuses an unknown environment and a missing `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_REGION` or `SETUP_REGISTRY`;
  - the operator account defaults to `terraform-operator` and the state bucket to `<project>-tfstate`;
  - blank lines in `SETUP_APIS` and `SETUP_OPERATOR_ROLES` are ignored; an empty `SETUP_APIS` enables no extra API, and an empty `SETUP_OPERATOR_ROLES` grants nothing;
  - it always enables the APIs it needs for its own work (IAM, Cloud Storage, Artifact Registry and Cloud Resource Manager) before the resources that depend on them, then the APIs in `SETUP_APIS`;
  - it creates the operator service account and grants its project roles, the state bucket (versioned, in the region) and the Docker repository in Artifact Registry;
  - it only adds: it never disables an API or revokes a role;
  - it runs `gcloud` with the person's active configuration, or the one in `CLOUDSDK_ACTIVE_CONFIG_NAME`, and never changes it.
- Without `--apply` the run is read-only: it prints one line per missing item, saying what would be done, and ends with the number of changes. A resource behind a disabled API counts as missing. With `--apply` it makes those changes, prints the values Terraform needs and writes them to `infrastructure/setup/outputs/<env>.backend.tfvars` and `<env>.terraform.tfvars`, which git ignores. It never writes the environment's own tfvars.
- The exit status is 0 when the run works, with or without changes, and non-zero on a refusal or an error.
- Add `make tf-setup ENV=<env>` (dry run) and `APPLY=1` (apply); without a valid `ENV` the target refuses.
- Tests run the script against a stub `gcloud` with no GCP, inside `make check` and under pyright strict.
- Pin shellcheck (`shellcheck-py` in the uv `dev` group); `make lint` checks every tracked `*.sh`.
- Document the setup in `infrastructure/README.md` and the `setup.env` files, list `make tf-setup` in the root `README.md`, describe how READMEs are organized in `conventions.md`, and tell agents in `AGENTS.md` to read a part's README before changing it.

## Impact

- Affected specs: none.
- Affected code: `infrastructure/`, `Makefile`, `pyproject.toml`, `uv.lock`, `.gitignore`, `README.md`, `AGENTS.md`, `.agents/context/conventions.md`.
- Story: #41.
