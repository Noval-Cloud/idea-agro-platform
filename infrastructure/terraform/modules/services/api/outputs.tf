output "service" {
  value = google_cloud_run_v2_service.api.name
}

output "url" {
  value = google_cloud_run_v2_service.api.uri
}

output "zones_bucket" {
  value = google_storage_bucket.zones.name
}

output "mail_key_secret" {
  value = google_secret_manager_secret.mail_key.secret_id
}

output "geometries_bucket" {
  value = google_storage_bucket.geometries.name
}
