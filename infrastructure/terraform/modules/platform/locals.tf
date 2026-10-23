locals {
  builder_member   = "serviceAccount:${google_service_account.builder.email}"
  image_repository = "${var.region}-docker.pkg.dev/${var.project}/${var.artifact_registry}"
}
