# The build identity deploys this service's image.
resource "google_cloud_run_v2_service_iam_member" "builder_deploys" {
  name     = google_cloud_run_v2_service.web.name
  location = google_cloud_run_v2_service.web.location
  role     = var.deployer_role
  member   = var.builder_member
}

resource "google_service_account_iam_member" "builder_acts_as_web" {
  service_account_id = google_service_account.web.name
  role               = var.act_as_role
  member             = var.builder_member
}
