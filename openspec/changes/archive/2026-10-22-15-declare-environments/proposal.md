## Why

Every environment has the same files, so adding qa or prd later is only filling values.

## What Changes

- Add `infrastructure/environments/dev/`, `qa/` and `prd/`, each with `setup.env`, `terraform.tfvars` and `backend.tfvars`, identical and with every value empty for a person to fill.
- `setup.env` declares every variable `setup.sh` reads: `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_REGION`, `SETUP_OPERATOR_SA`, `SETUP_STATE_BUCKET`, `SETUP_REGISTRY`, and `SETUP_APIS` and `SETUP_OPERATOR_ROLES` as lists with one item per line.
- `terraform.tfvars` and `backend.tfvars` stay empty until the Terraform root arrives (#12).
- `infrastructure/README.md` explains the layout of `environments/`, each variable of `setup.env` and its default, and that no secret value ever goes in these files.
- `setup.sh` itself, and how to run it, arrive with story #41.

## Impact

- Affected specs: none.
- Affected code: `infrastructure/`.
- Story: #15.
