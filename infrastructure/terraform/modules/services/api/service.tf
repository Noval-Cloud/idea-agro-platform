resource "google_cloud_run_v2_service" "api" {
  name                = var.name
  location            = var.region
  ingress             = "INGRESS_TRAFFIC_ALL"
  deletion_protection = false
  # The organization only allows its own members in IAM, so a public API skips the invoker check.
  invoker_iam_disabled = var.public
  labels               = var.labels

  template {
    service_account = google_service_account.api.email

    scaling {
      max_instance_count = var.max_instances
    }

    containers {
      image = var.placeholder_image

      ports {
        container_port = var.port
      }

      env {
        name  = "ZONES_SOURCE"
        value = "gs://${google_storage_bucket.zones.name}"
      }

      resources {
        cpu_idle = var.cpu_idle
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
      }
    }
  }

  # The image belongs to the deploy: Terraform never changes it after creation.
  lifecycle {
    ignore_changes = [template[0].containers[0].image, client, client_version]
  }
}
