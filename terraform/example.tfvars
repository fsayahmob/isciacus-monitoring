# =============================================================================
# Example Terraform Variables
# =============================================================================
# Copy this file to terraform.tfvars and fill in your values
# DO NOT commit terraform.tfvars to git!
#
# SECRETS REQUIS (uniquement GCP):
#   - project_id : ID du projet Google Cloud
#   - (credentials via GOOGLE_APPLICATION_CREDENTIALS ou gcloud auth)
#
# Les secrets métier (Shopify, GA4, etc.) sont stockés dans la base SQLite
# du backend et configurables via la page Settings du dashboard.
# =============================================================================

# Google Cloud
project_id = "your-gcp-project-id"
region     = "europe-west1"

# Docker image tag (set by CI)
image_tag = "latest"
