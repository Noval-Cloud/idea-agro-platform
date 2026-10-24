# Infrastructure

Terraform, project setup and environments of the platform's GCP projects.

## Layout

```text
infrastructure/
├── setup/
│   ├── setup.sh              prepares a GCP project for Terraform
│   └── outputs/              the values setup.sh wrote, ignored by git
├── terraform/                one root for every environment
│   └── modules/
│       ├── platform/         what every service shares: the build identity, its sources bucket, Firestore, BigQuery
│       ├── identity/         sign-in: Firebase Authentication on Identity Platform, and the browser's key
│       ├── ci/               the Cloud Build triggers
│       └── services/<name>/  one module per service or job: its identity, its Cloud Run resource, its access
└── environments/
    └── <env>/                dev, qa, prd
        ├── setup.env         what setup.sh puts in place before Terraform
        ├── terraform.tfvars  what Terraform reads
        └── backend.tfvars    where this environment's Terraform state lives
```

## Environments

- Every environment has the same files, so bringing one up is only filling its values.
- `environments/` sits outside the Terraform root: an environment carries more than Terraform variables.

## Setup

`setup/setup.sh` does only what Terraform cannot do for itself: Terraform cannot create the bucket its own state lives in, and the APIs must be on before its first plan. From the environment's `setup.env`, it puts in place:

- the APIs it works through (IAM, Cloud Resource Manager, Cloud Storage, and Artifact Registry when there is a registry), always, and then the ones in `GCP_APIS`;
- the operator service account, its project roles, and who may impersonate it;
- the Terraform state bucket, versioned, in the region (it turns versioning on in an existing one);
- the Docker repository in Artifact Registry, only if `ARTIFACT_REGISTRY` names one: this product's images live in the organization's CI/CD project.

It only adds: it never disables an API or revokes a role. It runs `gcloud` with your active configuration, or the one in `CLOUDSDK_ACTIVE_CONFIG_NAME`, and never changes it.

Before the first run, the project must have billing linked, and your account must be able to enable APIs, create service accounts and grant project roles; a project owner can.

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

On a refusal or an error, it stops with a non-zero exit status and prints the cause, `gcloud`'s own message included. On a new project, an API can take a few minutes to answer after it is enabled: if a call fails saying so, run it again.

### Adding or removing an API or a role

- **Adding:** add the line to `GCP_APIS` or `TF_SA_ROLES` in each environment that needs it. Run the dry run to see it listed, then apply.
- **Removing:** delete the line, then disable the API or revoke the role by hand, because the script only adds:

  ```bash
  gcloud services disable <api> --project=<project>
  gcloud projects remove-iam-policy-binding <project> --member=serviceAccount:<operator email> --role=<role>
  ```

## Terraform

One root for every environment; each environment's state lives in its own bucket, chosen at init from its `backend.tfvars`. Terraform starts from your gcloud credentials and runs as the operator service account, so your account must be in the environment's `TF_SA_USERS`.

```bash
make tf-plan ENV=dev     # saves the plan to infrastructure/terraform/dev.tfplan; read-only
make tf-apply ENV=dev    # applies exactly that plan
```

- Read the plan before applying it. A plan saved before the state changed is refused at apply.
- Cloud Run services are created with a placeholder image. The image belongs to the deploy (`make web-deploy ENV=dev`), and Terraform never changes it.
- A module grants itself what it needs from others, in its own `iam.tf`.
- Every value comes from a variable, with a default wherever one makes sense, so an environment's `terraform.tfvars` holds only what differs.

### Sign-in

The `identity` module adds Firebase to the project, turns on Identity Platform with the authorized domains (the website's and `auth_local_origins`), and creates the browser's key, restricted to the sign-in APIs and to those origins. The API verifies tokens with `AUTH_ISSUER`, `AUTH_AUDIENCE` and `AUTH_JWKS_URL`, which this module outputs.

Google as a provider is the one step done by hand, once per environment, because only the Firebase console creates its OAuth client: Firebase console → the project → Authentication → Sign-in method → Google → Enable, with the support email. Until then, the sign-in page answers that Google sign-in is not enabled.

## CI/CD

Builds run in the organization's CI/CD project, `novalcloud-setup`, which [Noval-Cloud/org-setup](https://github.com/Noval-Cloud/org-setup) manages. It holds the connection to GitHub, the link to this repository, the shared Docker repository and this product's build identity, `idea-agro-build`. The environment's `ci` variable takes those from org-setup's outputs.

The `ci` module declares this product's triggers there, all running as `idea-agro-build`:

- **Checks:** `idea-agro-checks` runs `make setup` and `make check` in the CI image (`ci/checks.cloudbuild.yaml`) on every pull request into `main`, and reports the result on it. Pull requests from outside the team run only after a collaborator comments `/gcbrun`.
- **CI image:** `idea-agro-ci-image` rebuilds it from `ci/` when a pinned tool version changes (`.node-version`, `package.json`, `pyproject.toml`, `.python-version`, `terraform/providers.tf`).
- **Deploys:** on a push to `main`, `idea-agro-<env>-api`, `-web` and `-jobs` rebuild what changed and update only the image of its service or job in the environment's project.

Checks and the CI image belong to no environment: only the one with `ci.shared = true` declares them.

Images go to `<region>-docker.pkg.dev/novalcloud-setup/containers/idea-agro/`. Each environment's Cloud Run pulls them from there, and `idea-agro-build` may update only that environment's services and job; org-setup grants the first, each module's `iam.tf` the second.

By hand, `make api-deploy`, `web-deploy`, `jobs-deploy`, `ci-image` and `ci-checks` run the same pipelines in the same project, uploading the repository as git sees it (`.ci.gcloudignore`).

## `setup.env`

Shell `KEY=value` lines that `setup/setup.sh` sources. Every variable is required, except `ARTIFACT_REGISTRY` and the lists: an empty `GCP_APIS` enables no extra API, and an empty `TF_SA_ROLES` or `TF_SA_USERS` grants nothing.

| Variable                 | What it is                                                                                                                 |
| :----------------------- | :------------------------------------------------------------------------------------------------------------------------- |
| `GCP_PROJECT_ID`         | The GCP project id                                                                                                         |
| `GCP_REGION`             | The region of the project's regional resources                                                                             |
| `ARTIFACT_REGISTRY`      | Optional: the id of a Docker repository in the project, not its full path. This product's environments have none           |
| `TF_SA`                  | The id, inside the project, of the operator service account, which Terraform applies with and CI/CD runs as                |
| `TF_STATE_BUCKET_SUFFIX` | The suffix of the Terraform state bucket, whose name is `<GCP_PROJECT_ID>-<suffix>`                                        |
| `GCP_APIS`               | Only the APIs the project needs, one per line. The setup's own APIs are always enabled and are not listed                  |
| `TF_SA_ROLES`            | The roles granted to the operator service account, one per line                                                            |
| `TF_SA_USERS`            | Who may impersonate the operator service account to run Terraform, one IAM member per line, such as `user:ana@example.org` |

`GCP_APIS`, `TF_SA_ROLES` and `TF_SA_USERS` are quoted strings that span several lines, one item per line. Blank lines are ignored.

## Secrets

No secret value ever goes in these files: they are versioned. Configuration refers to a secret by its Secret Manager name.
