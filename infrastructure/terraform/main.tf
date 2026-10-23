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

module "api" {
  source = "./modules/services/api"

  project        = var.project
  region         = var.region
  builder_member = module.platform.builder_member
}
