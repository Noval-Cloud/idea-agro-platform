locals {
  # The column that names each table's period.
  periods = {
    composites = {
      name        = "start"
      type        = "DATE"
      description = "First day of the composite"
    }
    years = {
      name        = "year"
      type        = "INTEGER"
      description = "The year: productive, from July to June, for productivity, radiation and evapotranspiration"
    }
    summaries = {
      name        = "statistic"
      type        = "STRING"
      description = "mean, p25 or p75, or a class of a categorical map"
    }
  }
}

# The job is these tables' only writer.
resource "google_bigquery_table" "values" {
  for_each = local.periods

  project    = var.project
  dataset_id = var.values_dataset
  table_id   = each.key
  labels     = var.labels
  # The API reads one zone at a time, the job one division and indicator.
  clustering = ["division", "zone", "indicator"]

  schema = jsonencode([
    { name = "division", type = "STRING", mode = "REQUIRED", description = "The zone's division, such as seccionales" },
    { name = "zone", type = "STRING", mode = "REQUIRED", description = "The zone's id in its division" },
    { name = "indicator", type = "STRING", mode = "REQUIRED", description = "The indicator, such as ppna" },
    { name = each.value.name, type = each.value.type, mode = "REQUIRED", description = each.value.description },
    { name = "value", type = "FLOAT", mode = "NULLABLE", description = "Mean in the zone, in the indicator's unit; null without data" },
    { name = "computed_at", type = "TIMESTAMP", mode = "REQUIRED", description = "When the job computed the row" },
  ])
}
