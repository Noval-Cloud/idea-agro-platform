output "builder_email" {
  value = google_service_account.builder.email
}

output "builder_member" {
  value = local.builder_member
}

output "build_sources_bucket" {
  value = google_storage_bucket.build_sources.name
}

output "image_repository" {
  value = local.image_repository
}

output "firestore_database" {
  value = google_firestore_database.main.name
}
