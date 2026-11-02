locals {
  service_account = "projects/${var.project}/serviceAccounts/${var.builder_email}"
  ci_image        = "${var.image_repository}/${var.ci_image_name}:latest"
  # Deploy triggers are named after the environment they deploy to, since every environment's live in one project.
  deploy_prefix = "${var.product}-${var.environment}"
  # What the website's build reads, the same whether a push or a publish starts it.
  web_substitutions = {
    _CI_IMAGE         = local.ci_image
    _IMAGE_REPOSITORY = var.image_repository
    _PROJECT          = var.deploy_project
    _SERVICE          = var.web_service
    _REGION           = var.region
    _SITE_URL         = var.web_settings.site_url
    _API_URL          = var.web_settings.api_url
    _AUTH_DOMAIN      = var.web_settings.auth_domain
    _AUTH_KEY         = var.web_settings.auth_key
    _CSP_CONNECT      = join(" ", var.web_settings.csp["connect"])
    _CSP_FRAME        = join(" ", var.web_settings.csp["frame"])
    _CSP_SCRIPT       = join(" ", var.web_settings.csp["script"])
    _CSP_IMAGES       = join(" ", var.web_settings.csp["images"])
  }
}
