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
  default     = ["outlines", "values", "maps", "saved"]
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

variable "earth_engine_project" {
  description = "Cloud project registered for Earth Engine that the job computes in, which may be another than its own"
  type        = string
}

variable "alert_channels" {
  description = "Notification channels the job's alerts go to"
  type        = list(string)
  default     = []
}

variable "alert_rate_limit" {
  description = "Least time between two emails of the job's alert"
  type        = string
  default     = "3600s"
}

variable "alert_auto_close" {
  description = "Time after which an alert with no new error closes by itself"
  type        = string
  default     = "86400s"
}

variable "environment_labels" {
  description = "The environment's labels, for the resources the provider's default labels do not reach"
  type        = map(string)
  default     = {}
}

variable "saved_zones_bucket" {
  description = "The API's private bucket of saved zones' outlines, next to which the job keeps their series"
  type        = string
}

variable "outlines_role" {
  description = "Role that lets the job list and read the saved zones' outlines"
  type        = string
  default     = "roles/storage.objectViewer"
}

variable "series_role" {
  description = "Role that lets the job write and delete the saved zones' series, and nothing else in their bucket"
  type        = string
  default     = "roles/storage.objectUser"
}

variable "outlines_prefix" {
  description = "Where the saved zones' outlines are in their bucket, which bounds what the job may read and write"
  type        = string
}

variable "series_suffix" {
  description = "How the names of the saved zones' series end, which bounds what the job may write"
  type        = string
}

variable "outlines_condition_title" {
  description = "Title of the condition that keeps the job's reading to the outlines"
  type        = string
  default     = "Saved zones' outlines only"
}

variable "series_condition_title" {
  description = "Title of the condition that keeps the job's writing to the series"
  type        = string
  default     = "Saved zones' series only"
}
