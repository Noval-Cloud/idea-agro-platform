locals {
  # The provider's sign-in pages are served from this domain.
  auth_domain        = "${var.project}.firebaseapp.com"
  app_hosts          = [for origin in var.app_origins : regex("^https?://([^:/]+)", origin)[0]]
  authorized_domains = distinct(concat([local.auth_domain], local.app_hosts))
  allowed_referrers  = concat([for origin in var.app_origins : "${origin}/*"], ["https://${local.auth_domain}/*"])
}
