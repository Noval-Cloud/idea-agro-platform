output "ci_image" {
  value = local.ci_image
}

output "web_rebuild_topic" {
  description = "Topic whose messages rebuild the website: `projects/<project>/topics/<name>`"
  value       = google_pubsub_topic.web_rebuild.id
}
