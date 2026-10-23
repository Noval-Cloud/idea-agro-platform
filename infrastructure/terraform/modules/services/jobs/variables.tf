variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the Cloud Run job"
  type        = string
}

variable "builder_member" {
  description = "IAM member of the build identity, which deploys the job's image"
  type        = string
}

variable "values_dataset" {
  description = "The BigQuery dataset the job keeps the zones' values in"
  type        = string
}

variable "zones_bucket" {
  description = "The bucket of the public files the API serves, which the job publishes"
  type        = string
}

variable "name" {
  description = "Name of the Cloud Run job"
  type        = string
  default     = "data"
}

variable "account_id" {
  description = "Account id of the job's identity, 6 to 30 characters"
  type        = string
  default     = "data-jobs"
}

variable "placeholder_image" {
  description = "Image the job is created with, until the first deploy replaces it"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/job"
}

variable "args" {
  description = "Arguments of a run that does not override them: the task and its options"
  type        = list(string)
  default     = ["outlines", "values", "maps"]
}

variable "cpu" {
  description = "CPU limit of a run"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit of a run"
  type        = string
  default     = "2Gi"
}

variable "timeout" {
  description = "Longest a run may take"
  type        = string
  default     = "21600s"
}

variable "max_retries" {
  description = "Times a failed run is retried"
  type        = number
  default     = 0
}

variable "labels" {
  description = "Labels of the job and its tables, on top of the environment's"
  type        = map(string)
  default     = { owner = "jobs" }
}

variable "deployer_role" {
  description = "Role that lets the build identity update the job's image"
  type        = string
  default     = "roles/run.developer"
}

variable "act_as_role" {
  description = "Role that lets the build identity deploy the job running as its account"
  type        = string
  default     = "roles/iam.serviceAccountUser"
}

variable "project_roles" {
  description = "Roles of the job on the project: running BigQuery queries and loads, and Earth Engine computations"
  type        = list(string)
  default     = ["roles/bigquery.jobUser", "roles/earthengine.viewer", "roles/serviceusage.serviceUsageConsumer"]
}

variable "schedule" {
  description = "When the job runs by itself, in cron syntax"
  type        = string
  default     = "0 6 * * *"
}

variable "time_zone" {
  description = "Time zone of the schedule"
  type        = string
  default     = "America/Montevideo"
}

variable "invoker_role" {
  description = "Role that lets the schedule start the job"
  type        = string
  default     = "roles/run.invoker"
}

variable "dataset_role" {
  description = "Role that lets the job write the zones' values, and its staging tables"
  type        = string
  default     = "roles/bigquery.dataEditor"
}

variable "files_role" {
  description = "Role that lets the job write the public files"
  type        = string
  default     = "roles/storage.objectUser"
}
