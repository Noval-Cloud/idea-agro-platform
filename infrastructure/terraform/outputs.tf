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
  description = "The website's address: its own domain when set, else Cloud Run's"
  value       = local.site_url
}

output "api_service" {
  value = module.api.service
}

output "api_url" {
  description = "The API's address: under the domain when set, else Cloud Run's"
  value       = local.api_url
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

output "mail_key_secret" {
  value = module.api.mail_key_secret
}

output "dns_records" {
  description = "What the domain's DNS provider needs, once the mappings exist"
  value       = concat(module.web.dns_records, module.api.dns_records)
}
