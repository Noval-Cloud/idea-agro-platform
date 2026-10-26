output "firestore_database" {
  value = google_firestore_database.main.name
}

output "values_dataset" {
  value = google_bigquery_dataset.values.dataset_id
}

output "alert_channels" {
  value = [for channel in google_monitoring_notification_channel.email : channel.id]
}
