# The mail provider's key. Terraform keeps only the container: a person puts the value in with `make mail-key`.
resource "google_secret_manager_secret" "mail_key" {
  secret_id = var.mail_key_secret_id
  labels    = var.labels

  replication {
    auto {}
  }
}
