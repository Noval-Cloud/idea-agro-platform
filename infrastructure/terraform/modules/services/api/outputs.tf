output "service" {
  value = google_cloud_run_v2_service.api.name
}

output "url" {
  value = google_cloud_run_v2_service.api.uri
}

output "zones_bucket" {
  value = google_storage_bucket.zones.name
}
