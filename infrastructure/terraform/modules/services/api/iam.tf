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

# Narrower than the provider's admin role, which could also change the sign-in settings themselves.
resource "google_project_iam_custom_role" "identity" {
  project     = var.project
  role_id     = var.identity_role_id
  title       = "API account sessions"
  description = "Read people and end their sessions at the sign-in provider"
  permissions = var.identity_permissions
}

resource "google_project_iam_member" "api_identity" {
  project = var.project
  role    = google_project_iam_custom_role.identity.id
  member  = google_service_account.api.member
}

resource "google_secret_manager_secret_iam_member" "api_reads_mail_key" {
  secret_id = google_secret_manager_secret.mail_key.id
  role      = var.secret_reader_role
  member    = google_service_account.api.member
}
