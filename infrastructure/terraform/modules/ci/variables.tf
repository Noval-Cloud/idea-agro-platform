variable "project" {
  description = "GCP project id"
  type        = string
}

variable "region" {
  description = "Region of the Cloud Build triggers and the repository link"
  type        = string
}

variable "github_connection" {
  description = "Full name of the Cloud Build connection to GitHub, made once in the console; empty creates no triggers"
  type        = string
  default     = ""
}

variable "repository_name" {
  description = "Name of the repository link under the connection"
  type        = string
  default     = "idea-agro-platform"
}

variable "repository_uri" {
  description = "Clone URL of the repository"
  type        = string
  default     = "https://github.com/Noval-Cloud/idea-agro-platform.git"
}

variable "main_branch" {
  description = "Branch pattern that pull requests target and that deploys"
  type        = string
  default     = "^main$"
}

variable "builder_email" {
  description = "Service account the triggers run as"
  type        = string
}

variable "image_repository" {
  description = "Artifact Registry path images are pushed to"
  type        = string
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
  default     = ["services/jobs/**", "pyproject.toml", "uv.lock", ".python-version"]
}

variable "external_pull_requests" {
  description = "When pull requests from outside the team run the checks: only after a collaborator comments /gcbrun"
  type        = string
  default     = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
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
