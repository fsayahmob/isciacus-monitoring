# =============================================================================
# Terraform Variables - ISCIACUS Monitoring
# =============================================================================

variable "project_id" {
  description = "Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "Google Cloud region for Cloud Run services"
  type        = string
  default     = "europe-west1"
}

variable "image_tag" {
  description = "Docker image tag (typically git SHA)"
  type        = string
}

variable "pocketbase_admin_email" {
  description = "PocketBase admin email"
  type        = string
  default     = "admin@isciacus.com"
}

variable "pocketbase_admin_password" {
  description = "PocketBase admin password"
  type        = string
  sensitive   = true
}

variable "shopify_store_url" {
  description = "Shopify store URL"
  type        = string
  sensitive   = true
}

variable "shopify_access_token" {
  description = "Shopify access token"
  type        = string
  sensitive   = true
}

variable "ga4_property_id" {
  description = "Google Analytics 4 property ID"
  type        = string
  default     = ""
}

variable "ga4_measurement_id" {
  description = "Google Analytics 4 measurement ID"
  type        = string
  default     = ""
}

variable "inngest_event_key" {
  description = "Inngest event key for production"
  type        = string
  sensitive   = true
  default     = ""
}

variable "inngest_signing_key" {
  description = "Inngest signing key for production"
  type        = string
  sensitive   = true
  default     = ""
}
