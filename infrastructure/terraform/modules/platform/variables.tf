variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the regional resources"
  type        = string
}

variable "artifact_registry" {
  description = "Id of the Docker repository in Artifact Registry"
  type        = string
}

variable "builder_account_id" {
  description = "Account id of the identity Cloud Build runs as"
  type        = string
  default     = "builder"
}

variable "builder_project_roles" {
  description = "Roles of the build identity on the project"
  type        = list(string)
  default     = ["roles/logging.logWriter"]
}

variable "registry_writer_role" {
  description = "Role that lets the build identity push images"
  type        = string
  default     = "roles/artifactregistry.writer"
}

variable "sources_reader_role" {
  description = "Role that lets the build identity read the uploaded sources"
  type        = string
  default     = "roles/storage.objectViewer"
}

variable "build_sources_suffix" {
  description = "Suffix of the bucket Cloud Build reads sources from, after the project id"
  type        = string
  default     = "build-sources"
}

variable "build_sources_retention_days" {
  description = "Days an uploaded source is kept"
  type        = number
  default     = 7
}
