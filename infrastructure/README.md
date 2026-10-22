# Infrastructure

Terraform, project setup and environments of the platform's GCP projects.

## Layout

```text
infrastructure/
├── setup/
│   ├── setup.sh              prepares a GCP project for Terraform
│   └── outputs/              the values setup.sh wrote, ignored by git
└── environments/
    └── <env>/                dev, qa, prd
        ├── setup.env         what setup.sh puts in place before Terraform
        ├── terraform.tfvars  what Terraform reads
        └── backend.tfvars    where this environment's Terraform state lives
```

## Environments

- Every environment has the same files, so bringing one up is only filling its values.
- `environments/` sits outside the Terraform root: an environment carries more than Terraform variables.
- `terraform.tfvars` and `backend.tfvars` stay empty while there is no Terraform root.

## Setup

`setup/setup.sh` does only what Terraform cannot do for itself: Terraform cannot create the bucket its own state lives in, and the APIs must be on before its first plan. From the environment's `setup.env`, it puts in place:

- the APIs it works through (IAM, Cloud Resource Manager, Cloud Storage and Artifact Registry), always, and then the ones in `SETUP_APIS`;
- the operator service account and its project roles;
- the Terraform state bucket, versioned, in the region;
- the Docker repository in Artifact Registry.

It only adds: it never disables an API or revokes a role. It runs `gcloud` with your active configuration, or the one in `CLOUDSDK_ACTIVE_CONFIG_NAME`, and never changes it. Your account must be able to enable APIs, create service accounts and grant project roles; a project owner can.

### Running it

```bash
make tf-setup ENV=qa            # dry run: reads the project and changes nothing
make tf-setup ENV=qa APPLY=1    # makes the changes
```

The dry run prints one line per missing item and ends with the number of changes. `Changes: 0` means the project is ready. A resource behind an API that is still off counts as missing.

```text
qa: project my-project, region us-central1 (dry run)
  would enable run.googleapis.com
  would grant roles/run.admin to terraform-operator@my-project.iam.gserviceaccount.com
Changes: 2
```

With `APPLY=1` it makes those changes, prints the values Terraform needs, and writes them to `setup/outputs/<env>.backend.tfvars` (the state bucket) and `<env>.terraform.tfvars` (project and region). Copy from them what `environments/<env>/` lacks: the script never writes there.

On a refusal or an error, it stops with a non-zero exit status and prints the cause, `gcloud`'s own message included.

### Adding or removing an API or a role

- **Adding:** add the line to `SETUP_APIS` or `SETUP_OPERATOR_ROLES` in each environment that needs it. Run the dry run to see it listed, then apply.
- **Removing:** delete the line, then disable the API or revoke the role by hand, because the script only adds:

  ```bash
  gcloud services disable <api> --project=<project>
  gcloud projects remove-iam-policy-binding <project> --member=serviceAccount:<operator email> --role=<role>
  ```

## `setup.env`

Shell `KEY=value` lines that `setup/setup.sh` sources. The last column says what an empty value means.

| Variable               | What it is                                                                                                  | When empty                               |
| :--------------------- | :---------------------------------------------------------------------------------------------------------- | :--------------------------------------- |
| `GOOGLE_CLOUD_PROJECT` | The GCP project id                                                                                          | Required                                 |
| `GOOGLE_CLOUD_REGION`  | The region of the project's regional resources                                                              | Required                                 |
| `SETUP_REGISTRY`       | The id of the Docker repository in Artifact Registry, not its full `<region>-docker.pkg.dev/...` path       | Required                                 |
| `SETUP_OPERATOR_SA`    | The id, inside the project, of the operator service account, which Terraform applies with and CI/CD runs as | `terraform-operator`                     |
| `SETUP_STATE_BUCKET`   | The name of the bucket that holds the Terraform state, without `gs://`                                      | `<project>-tfstate`, with the project id |
| `SETUP_APIS`           | Only the APIs the project needs, one per line. The setup's own APIs are always enabled and are not listed   | No extra API is enabled                  |
| `SETUP_OPERATOR_ROLES` | The roles granted to the operator service account, one per line                                             | No role is granted                       |

`SETUP_APIS` and `SETUP_OPERATOR_ROLES` are quoted strings that span several lines, one item per line. Blank lines are ignored.

## Secrets

No secret value ever goes in these files: they are versioned. Configuration refers to a secret by its Secret Manager name.
