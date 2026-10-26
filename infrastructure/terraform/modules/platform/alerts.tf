# Where the platform's alerts are emailed.
resource "google_monitoring_notification_channel" "email" {
  for_each = toset(var.alert_emails)

  display_name = "IDEA-Agro alerts: ${each.value}"
  type         = "email"
  labels = {
    email_address = each.value
  }
}
