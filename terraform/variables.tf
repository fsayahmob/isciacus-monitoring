# =============================================================================
# Terraform Variables - ISCIACUS Monitoring
# =============================================================================
# SECRETS REQUIS (uniquement GCP):
#   - project_id : ID du projet Google Cloud
#   - (credentials via GOOGLE_APPLICATION_CREDENTIALS ou gcloud auth)
#
# Les secrets métier (Shopify, GA4, etc.) sont stockés dans la base SQLite
# du backend et configurables via la page Settings du dashboard.
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
