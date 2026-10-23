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
