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

output "outlines_prefix" {
  value = var.outlines_prefix
}

output "series_suffix" {
  value = var.series_suffix
}

output "dns_records" {
  description = "The DNS records the domain mapping waits for"
  value = flatten([
    for mapping in google_cloud_run_domain_mapping.api : [
      for record in mapping.status[0].resource_records : { name = mapping.name, type = record.type, rrdata = record.rrdata }
    ]
  ])
}
