# Every pull request into main runs the repository's checks, and reports them on it.
resource "google_cloudbuild_trigger" "checks" {
  count = local.enabled

  location        = var.region
  name            = "checks"
  description     = "make check on every pull request into main"
  filename        = "infrastructure/ci/checks.cloudbuild.yaml"
  service_account = local.service_account
  substitutions   = { _CI_IMAGE = local.ci_image }

  repository_event_config {
    repository = google_cloudbuildv2_repository.platform[0].id
    pull_request {
      branch          = var.main_branch
      comment_control = var.external_pull_requests
    }
  }
}

resource "google_cloudbuild_trigger" "ci_image" {
  count = local.enabled

  location        = var.region
  name            = "ci-image"
  description     = "Rebuilds the CI image when its tools or their pinned versions change"
  filename        = "infrastructure/ci/image.cloudbuild.yaml"
  included_files  = var.ci_image_files
  service_account = local.service_account
  substitutions   = { _CI_IMAGE = local.ci_image }

  repository_event_config {
    repository = google_cloudbuildv2_repository.platform[0].id
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "api" {
  count = local.enabled

  location        = var.region
  name            = "api"
  description     = "Builds the API's image and updates its Cloud Run service"
  filename        = "services/api/cloudbuild.yaml"
  included_files  = var.api_files
  service_account = local.service_account
  substitutions = {
    _IMAGE_REPOSITORY = var.image_repository
    _SERVICE          = var.api_service
    _REGION           = var.region
  }

  repository_event_config {
    repository = google_cloudbuildv2_repository.platform[0].id
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "jobs" {
  count = local.enabled

  location        = var.region
  name            = "jobs"
  description     = "Builds the data jobs' image and updates their Cloud Run job"
  filename        = "services/jobs/cloudbuild.yaml"
  included_files  = var.jobs_files
  service_account = local.service_account
  substitutions = {
    _IMAGE_REPOSITORY = var.image_repository
    _JOB              = var.jobs_job
    _REGION           = var.region
  }

  repository_event_config {
    repository = google_cloudbuildv2_repository.platform[0].id
    push {
      branch = var.main_branch
    }
  }
}

resource "google_cloudbuild_trigger" "web" {
  count = local.enabled

  location        = var.region
  name            = "web"
  description     = "Builds the website and updates its Cloud Run service"
  filename        = "apps/web/cloudbuild.yaml"
  included_files  = var.web_files
  service_account = local.service_account
  substitutions = {
    _CI_IMAGE         = local.ci_image
    _IMAGE_REPOSITORY = var.image_repository
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

  repository_event_config {
    repository = google_cloudbuildv2_repository.platform[0].id
    push {
      branch = var.main_branch
    }
  }
}
