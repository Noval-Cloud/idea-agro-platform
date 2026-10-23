variable "project" {
  description = "The GCP project id"
  type        = string
}

variable "app_origins" {
  description = "Origins of the apps people sign in from, such as https://example.org"
  type        = list(string)
}

variable "jwks_url" {
  description = "Where the public keys that sign the provider's tokens are published"
  type        = string
  default     = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
}

variable "browser_key_services" {
  description = "The only APIs the browser's sign-in key may call"
  type        = list(string)
  default     = ["identitytoolkit.googleapis.com", "securetoken.googleapis.com"]
}

variable "firestore_database" {
  description = "The Firestore database whose direct access from browsers is closed"
  type        = string
}

variable "csp" {
  description = "Origins the provider's sign-in needs in the website's Content Security Policy"
  type = object({
    connect = list(string)
    script  = list(string)
    images  = list(string)
  })
  default = {
    connect = ["https://identitytoolkit.googleapis.com", "https://securetoken.googleapis.com"]
    # The popup sign-in loads Google's iframe helper.
    script = ["https://apis.google.com"]
    # Profile pictures.
    images = ["https://lh3.googleusercontent.com"]
  }
}
