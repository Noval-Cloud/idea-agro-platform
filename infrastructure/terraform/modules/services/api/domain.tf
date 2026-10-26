# The service at the platform's own domain, with a certificate Google manages. Cloud Run's own address stays.
resource "google_cloud_run_domain_mapping" "api" {
  count = var.domain == "" ? 0 : 1

  name     = var.domain
  location = var.region

  metadata {
    namespace = var.project
    labels    = var.labels
  }

  spec {
    route_name = google_cloud_run_v2_service.api.name
  }
}
