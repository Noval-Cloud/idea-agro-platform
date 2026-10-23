resource "google_service_account" "jobs" {
  account_id   = var.account_id
  display_name = "Data jobs"
}

resource "google_cloud_run_v2_job" "data" {
  name                = var.name
  location            = var.region
  deletion_protection = false
  labels              = var.labels

  template {
    template {
      service_account = google_service_account.jobs.email
      timeout         = var.timeout
      max_retries     = var.max_retries

      containers {
        image = var.placeholder_image
        args  = var.args

        env {
          name  = "PUBLIC_DATA"
          value = "gs://${var.zones_bucket}"
        }
        env {
          name  = "VALUES_STORE"
          value = "bigquery://${var.project}/${var.values_dataset}"
        }
        env {
          name  = "EARTH_ENGINE_PROJECT"
          value = var.project
        }

        resources {
          limits = {
            cpu    = var.cpu
            memory = var.memory
          }
        }
      }
    }
  }

  # The image belongs to the deploy: Terraform never changes it after creation.
  lifecycle {
    ignore_changes = [template[0].template[0].containers[0].image, client, client_version]
  }
}
