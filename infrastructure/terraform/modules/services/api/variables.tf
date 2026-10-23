variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the Cloud Run service and its bucket"
  type        = string
}

variable "builder_member" {
  description = "IAM member of the build identity, which deploys the service's image"
  type        = string
}

variable "name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "api"
}

variable "account_id" {
  description = "Account id of the service's identity, 6 to 30 characters"
  type        = string
  default     = "api-service"
}

variable "zones_bucket_suffix" {
  description = "Suffix of the bucket of per-zone files, after the project id"
  type        = string
  default     = "zones"
}

variable "zones_reader_role" {
  description = "Role that lets the API read the per-zone files"
  type        = string
  default     = "roles/storage.objectViewer"
}

variable "placeholder_image" {
  description = "Image the service is created with, until the first deploy replaces it"
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "port" {
  description = "Port the container listens on"
  type        = number
  default     = 8080
}

variable "cpu" {
  description = "CPU limit of an instance"
  type        = string
  default     = "1"
}

variable "memory" {
  description = "Memory limit of an instance"
  type        = string
  default     = "512Mi"
}

variable "cpu_idle" {
  description = "Whether CPU is allocated only while a request is served"
  type        = bool
  default     = true
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 3
}

variable "public" {
  description = "Whether anyone may call the service, without an IAM check"
  type        = bool
  default     = true
}

variable "deployer_role" {
  description = "Role that lets the build identity update the service's image"
  type        = string
  default     = "roles/run.developer"
}

variable "act_as_role" {
  description = "Role that lets the build identity deploy revisions running as the service's account"
  type        = string
  default     = "roles/iam.serviceAccountUser"
}

variable "labels" {
  description = "Labels of the service and its bucket, on top of the environment's"
  type        = map(string)
  default     = { owner = "api" }
}

variable "auth_issuer" {
  description = "Issuer of the tokens the API accepts"
  type        = string
}

variable "auth_audience" {
  description = "Audience of the tokens the API accepts"
  type        = string
}

variable "auth_jwks_url" {
  description = "Where the keys that sign those tokens are published"
  type        = string
}

variable "records_database" {
  description = "The Firestore database that holds accounts, saved zones and projects"
  type        = string
}

variable "project_roles" {
  description = "Roles of the API on the project: reading and writing records"
  type        = list(string)
  default     = ["roles/datastore.user"]
}

variable "identity_role_id" {
  description = "Id of the custom role that lets the API manage people's sessions at the sign-in provider"
  type        = string
  default     = "apiAccountSessions"
}

variable "identity_permissions" {
  description = "The only provider permissions the API needs: reading a person and ending their sessions"
  type        = list(string)
  default     = ["firebaseauth.users.get", "firebaseauth.users.update"]
}

variable "geometries_bucket_suffix" {
  description = "Suffix of the bucket of saved zones' outlines, after the project id"
  type        = string
  default     = "saved-zones"
}

variable "geometries_role" {
  description = "Role that lets the API write, read and delete saved zones' outlines"
  type        = string
  default     = "roles/storage.objectUser"
}
