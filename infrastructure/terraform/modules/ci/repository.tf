# The repository, under the GitHub connection the console made (it installs the Cloud Build app on the organization).
resource "google_cloudbuildv2_repository" "platform" {
  count = local.enabled

  location          = var.region
  name              = var.repository_name
  parent_connection = var.github_connection
  remote_uri        = var.repository_uri
}
