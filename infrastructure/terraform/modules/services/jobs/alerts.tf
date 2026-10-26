# Any error of the job or of its schedule: a failed run, or the job reporting that new data stopped arriving.
resource "google_monitoring_alert_policy" "data" {
  display_name          = "Data job: failed, or data stopped arriving"
  combiner              = "OR"
  notification_channels = var.alert_channels
  user_labels           = var.labels

  conditions {
    display_name = "An error logged by the data job or its schedule"

    condition_matched_log {
      filter = <<-EOT
        severity>=ERROR AND (
          (resource.type="cloud_run_job" AND resource.labels.job_name="${google_cloud_run_v2_job.data.name}") OR
          (resource.type="cloud_scheduler_job" AND resource.labels.job_id="${google_cloud_scheduler_job.daily.name}")
        )
      EOT
    }
  }

  alert_strategy {
    # A failed run logs several errors: one email for them.
    notification_rate_limit {
      period = var.alert_rate_limit
    }
    auto_close = var.alert_auto_close
  }

  documentation {
    mime_type = "text/markdown"
    subject   = "IDEA-Agro: the data job needs a look"
    content   = <<-EOT
      The data job (`${google_cloud_run_v2_job.data.name}`) or its daily schedule logged an error: a failed run, or new satellite data that stopped arriving.

      Read the job's latest logs in Cloud Logging. `services/jobs/README.md` (Alerts) says what each error means and what to do.
    EOT
  }
}
