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
