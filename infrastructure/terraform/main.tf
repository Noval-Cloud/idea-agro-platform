module "platform" {
  source = "./modules/platform"

  project           = var.project
  region            = var.region
  artifact_registry = var.artifact_registry
}

module "web" {
  source = "./modules/services/web"

  region         = var.region
  builder_member = module.platform.builder_member
}

module "identity" {
  source = "./modules/identity"

  project            = var.project
  app_origins        = concat([module.web.url], var.auth_local_origins)
  firestore_database = module.platform.firestore_database
}

module "api" {
  source = "./modules/services/api"

  project           = var.project
  region            = var.region
  builder_member    = module.platform.builder_member
  auth_issuer       = module.identity.issuer
  auth_audience     = module.identity.audience
  auth_jwks_url     = module.identity.jwks_url
  accounts_database = module.platform.firestore_database
}
