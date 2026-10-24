locals {
  labels = {
    project = var.project
    env     = var.environment
  }
  builder_member = "serviceAccount:${var.ci.builder_email}"
}
