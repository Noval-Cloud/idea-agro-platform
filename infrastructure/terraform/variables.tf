variable "environment" {
  description = "The environment this state belongs to"
  type        = string

  validation {
    condition     = contains(["dev", "qa", "prd"], var.environment)
    error_message = "environment must be dev, qa or prd."
  }
}

variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the regional resources"
  type        = string
}

variable "operator_sa" {
  description = "Email of the operator service account Terraform runs as"
  type        = string
}

variable "auth_local_origins" {
  description = "Origins besides the website's that may sign in, such as a local dev server"
  type        = list(string)
  default     = []
}

variable "alert_emails" {
  description = "Emails the platform's alerts go to, such as a failed data job"
  type        = list(string)
  default     = []
}

variable "admin_emails" {
  description = "Emails made admins when they sign in with them verified: the first admins, who name the rest"
  type        = list(string)
  default     = []
}

variable "ci" {
  description = "The organization's CI/CD project, from org-setup's outputs: where this product builds and keeps its images"
  type = object({
    project = string
    # The link to this repository, under the project's connection to GitHub.
    repository = string
    # The product's build identity, which the triggers and the deploys run as.
    builder_email = string
    # Where the product's images go, under the shared Docker repository.
    image_repository = string
    # Where builds submitted by hand upload their sources.
    sources_bucket = string
    # Whether this environment declares the triggers no environment owns: checks and the CI image.
    shared = bool
  })
}

variable "earth_engine_project" {
  description = "Cloud project registered for Earth Engine where the data job computes"
  type        = string
}

variable "domain" {
  description = "The platform's own domain, such as idea-agro.org, verified in Search Console with the operator as an owner; empty keeps the run.app addresses only"
  type        = string
  default     = ""
}

variable "api_subdomain" {
  description = "Where the API answers under the domain"
  type        = string
  default     = "api"
}
