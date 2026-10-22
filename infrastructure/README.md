# Infrastructure

Terraform, project setup and environments of the platform's GCP projects.

## Environments

```text
infrastructure/
└── environments/
    └── <env>/                dev, qa, prd
        ├── setup.env         what setup.sh puts in place before Terraform
        ├── terraform.tfvars  what Terraform reads
        └── backend.tfvars    where this environment's Terraform state lives
```

- Every environment has the same files, so adding one is only filling its values.
- `environments/` sits outside the Terraform root: an environment carries more than Terraform variables.
- `terraform.tfvars` and `backend.tfvars` stay empty while there is no Terraform root.

## `setup.env`

Shell `KEY=value` lines that `infrastructure/setup/setup.sh` sources. An empty value takes its default.

| Variable               | What it is                                                                                                  | Default                                            |
| :--------------------- | :---------------------------------------------------------------------------------------------------------- | :------------------------------------------------- |
| `GOOGLE_CLOUD_PROJECT` | The GCP project id                                                                                          | None: required                                     |
| `GOOGLE_CLOUD_REGION`  | The region of the project's regional resources                                                              | `us-central1`                                      |
| `SETUP_OPERATOR_SA`    | The id, inside the project, of the operator service account, which Terraform applies with and CI/CD runs as | `terraform-operator`                               |
| `SETUP_STATE_BUCKET`   | The bucket that holds the Terraform state                                                                   | `idea-agro-tfstate-<project>`, with the project id |
| `SETUP_REGISTRY`       | The Docker repository in Artifact Registry                                                                  | `idea-agro`                                        |
| `SETUP_APIS`           | The APIs to enable, one per line                                                                            | None: may be empty                                 |
| `SETUP_OPERATOR_ROLES` | The roles granted to the operator service account, one per line                                             | None: may be empty                                 |

`SETUP_APIS` and `SETUP_OPERATOR_ROLES` are quoted strings that span several lines, one item per line.

## Secrets

No secret value ever goes in these files: they are versioned. Configuration refers to a secret by its Secret Manager name.
