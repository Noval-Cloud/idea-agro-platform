variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "region" {
  description = "The region of the Cloud Run service"
  type        = string
}

variable "builder_member" {
  description = "IAM member of the build identity, which deploys the service's image"
  type        = string
}

variable "name" {
  description = "Name of the Cloud Run service"
  type        = string
  default     = "web"
}

variable "account_id" {
  description = "Account id of the service's identity, 6 to 30 characters"
  type        = string
  default     = "website"
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
  default     = "256Mi"
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
  description = "Labels of the service, on top of the environment's"
  type        = map(string)
  default     = { owner = "web" }
}

variable "domain" {
  description = "The domain the service answers at besides Cloud Run's address; empty maps none"
  type        = string
  default     = ""
}
