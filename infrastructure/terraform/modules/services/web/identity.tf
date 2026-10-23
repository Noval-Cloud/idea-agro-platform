resource "google_service_account" "web" {
  account_id   = var.account_id
  display_name = "Website"
}
