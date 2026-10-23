output "project" {
  value = var.project
}

output "region" {
  value = var.region
}

output "image_repository" {
  value = module.platform.image_repository
}

output "builder_email" {
  value = module.platform.builder_email
}

output "build_sources_bucket" {
  value = module.platform.build_sources_bucket
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
