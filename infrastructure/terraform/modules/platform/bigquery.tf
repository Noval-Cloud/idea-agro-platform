# Every zone's values, one row per zone, indicator and period: the data jobs write them, the API reads them.
resource "google_bigquery_dataset" "values" {
  project     = var.project
  dataset_id  = var.values_dataset
  location    = var.region
  description = "Every zone's values, one row per zone, indicator and period"
}
