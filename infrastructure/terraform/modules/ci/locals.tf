locals {
  enabled         = var.github_connection != "" ? 1 : 0
  service_account = "projects/${var.project}/serviceAccounts/${var.builder_email}"
  ci_image        = "${var.image_repository}/${var.ci_image_name}:latest"
}
