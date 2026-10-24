output "firestore_database" {
  value = google_firestore_database.main.name
}

output "values_dataset" {
  value = google_bigquery_dataset.values.dataset_id
}
