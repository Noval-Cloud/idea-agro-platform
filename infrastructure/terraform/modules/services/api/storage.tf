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

# The API rebuilds a zone's series file from BigQuery when it falls behind.
resource "google_storage_bucket_iam_member" "api_writes_series" {
  bucket = google_storage_bucket.zones.name
  role   = var.series_role
  member = google_service_account.api.member

  condition {
    title      = "series-only"
    expression = "resource.name.startsWith(\"projects/_/buckets/${google_storage_bucket.zones.name}/objects/series/\")"
  }
}

resource "google_bigquery_dataset_iam_member" "api_reads_values" {
  project    = var.project
  dataset_id = var.values_dataset
  role       = var.values_role
  member     = google_service_account.api.member
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
