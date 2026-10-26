# The build identity deploys this job's image.
resource "google_cloud_run_v2_job_iam_member" "builder_deploys" {
  name     = google_cloud_run_v2_job.data.name
  location = google_cloud_run_v2_job.data.location
  role     = var.deployer_role
  member   = var.builder_member
}

resource "google_service_account_iam_member" "builder_acts_as_jobs" {
  service_account_id = google_service_account.jobs.name
  role               = var.act_as_role
  member             = var.builder_member
}

resource "google_project_iam_member" "jobs" {
  for_each = toset(var.project_roles)

  project = var.project
  role    = each.value
  member  = google_service_account.jobs.member
}

resource "google_bigquery_dataset_iam_member" "jobs_write_values" {
  project    = var.project
  dataset_id = var.values_dataset
  role       = var.dataset_role
  member     = google_service_account.jobs.member
}

resource "google_storage_bucket_iam_member" "jobs_publish" {
  bucket = var.zones_bucket
  role   = var.files_role
  member = google_service_account.jobs.member
}

# The saved zones' outlines are the API's: the job reads them, and writes only their series.
resource "google_storage_bucket_iam_member" "jobs_read_outlines" {
  bucket = var.saved_zones_bucket
  role   = var.outlines_role
  member = google_service_account.jobs.member
}

resource "google_storage_bucket_iam_member" "jobs_write_series" {
  bucket = var.saved_zones_bucket
  role   = var.series_role
  member = google_service_account.jobs.member

  condition {
    title      = "Saved zones' series only"
    expression = "resource.name.endsWith(\"${var.series_suffix}\")"
  }
}
