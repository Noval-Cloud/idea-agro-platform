module "platform" {
  source = "./modules/platform"

  project      = var.project
  region       = var.region
  alert_emails = var.alert_emails
}

module "web" {
  source = "./modules/services/web"

  region         = var.region
  builder_member = local.builder_member
}

module "identity" {
  source = "./modules/identity"

  project            = var.project
  app_origins        = concat([module.web.url], var.auth_local_origins)
  firestore_database = module.platform.firestore_database
}

module "api" {
  source = "./modules/services/api"

  project          = var.project
  region           = var.region
  builder_member   = local.builder_member
  auth_issuer      = module.identity.issuer
  auth_audience    = module.identity.audience
  auth_jwks_url    = module.identity.jwks_url
  records_database = module.platform.firestore_database
  values_dataset   = module.platform.values_dataset
  admin_emails     = var.admin_emails
  site_url         = module.web.url
}

module "jobs" {
  source = "./modules/services/jobs"

  project        = var.project
  region         = var.region
  builder_member = local.builder_member
  values_dataset = module.platform.values_dataset
  zones_bucket   = module.api.zones_bucket

  earth_engine_project = var.earth_engine_project
  alert_channels       = module.platform.alert_channels
}

module "ci" {
  source = "./modules/ci"

  project          = var.ci.project
  region           = var.region
  repository       = var.ci.repository
  builder_email    = var.ci.builder_email
  image_repository = var.ci.image_repository
  environment      = var.environment
  deploy_project   = var.project
  shared           = var.ci.shared
  api_service      = module.api.service
  jobs_job         = module.jobs.job
  web_service      = module.web.service
  web_settings = {
    site_url    = module.web.url
    api_url     = module.api.url
    auth_domain = module.identity.auth_domain
    auth_key    = module.identity.browser_key
    csp         = module.identity.csp
  }
}
