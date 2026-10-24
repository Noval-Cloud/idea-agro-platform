locals {
  service_account = "projects/${var.project}/serviceAccounts/${var.builder_email}"
  ci_image        = "${var.image_repository}/${var.ci_image_name}:latest"
  # Deploy triggers are named after the environment they deploy to, since every environment's live in one project.
  deploy_prefix = "${var.product}-${var.environment}"
}
