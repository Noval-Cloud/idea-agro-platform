# Every day the job adds what is new; a run with nothing new ends in seconds.
resource "google_cloud_scheduler_job" "daily" {
  name      = "${var.name}-daily"
  region    = var.region
  schedule  = var.schedule
  time_zone = var.time_zone

  http_target {
    http_method = "POST"
    uri         = "https://run.googleapis.com/v2/projects/${var.project}/locations/${var.region}/jobs/${google_cloud_run_v2_job.data.name}:run"

    oauth_token {
      service_account_email = google_service_account.jobs.email
    }
  }
}

resource "google_cloud_run_v2_job_iam_member" "schedule_runs" {
  name     = google_cloud_run_v2_job.data.name
  location = google_cloud_run_v2_job.data.location
  role     = var.invoker_role
  member   = google_service_account.jobs.member
}
