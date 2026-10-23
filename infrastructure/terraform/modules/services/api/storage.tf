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
