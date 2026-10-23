# Configured per environment at init: -backend-config=../environments/<env>/backend.tfvars
terraform {
  backend "gcs" {}
}
