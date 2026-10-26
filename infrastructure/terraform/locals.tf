locals {
  labels = {
    project = var.project
    env     = var.environment
  }
  builder_member = "serviceAccount:${var.ci.builder_email}"
  # The platform's own addresses once `domain` is set; Cloud Run's otherwise. Cloud Run's keep working either way.
  site_url = var.domain == "" ? module.web.url : "https://${var.domain}"
  api_url  = var.domain == "" ? module.api.url : "https://${var.api_subdomain}.${var.domain}"
}
