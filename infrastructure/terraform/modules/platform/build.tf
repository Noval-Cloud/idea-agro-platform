# The identity Cloud Build runs as, for every service's image.
resource "google_service_account" "builder" {
  account_id   = var.builder_account_id
  display_name = "Cloud Build"
}

resource "google_project_iam_member" "builder" {
  for_each = toset(var.builder_project_roles)

  project = var.project
  role    = each.value
  member  = local.builder_member
}

resource "google_artifact_registry_repository_iam_member" "builder" {
  location   = var.region
  repository = var.artifact_registry
  role       = var.registry_writer_role
  member     = local.builder_member
}

resource "google_storage_bucket" "build_sources" {
  name                        = "${var.project}-${var.build_sources_suffix}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  # Holds only uploads for builds, which are kept a few days.
  force_destroy = true

  lifecycle_rule {
    condition {
      age = var.build_sources_retention_days
    }
    action {
      type = "Delete"
    }
  }
}

resource "google_storage_bucket_iam_member" "builder_reads_sources" {
  bucket = google_storage_bucket.build_sources.name
  role   = var.sources_reader_role
  member = local.builder_member
}
