variable "project" {
  description = "The organization's CI/CD project, where the triggers live"
  type        = string
}

variable "region" {
  description = "Region of the triggers"
  type        = string
}

variable "repository" {
  description = "Id of this repository's link in the CI/CD project"
  type        = string
}

variable "builder_email" {
  description = "Service account the triggers run as: the product's build identity"
  type        = string
}

variable "image_repository" {
  description = "Artifact Registry path the product's images are pushed to"
  type        = string
}

variable "product" {
  description = "The product's name, which the triggers' names start with"
  type        = string
  default     = "idea-agro"
}

variable "environment" {
  description = "The environment the deploy triggers deploy to"
  type        = string
}

variable "deploy_project" {
  description = "The environment's project, where the deploys update the services"
  type        = string
}

variable "shared" {
  description = "Whether this environment declares the product's triggers that no environment owns: checks and the CI image"
  type        = bool
  default     = false
}

variable "main_branch" {
  description = "Branch pattern that pull requests target and that deploys"
  type        = string
  default     = "^main$"
}

variable "ci_image_name" {
  description = "Name of the image with the repository's tools"
  type        = string
  default     = "ci"
}

variable "ci_image_files" {
  description = "Files whose changes rebuild the CI image: its folder and where the tool versions are pinned"
  type        = list(string)
  default = [
    "infrastructure/ci/**",
    ".node-version",
    ".python-version",
    "package.json",
    "pyproject.toml",
    "infrastructure/terraform/providers.tf",
  ]
}

variable "api_service" {
  description = "Cloud Run service of the API"
  type        = string
}

variable "api_files" {
  description = "Files whose changes redeploy the API"
  type        = list(string)
  default     = ["services/api/**", "pyproject.toml", "uv.lock", ".python-version"]
}

variable "jobs_job" {
  description = "Cloud Run job of the data jobs"
  type        = string
}

variable "jobs_files" {
  description = "Files whose changes redeploy the data jobs"
  type        = list(string)
  default     = ["services/jobs/**", "apps/web/src/design/generated/map-theme.json", "pyproject.toml", "uv.lock", ".python-version"]
}

variable "web_service" {
  description = "Cloud Run service of the website"
  type        = string
}

variable "web_files" {
  description = "Files whose changes redeploy the website"
  type        = list(string)
  default     = ["apps/web/**", "packages/**", "package.json", "pnpm-lock.yaml", "pnpm-workspace.yaml"]
}

variable "web_settings" {
  description = "What the website's build reads: its own and the API's addresses, and the sign-in provider's settings"
  type = object({
    site_url    = string
    api_url     = string
    auth_domain = string
    auth_key    = string
    csp         = map(list(string))
  })
  sensitive = true
}

variable "external_pull_requests" {
  description = "Who may run the checks on a pull request: collaborators, or anyone after a collaborator comments /gcbrun"
  type        = string
  default     = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
}
