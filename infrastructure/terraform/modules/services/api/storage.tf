# One file per zone, served by the API.
resource "google_storage_bucket" "zones" {
  name                        = "${var.project}-${var.zones_bucket_suffix}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels
}

resource "google_storage_bucket_iam_member" "api_reads_zones" {
  bucket = google_storage_bucket.zones.name
  role   = var.zones_reader_role
  member = google_service_account.api.member
}

# The outlines of saved zones, one file per version: people's own land, reachable only through the API.
resource "google_storage_bucket" "geometries" {
  name                        = "${var.project}-${var.geometries_bucket_suffix}"
  location                    = var.region
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  labels                      = var.labels

  # A deleted zone's outline is gone at once, not kept for days.
  soft_delete_policy {
    retention_duration_seconds = 0
  }
}

resource "google_storage_bucket_iam_member" "api_keeps_geometries" {
  bucket = google_storage_bucket.geometries.name
  role   = var.geometries_role
  member = google_service_account.api.member
}
