output "service" {
  value = google_cloud_run_v2_service.web.name
}

output "url" {
  value = google_cloud_run_v2_service.web.uri
}

output "dns_records" {
  description = "The DNS records the domain mapping waits for"
  value = flatten([
    for mapping in google_cloud_run_domain_mapping.web : [
      for record in mapping.status[0].resource_records : { name = mapping.name, type = record.type, rrdata = record.rrdata }
    ]
  ])
}
