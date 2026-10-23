output "job" {
  value = google_cloud_run_v2_job.data.name
}

output "member" {
  value = google_service_account.jobs.member
}
