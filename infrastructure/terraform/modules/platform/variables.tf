variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the regional resources"
  type        = string
}

variable "firestore_delete_protection" {
  description = "Whether the database refuses to be deleted"
  type        = bool
  default     = true
}

variable "firestore_backup_retention_days" {
  description = "Days each daily backup of the database is kept"
  type        = number
  default     = 7
}

variable "values_dataset" {
  description = "Id of the BigQuery dataset of the zones' values"
  type        = string
  default     = "zone_values"
}

variable "alert_emails" {
  description = "Emails the platform's alerts go to"
  type        = list(string)
  default     = []
}
