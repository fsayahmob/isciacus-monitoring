# =============================================================================
# Terraform Main Configuration - ISCIACUS Monitoring on Cloud Run
# =============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Backend configuration for state storage (configure in CI)
  backend "gcs" {}
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# =============================================================================
# Enable required APIs
# =============================================================================

resource "google_project_service" "cloudrun" {
  service            = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "artifactregistry" {
  service            = "artifactregistry.googleapis.com"
  disable_on_destroy = false
}

# =============================================================================
# Artifact Registry for Docker images
# =============================================================================

resource "google_artifact_registry_repository" "isciacus" {
  location      = var.region
  repository_id = "isciacus-monitoring"
  description   = "Docker repository for ISCIACUS Monitoring"
  format        = "DOCKER"

  depends_on = [google_project_service.artifactregistry]
}

# =============================================================================
# Cloud Run Service - PocketBase (Realtime Database)
# =============================================================================

resource "google_cloud_run_v2_service" "pocketbase" {
  name     = "isciacus-pocketbase"
  location = var.region

  template {
    containers {
      image = "ghcr.io/muchobien/pocketbase:latest"

      ports {
        container_port = 8090
      }

      env {
        name  = "PB_ADMIN_EMAIL"
        value = var.pocketbase_admin_email
      }

      env {
        name  = "PB_ADMIN_PASSWORD"
        value = var.pocketbase_admin_password
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      # Persistent volume for PocketBase data
      volume_mounts {
        name       = "pocketbase-data"
        mount_path = "/pb_data"
      }
    }

    volumes {
      name = "pocketbase-data"
      empty_dir {
        medium     = "MEMORY"
        size_limit = "256Mi"
      }
    }

    scaling {
      min_instance_count = 1
      max_instance_count = 2
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [google_project_service.cloudrun]
}

# =============================================================================
# Cloud Run Service - Backend (FastAPI)
# =============================================================================

resource "google_cloud_run_v2_service" "backend" {
  name     = "isciacus-backend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/isciacus-monitoring/backend:${var.image_tag}"

      ports {
        container_port = 8080
      }

      env {
        name  = "POCKETBASE_URL"
        value = google_cloud_run_v2_service.pocketbase.uri
      }

      env {
        name  = "SHOPIFY_STORE_URL"
        value = var.shopify_store_url
      }

      env {
        name  = "SHOPIFY_ACCESS_TOKEN"
        value = var.shopify_access_token
      }

      env {
        name  = "GA4_PROPERTY_ID"
        value = var.ga4_property_id
      }

      env {
        name  = "GA4_MEASUREMENT_ID"
        value = var.ga4_measurement_id
      }

      env {
        name  = "INNGEST_EVENT_KEY"
        value = var.inngest_event_key
      }

      env {
        name  = "INNGEST_SIGNING_KEY"
        value = var.inngest_signing_key
      }

      resources {
        limits = {
          cpu    = "2"
          memory = "1Gi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }

    timeout = "300s"
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.cloudrun,
    google_artifact_registry_repository.isciacus,
    google_cloud_run_v2_service.pocketbase
  ]
}

# =============================================================================
# Cloud Run Service - Frontend (React/Vite)
# =============================================================================

resource "google_cloud_run_v2_service" "frontend" {
  name     = "isciacus-frontend"
  location = var.region

  template {
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/isciacus-monitoring/frontend:${var.image_tag}"

      ports {
        container_port = 80
      }

      env {
        name  = "VITE_API_BASE_URL"
        value = google_cloud_run_v2_service.backend.uri
      }

      env {
        name  = "VITE_POCKETBASE_URL"
        value = google_cloud_run_v2_service.pocketbase.uri
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }
    }

    scaling {
      min_instance_count = 0
      max_instance_count = 10
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  depends_on = [
    google_project_service.cloudrun,
    google_artifact_registry_repository.isciacus,
    google_cloud_run_v2_service.backend
  ]
}

# =============================================================================
# IAM - Allow unauthenticated access to frontend
# =============================================================================

resource "google_cloud_run_v2_service_iam_member" "frontend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.frontend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# Backend requires authentication (internal services only by default)
# Uncomment to make public:
# resource "google_cloud_run_v2_service_iam_member" "backend_public" {
#   project  = var.project_id
#   location = var.region
#   name     = google_cloud_run_v2_service.backend.name
#   role     = "roles/run.invoker"
#   member   = "allUsers"
# }
