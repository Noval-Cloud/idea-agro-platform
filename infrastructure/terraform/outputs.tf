output "project" {
  value = var.project
}

output "region" {
  value = var.region
}

output "ci_project" {
  value = var.ci.project
}

output "image_repository" {
  value = var.ci.image_repository
}

output "builder_email" {
  value = var.ci.builder_email
}

output "build_sources_bucket" {
  value = var.ci.sources_bucket
}

output "web_service" {
  value = module.web.service
}

output "web_url" {
  value = module.web.url
}

output "api_service" {
  value = module.api.service
}

output "api_url" {
  value = module.api.url
}

output "jobs_job" {
  value = module.jobs.job
}

output "values_dataset" {
  value = module.platform.values_dataset
}

output "zones_bucket" {
  value = module.api.zones_bucket
}

output "auth_domain" {
  value = module.identity.auth_domain
}

output "auth_browser_key" {
  value     = module.identity.browser_key
  sensitive = true
}

output "auth_csp" {
  value = module.identity.csp
}

output "ci_image" {
  value = module.ci.ci_image
}
