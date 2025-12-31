# =============================================================================
# Example Terraform Variables
# =============================================================================
# Copy this file to terraform.tfvars and fill in your values
# DO NOT commit terraform.tfvars to git!
# =============================================================================

# Google Cloud
project_id = "your-gcp-project-id"
region     = "europe-west1"

# Docker image tag (set by CI)
image_tag = "latest"

# PocketBase
pocketbase_admin_email    = "admin@isciacus.com"
pocketbase_admin_password = "your-secure-password"

# Shopify
shopify_store_url    = "https://your-store.myshopify.com"
shopify_access_token = "shpat_xxxxx"

# Google Analytics 4 (optional)
ga4_property_id    = ""
ga4_measurement_id = ""

# Inngest (optional, for production workflows)
inngest_event_key   = ""
inngest_signing_key = ""
