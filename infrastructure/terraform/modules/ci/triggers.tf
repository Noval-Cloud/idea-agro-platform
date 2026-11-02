# Every pull request into main runs the repository's checks, and reports them on it.
resource "google_cloudbuild_trigger" "checks" {
  count = var.shared ? 1 : 0

  project         = var.project
  location        = var.region
  name            = "${var.product}-checks"
  description     = "make check on every pull request into main"
  filename        = "infrastructure/ci/checks.cloudbuild.yaml"
  service_account = local.service_account
  substitutions   = { _CI_IMAGE = local.ci_image }

  repository_event_config {
    repository = var.repository
    pull_request {
      branch          = var.main_branch
      comment_control = var.external_pull_requests
    }
  }
}

resource "google_cloudbuild_trigger" "ci_image" {
  count = var.shared ? 1 : 0

  project         = var.project
  location        = var.region
  name            = "${var.product}-ci-image"
  description     = "Rebuilds the CI image when its tools or their pinned versions change"
  filename        = "infrastructure/ci/image.cloudbuild.yaml"
  included_files  = var.ci_image_files
  service_account = local.service_account
  substitutions   = { _CI_IMAGE = local.ci_image }

  repository_event_config {
    repository = var.repository
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "api" {
  project         = var.project
  location        = var.region
  name            = "${local.deploy_prefix}-api"
  description     = "Builds the API's image and updates its Cloud Run service in ${var.environment}"
  filename        = "services/api/cloudbuild.yaml"
  included_files  = var.api_files
  service_account = local.service_account
  substitutions = {
    _IMAGE_REPOSITORY = var.image_repository
    _PROJECT          = var.deploy_project
    _SERVICE          = var.api_service
    _REGION           = var.region
  }

  repository_event_config {
    repository = var.repository
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "jobs" {
  project         = var.project
  location        = var.region
  name            = "${local.deploy_prefix}-jobs"
  description     = "Builds the data jobs' image and updates their Cloud Run job in ${var.environment}"
  filename        = "services/jobs/cloudbuild.yaml"
  included_files  = var.jobs_files
  service_account = local.service_account
  substitutions = {
    _IMAGE_REPOSITORY = var.image_repository
    _PROJECT          = var.deploy_project
    _JOB              = var.jobs_job
    _REGION           = var.region
  }

  repository_event_config {
    repository = var.repository
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "web" {
  project         = var.project
  location        = var.region
  name            = "${local.deploy_prefix}-web"
  description     = "Builds the website and updates its Cloud Run service in ${var.environment}"
  filename        = "apps/web/cloudbuild.yaml"
  included_files  = var.web_files
  service_account = local.service_account
  substitutions   = local.web_substitutions

  repository_event_config {
    repository = var.repository
    push {
      branch = var.main_branch
    }
  }
}

# Editors' published texts rebuild the website from main: the API and the data job publish to this topic, and only
# this trigger builds.
resource "google_pubsub_topic" "web_rebuild" {
  project = var.project
  name    = "${local.deploy_prefix}-web-rebuild"
}

resource "google_cloudbuild_trigger" "web_rebuild" {
  project         = var.project
  location        = var.region
  name            = "${local.deploy_prefix}-web-rebuild"
  description     = "Rebuilds the website in ${var.environment} with the texts editors published"
  service_account = local.service_account
  substitutions   = local.web_substitutions

  pubsub_config {
    topic = google_pubsub_topic.web_rebuild.id
  }

  source_to_build {
    repository = var.repository
    ref        = var.rebuild_ref
    repo_type  = var.repository_type
  }

  git_file_source {
    path       = "apps/web/cloudbuild.yaml"
    repository = var.repository
    revision   = var.rebuild_ref
    repo_type  = var.repository_type
  }
}
