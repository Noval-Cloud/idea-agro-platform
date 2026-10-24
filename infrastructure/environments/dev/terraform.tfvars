environment        = "dev"
project            = "idea-agro-dev"
region             = "us-central1"
operator_sa        = "terraform-operator@idea-agro-dev.iam.gserviceaccount.com"
auth_local_origins = ["http://localhost:4321"]
admin_emails       = ["yoel@noval.cloud"]

# From Noval-Cloud/org-setup's outputs.
ci = {
  project          = "novalcloud-setup"
  repository       = "projects/novalcloud-setup/locations/us-central1/connections/github/repositories/idea-agro-platform"
  builder_email    = "idea-agro-build@novalcloud-setup.iam.gserviceaccount.com"
  image_repository = "us-central1-docker.pkg.dev/novalcloud-setup/containers/idea-agro"
  sources_bucket   = "novalcloud-setup-build-sources"
  shared           = true
}
