# The structure every service shares: accounts, zones and projects.
resource "google_firestore_database" "main" {
  project                 = var.project
  name                    = "(default)"
  location_id             = var.region
  type                    = "FIRESTORE_NATIVE"
  delete_protection_state = var.firestore_delete_protection ? "DELETE_PROTECTION_ENABLED" : "DELETE_PROTECTION_DISABLED"
}

resource "google_firestore_backup_schedule" "daily" {
  project   = var.project
  database  = google_firestore_database.main.name
  retention = "${var.firestore_backup_retention_days * 86400}s"

  daily_recurrence {}
}
