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

variable "artifact_registry" {
  description = "Id of the Docker repository in Artifact Registry, created by the setup"
  type        = string
}

variable "auth_local_origins" {
  description = "Origins besides the website's that may sign in, such as a local dev server"
  type        = list(string)
  default     = []
}
