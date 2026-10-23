# Accounts and sign-in: Firebase Authentication on Identity Platform. Google as a provider is enabled by hand
# in the Firebase console, which creates its OAuth client (see infrastructure/README.md).
resource "google_firebase_project" "this" {
  provider = google-beta
  project  = var.project
}

resource "google_identity_platform_config" "this" {
  project            = var.project
  authorized_domains = local.authorized_domains

  # Google only: email and phone sign-in arrive later, with two-factor authentication.
  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = false
      password_required = false
    }

    phone_number {
      enabled = false
    }
  }

  depends_on = [google_firebase_project.this]
}

# The browser's key: it only reaches the sign-in APIs, and only from our own pages.
resource "google_apikeys_key" "browser" {
  name         = "browser-sign-in"
  display_name = "Browser sign-in"
  project      = var.project

  restrictions {
    dynamic "api_targets" {
      for_each = var.browser_key_services
      content {
        service = api_targets.value
      }
    }

    browser_key_restrictions {
      allowed_referrers = local.allowed_referrers
    }
  }
}

# Adding Firebase opens Firestore to browsers through its SDK: every record goes through the API, so close it.
resource "google_firebaserules_ruleset" "firestore" {
  project = var.project

  source {
    files {
      name    = "firestore.rules"
      content = "rules_version = '2';\nservice cloud.firestore {\n  match /databases/{database}/documents {\n    match /{document=**} {\n      allow read, write: if false;\n    }\n  }\n}\n"
    }
  }

  depends_on = [google_firebase_project.this]
}

resource "google_firebaserules_release" "firestore" {
  project      = var.project
  name         = var.firestore_database == "(default)" ? "cloud.firestore" : "cloud.firestore/${var.firestore_database}"
  ruleset_name = google_firebaserules_ruleset.firestore.name
}
