terraform {
  required_version = "1.17.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "8.8.0"
    }
    # Only for the resources the GA provider lacks, such as adding Firebase to the project.
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "8.8.0"
    }
  }
}

provider "google" {
  project                     = var.project
  region                      = var.region
  impersonate_service_account = var.operator_sa
  default_labels              = local.labels
}

provider "google-beta" {
  project                     = var.project
  region                      = var.region
  impersonate_service_account = var.operator_sa
  default_labels              = local.labels
}
