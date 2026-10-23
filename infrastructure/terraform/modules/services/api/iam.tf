# The build identity deploys this service's image.
resource "google_cloud_run_v2_service_iam_member" "builder_deploys" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = var.deployer_role
  member   = var.builder_member
}

resource "google_service_account_iam_member" "builder_acts_as_api" {
  service_account_id = google_service_account.api.name
  role               = var.act_as_role
  member             = var.builder_member
}

resource "google_project_iam_member" "api" {
  for_each = toset(var.project_roles)

  project = var.project
  role    = each.value
  member  = google_service_account.api.member
}
