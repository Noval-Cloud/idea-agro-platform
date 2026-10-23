output "issuer" {
  value = "https://securetoken.google.com/${var.project}"
}

output "audience" {
  value = var.project
}

output "jwks_url" {
  value = var.jwks_url
}

output "auth_domain" {
  value = local.auth_domain
}

output "browser_key" {
  value     = google_apikeys_key.browser.key_string
  sensitive = true
}
