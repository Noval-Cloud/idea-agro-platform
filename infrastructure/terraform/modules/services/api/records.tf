# Queries over the records beyond Firestore's automatic single-field indexes.

# The total size of a person's library, summed over their saved zones.
resource "google_firestore_index" "saved_zones_by_owner_and_size" {
  project    = var.project
  database   = var.records_database
  collection = "saved_zones"

  fields {
    field_path = "owner"
    order      = "ASCENDING"
  }

  fields {
    field_path = "size"
    order      = "ASCENDING"
  }
}

# A project's latest activity, newest first.
resource "google_firestore_index" "activity_by_project_and_time" {
  project    = var.project
  database   = var.records_database
  collection = "activity"

  fields {
    field_path = "project"
    order      = "ASCENDING"
  }

  fields {
    field_path = "at"
    order      = "DESCENDING"
  }
}
