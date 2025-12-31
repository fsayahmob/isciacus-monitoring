# =============================================================================
# Terraform Outputs - ISCIACUS Monitoring
# =============================================================================

output "frontend_url" {
  description = "URL of the frontend Cloud Run service"
  value       = google_cloud_run_v2_service.frontend.uri
}

output "backend_url" {
  description = "URL of the backend Cloud Run service"
  value       = google_cloud_run_v2_service.backend.uri
}

output "pocketbase_url" {
  description = "URL of the PocketBase Cloud Run service"
  value       = google_cloud_run_v2_service.pocketbase.uri
}

output "artifact_registry_url" {
  description = "URL of the Artifact Registry repository"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.isciacus.repository_id}"
}
