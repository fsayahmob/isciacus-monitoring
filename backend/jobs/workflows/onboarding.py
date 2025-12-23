"""
Onboarding Audit Workflow - Inngest Job
=======================================
Checks all service configurations (Shopify, GA4, Meta, GMC, GSC).
Calls FastAPI endpoints to get configs from SQLite.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import inngest
import requests

# Import shared Inngest client from audit_workflow
from jobs.audit_workflow import inngest_client
from jobs.pocketbase_progress import save_audit_progress


AUDIT_TYPE = "onboarding"

# Backend API URL for internal calls
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def _process_step_result(
    result: dict[str, Any],
    step_result: dict[str, Any],
    session_id: str | None = None,
    pocketbase_record_id: str | None = None,
) -> bool:
    """Process a step result: append step, handle issues, return success status."""
    result["steps"].append(step_result["step"])
    if step_result.get("issue"):
        result["issues"].append(step_result["issue"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pocketbase_record_id)
    return step_result["success"]


def _init_audit_result(run_id: str) -> dict[str, Any]:
    """Initialize the audit result structure."""
    return {
        "id": run_id,
        "audit_type": "onboarding",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "steps": [],
        "issues": [],
        "summary": {},
    }


def create_onboarding_function() -> inngest.Function | None:
    """Create the onboarding audit function if Inngest is enabled."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="onboarding-audit",
        trigger=inngest.TriggerEvent(event="audit/onboarding.requested"),
        retries=1,
    )
    async def onboarding_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run onboarding audit - checks all service configurations."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        session_id = ctx.event.data.get("session_id", run_id)
        pb_record_id = ctx.event.data.get("pocketbase_record_id")
        result = _init_audit_result(run_id)
        services_configured = 0

        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 1: Check Shopify connection
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-shopify", _check_shopify_connection)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 2: Check GA4 configuration
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-ga4", _check_ga4_config)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 3: Check Meta Pixel configuration
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-meta", _check_meta_config)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 4: Check Google Merchant Center
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-gmc", _check_gmc_config)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 5: Check Google Search Console
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-gsc", _check_gsc_config)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 6: Check Google OAuth2 Credentials (for GMC & GA4 API access)
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-google-credentials", _check_google_credentials)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Step 7: Check Meta Token Permissions
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step_result = await ctx.step.run("check-meta-permissions", _check_meta_permissions)
        if _process_step_result(result, step_result, session_id, pb_record_id):
            services_configured += 1

        # Finalize - pass a copy of result to avoid closure issues
        final_result = _finalize_result(dict(result), services_configured, 7)
        save_audit_progress(final_result, AUDIT_TYPE, session_id, pb_record_id)

        return final_result

    return onboarding_audit


def _get_config(section: str) -> dict[str, str]:
    """Get config values directly from ConfigService (SQLite).

    Maps internal keys to expected environment variable names.
    """
    try:
        from services.config_service import ConfigService

        config_service = ConfigService()

        # Key mappings from ConfigService to expected env var names
        key_mappings = {
            "shopify": {
                "store_url": "SHOPIFY_STORE_URL",
                "access_token": "SHOPIFY_ACCESS_TOKEN",
            },
            "ga4": {
                "measurement_id": "GA4_MEASUREMENT_ID",
                "property_id": "GA4_PROPERTY_ID",
            },
            "meta": {
                "pixel_id": "META_PIXEL_ID",
                "access_token": "META_ACCESS_TOKEN",
            },
            "search_console": {
                "property_url": "GSC_PROPERTY_URL",
            },
            "merchant_center": {
                "merchant_id": "GMC_MERCHANT_ID",
            },
        }

        section_methods = {
            "shopify": config_service.get_shopify_values,
            "ga4": config_service.get_ga4_values,
            "meta": config_service.get_meta_values,
            "search_console": config_service.get_search_console_values,
            "merchant_center": config_service.get_merchant_center_values,
        }

        method = section_methods.get(section)
        if not method:
            return {}

        raw_values = method()
        mapping = key_mappings.get(section, {})

        # Map keys to expected names
        result = {}
        for internal_key, env_key in mapping.items():
            if internal_key in raw_values:
                result[env_key] = raw_values[internal_key]

        return result
    except Exception:
        return {}


def _check_shopify_connection() -> dict[str, Any]:
    """Check Shopify connection."""
    step = {
        "id": "shopify_connection",
        "name": "Connexion Shopify",
        "description": "Vérification de l'accès à votre boutique Shopify",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    shopify_config = _get_config("shopify")
    store_url = shopify_config.get("SHOPIFY_STORE_URL", "")
    access_token = shopify_config.get("SHOPIFY_ACCESS_TOKEN", "")

    if not store_url or not access_token:
        step["status"] = "error"
        step["error_message"] = "Non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "success": False,
            "step": step,
            "issue": {
                "id": "shopify_not_configured",
                "audit_type": "onboarding",
                "severity": "critical",
                "title": "Shopify non configuré",
                "description": (
                    "Configurez l'accès à votre boutique Shopify pour activer "
                    "tous les audits. Vous aurez besoin de l'URL de la boutique "
                    "et d'un token d'accès Admin API."
                ),
                "details": [
                    "1. Allez dans Shopify Admin > Apps > Développer des apps",
                    "2. Créez une app avec les permissions nécessaires",
                    "3. Copiez l'Admin API access token",
                ],
                "action_available": True,
                "action_id": "configure_shopify",
                "action_label": "Configurer",
                "action_status": "available",
                "action_url": "/settings",
            },
        }

    # Test actual connection
    try:
        clean_url = store_url.replace("https://", "").replace("http://", "").rstrip("/")
        resp = requests.get(
            f"https://{clean_url}/admin/api/2024-01/shop.json",
            headers={"X-Shopify-Access-Token": access_token},
            timeout=10,
        )
        if resp.status_code == 200:
            shop_name = resp.json().get("shop", {}).get("name", "")
            step["status"] = "success"
            step["result"] = {"shop_name": shop_name}
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"success": True, "step": step}

        step["status"] = "error"
        step["error_message"] = f"Token invalide (erreur {resp.status_code})"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "success": False,
            "step": step,
            "issue": {
                "id": "shopify_invalid_token",
                "audit_type": "onboarding",
                "severity": "critical",
                "title": "Token Shopify invalide",
                "description": (
                    "Le token d'accès Shopify est invalide ou expiré. "
                    "Régénérez-le dans Shopify Admin > Apps > Développer des apps."
                ),
                "action_available": True,
                "action_id": "configure_shopify",
                "action_label": "Configurer",
                "action_status": "available",
                "action_url": "/settings",
            },
        }
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": False, "step": step}


def _check_ga4_config() -> dict[str, Any]:
    """Check GA4 configuration."""
    step = {
        "id": "ga4_config",
        "name": "Google Analytics 4",
        "description": "Vérification de la configuration GA4",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    ga4_config = _get_config("ga4")
    measurement_id = ga4_config.get("GA4_MEASUREMENT_ID", "")

    if measurement_id and measurement_id.startswith("G-"):
        step["status"] = "success"
        step["result"] = {"measurement_id": measurement_id}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    # Check if GA4 is receiving data via Custom Pixels (even without theme code)
    try:
        resp = requests.post(f"{BACKEND_URL}/api/config/test/ga4", timeout=15)
        if resp.status_code == 200:
            test_result = resp.json()
            details = test_result.get("details", {})
            if test_result.get("success") and details.get("data_received"):
                step["status"] = "success"
                step["result"] = {"via_custom_pixels": True}
                step["completed_at"] = datetime.now(tz=UTC).isoformat()
                duration = (datetime.now(tz=UTC) - start_time).total_seconds() * 1000
                step["duration_ms"] = int(duration)
                return {
                    "success": True,
                    "step": step,
                    "issue": {
                        "id": "ga4_via_custom_pixels",
                        "audit_type": "onboarding",
                        "severity": "info",
                        "title": "GA4 actif via Custom Pixels",
                        "description": (
                            "GA4 n'est pas dans le thème mais reçoit des données. "
                            "Installation via Shopify Customer Events ou GTM détectée."
                        ),
                        "action_available": False,
                    },
                }
    except Exception:
        pass

    step["status"] = "warning"
    step["error_message"] = "Non configuré"
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {
        "success": False,
        "step": step,
        "issue": {
            "id": "ga4_not_configured",
            "audit_type": "onboarding",
            "severity": "high",
            "title": "GA4 non configuré",
            "description": (
                "Google Analytics 4 permet de suivre le comportement des visiteurs "
                "et les conversions. Configurez-le pour activer les audits de tracking."
            ),
            "details": [
                "1. Créez une propriété GA4 sur analytics.google.com",
                "2. Récupérez le Measurement ID (format: G-XXXXXXXXX)",
                "3. Installez le tag dans votre thème Shopify ou via GTM",
                "4. Ajoutez l'ID dans Configuration > GA4",
            ],
            "action_available": True,
            "action_id": "configure_ga4",
            "action_label": "Configurer",
            "action_status": "available",
            "action_url": "/settings",
        },
    }


def _check_meta_config() -> dict[str, Any]:
    """Check Meta Pixel configuration."""
    step = {
        "id": "meta_config",
        "name": "Meta Pixel",
        "description": "Vérification de la configuration Meta/Facebook",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    meta_config = _get_config("meta")
    pixel_id = meta_config.get("META_PIXEL_ID", "")
    access_token = meta_config.get("META_ACCESS_TOKEN", "")

    if not pixel_id or not access_token:
        step["status"] = "warning"
        step["error_message"] = "Non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "success": False,
            "step": step,
            "issue": {
                "id": "meta_not_configured",
                "audit_type": "onboarding",
                "severity": "high",
                "title": "Meta Pixel non configuré",
                "description": (
                    "Le Meta Pixel permet de tracker les conversions Facebook/Instagram "
                    "et d'optimiser vos campagnes publicitaires."
                ),
                "details": [
                    "1. Récupérez votre Pixel ID depuis Meta Business Suite > Events Manager",
                    "2. Générez un Access Token dans Paramètres > Tokens d'accès système",
                    "3. Ajoutez ces valeurs dans Configuration > Meta",
                ],
                "action_available": True,
                "action_id": "configure_meta",
                "action_label": "Configurer",
                "action_status": "available",
                "action_url": "/settings",
            },
        }

    # Test Meta API connection
    try:
        resp = requests.get(
            f"https://graph.facebook.com/v19.0/{pixel_id}",
            params={
                "fields": "id,name,is_unavailable,last_fired_time",
                "access_token": access_token,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            pixel_data = resp.json()
            pixel_name = pixel_data.get("name", "")
            last_fired = pixel_data.get("last_fired_time", "")
            is_unavailable = pixel_data.get("is_unavailable", False)

            duration_ms = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            if is_unavailable:
                step["status"] = "warning"
                step["result"] = {"pixel_id": pixel_id, "pixel_name": pixel_name}
                step["error_message"] = "Pixel désactivé"
                step["completed_at"] = datetime.now(tz=UTC).isoformat()
                step["duration_ms"] = duration_ms
                return {
                    "success": False,
                    "step": step,
                    "issue": {
                        "id": "meta_pixel_disabled",
                        "audit_type": "onboarding",
                        "severity": "high",
                        "title": "Meta Pixel désactivé",
                        "description": (
                            f"Le pixel '{pixel_name}' existe mais est marqué comme "
                            "indisponible. Vérifiez dans Meta Business Suite."
                        ),
                        "action_available": True,
                        "action_id": "open_meta_events",
                        "action_label": "Ouvrir Meta Events",
                        "action_status": "available",
                        "action_url": "https://business.facebook.com/events_manager",
                    },
                }
            if last_fired:
                step["status"] = "success"
                step["result"] = {
                    "pixel_id": pixel_id,
                    "pixel_name": pixel_name,
                    "last_fired": last_fired,
                }
                step["completed_at"] = datetime.now(tz=UTC).isoformat()
                step["duration_ms"] = duration_ms
                return {"success": True, "step": step}
            step["status"] = "warning"
            step["result"] = {"pixel_id": pixel_id, "pixel_name": pixel_name}
            step["error_message"] = "Aucune activité récente"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = duration_ms
            return {"success": True, "step": step}  # Still configured
        duration_ms = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        step["status"] = "warning"
        step["error_message"] = "Token invalide ou expiré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = duration_ms
        return {
            "success": False,
            "step": step,
            "issue": {
                "id": "meta_invalid_token",
                "audit_type": "onboarding",
                "severity": "high",
                "title": "Token Meta invalide",
                "description": (
                    "Le META_ACCESS_TOKEN est invalide ou expiré. "
                    "Régénérez-le dans Meta Business Suite."
                ),
                "action_available": True,
                "action_id": "configure_meta",
                "action_label": "Configurer",
                "action_status": "available",
                "action_url": "/settings",
            },
        }
    except Exception as e:
        step["status"] = "warning"
        step["error_message"] = f"Erreur: {str(e)[:50]}"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": False, "step": step}


def _check_gmc_config() -> dict[str, Any]:
    """Check Google Merchant Center configuration."""
    step = {
        "id": "gmc_config",
        "name": "Merchant Center",
        "description": "Vérification de la configuration GMC",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    gmc_config = _get_config("merchant_center")
    merchant_id = gmc_config.get("GMC_MERCHANT_ID", "")

    if merchant_id:
        step["status"] = "success"
        step["result"] = {"merchant_id": merchant_id}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    step["status"] = "warning"
    step["error_message"] = "Non configuré"
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {
        "success": False,
        "step": step,
        "issue": {
            "id": "gmc_not_configured",
            "audit_type": "onboarding",
            "severity": "medium",
            "title": "Google Merchant Center non configuré",
            "description": (
                "GMC permet de diffuser vos produits sur Google Shopping "
                "et dans les résultats de recherche."
            ),
            "details": [
                "1. Créez un compte sur merchants.google.com",
                "2. Connectez votre boutique via l'app Google Channel dans Shopify",
                "3. Vérifiez que vos produits sont synchronisés",
            ],
            "action_available": True,
            "action_id": "configure_gmc",
            "action_label": "Configurer",
            "action_status": "available",
            "action_url": "/settings",
        },
    }


def _check_gsc_config() -> dict[str, Any]:
    """Check Google Search Console configuration."""
    step = {
        "id": "gsc_config",
        "name": "Search Console",
        "description": "Vérification de la configuration GSC",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    gsc_config = _get_config("search_console")
    property_url = gsc_config.get("GSC_PROPERTY_URL", "")

    if property_url:
        step["status"] = "success"
        step["result"] = {"property_url": property_url}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    step["status"] = "warning"
    step["error_message"] = "Non configuré"
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {
        "success": False,
        "step": step,
        "issue": {
            "id": "gsc_not_configured",
            "audit_type": "onboarding",
            "severity": "medium",
            "title": "Google Search Console non configuré",
            "description": (
                "GSC permet de suivre votre visibilité dans les résultats de recherche "
                "Google et d'identifier les problèmes d'indexation."
            ),
            "details": [
                "1. Ajoutez votre site sur search.google.com/search-console",
                "2. Vérifiez la propriété via DNS ou fichier HTML",
                "3. Soumettez votre sitemap (sitemap.xml)",
            ],
            "action_available": True,
            "action_id": "configure_gsc",
            "action_label": "Configurer",
            "action_status": "available",
            "action_url": "/settings",
        },
    }


def _check_google_credentials() -> dict[str, Any]:
    """Check Google OAuth2 credentials for GMC & GA4 API access."""
    step = {
        "id": "google_credentials",
        "name": "Google API Credentials",
        "description": "Vérification des credentials Google OAuth2",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    # Try to load and validate Google credentials
    try:
        from pathlib import Path

        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        # Look for credentials file
        creds_path = (
            Path(__file__).parent.parent.parent / "credentials" / "google-service-account.json"
        )

        if not creds_path.exists():
            raise FileNotFoundError(f"Credentials file not found: {creds_path}")

        # Try to load credentials and get token
        credentials = service_account.Credentials.from_service_account_file(
            str(creds_path),
            scopes=["https://www.googleapis.com/auth/content"],
        )
        credentials.refresh(Request())

        # If we get here, credentials are valid
        step["status"] = "success"
        step["result"] = {"credentials_valid": True, "api_access": "GMC & GA4"}
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    except FileNotFoundError:
        # Credentials file not found
        step["status"] = "warning"
        step["error_message"] = "Fichier credentials manquant"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "success": False,
            "step": step,
            "issue": {
                "id": "google_credentials_missing",
                "audit_type": "onboarding",
                "severity": "high",
                "title": "Google OAuth2 credentials manquantes",
                "description": (
                    "Les credentials Google sont requises pour accéder aux APIs "
                    "GMC et GA4. Sans elles, les audits GMC et GA4 ne fonctionneront pas."
                ),
                "details": [
                    "1. Créez un projet sur console.cloud.google.com",
                    "2. Activez les APIs: Google Merchant Center & Google Analytics Data",
                    "3. Créez un Service Account avec les permissions requises",
                    "4. Téléchargez le fichier JSON des credentials",
                    "5. Placez-le dans backend/credentials/google-service-account.json",
                ],
                "action_available": True,
                "action_label": "Guide Setup",
                "action_status": "available",
                "action_url": "https://console.cloud.google.com/apis/credentials",
            },
        }
    except Exception as e:
        error_msg = str(e).lower()

        # Check for specific error types
        if "credentials" in error_msg or "authentication" in error_msg or "401" in error_msg:
            step["status"] = "warning"
            step["error_message"] = "Credentials invalides ou expirées"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {
                "success": False,
                "step": step,
                "issue": {
                    "id": "google_credentials_invalid",
                    "audit_type": "onboarding",
                    "severity": "high",
                    "title": "Google credentials invalides",
                    "description": (
                        "Les credentials Google sont invalides ou ont expiré. "
                        "Régénérez-les depuis Google Cloud Console."
                    ),
                    "action_available": True,
                    "action_label": "Google Cloud Console",
                    "action_status": "available",
                    "action_url": "https://console.cloud.google.com/apis/credentials",
                },
            }

        if "merchant" in error_msg or "gmc" in error_msg:
            # GMC not configured, but credentials might be OK
            step["status"] = "success"
            step["result"] = {
                "credentials_valid": True,
                "note": "GMC non configuré mais credentials OK",
            }
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"success": True, "step": step}

        # Generic error - credentials might be missing
        step["status"] = "warning"
        step["error_message"] = f"Erreur API: {str(e)[:50]}"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": False, "step": step}


def _check_meta_permissions() -> dict[str, Any]:
    """Check Meta Access Token permissions/scopes."""
    step = {
        "id": "meta_permissions",
        "name": "Meta Token Permissions",
        "description": "Vérification des permissions du token Meta",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }

    start_time = datetime.now(tz=UTC)

    meta_config = _get_config("meta")
    access_token = meta_config.get("META_ACCESS_TOKEN", "")

    if not access_token:
        # Skip if Meta not configured
        step["status"] = "skipped"
        step["error_message"] = "Meta non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    # Check token scopes using debug_token endpoint
    try:
        resp = requests.get(
            "https://graph.facebook.com/v19.0/debug_token",
            params={"input_token": access_token, "access_token": access_token},
            timeout=10,
        )

        if resp.status_code != 200:
            step["status"] = "warning"
            step["error_message"] = "Impossible de vérifier les permissions"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"success": False, "step": step}

        debug_data = resp.json().get("data", {})
        scopes = debug_data.get("scopes", [])
        is_valid = debug_data.get("is_valid", False)

        if not is_valid:
            step["status"] = "error"
            step["error_message"] = "Token invalide ou expiré"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {
                "success": False,
                "step": step,
                "issue": {
                    "id": "meta_token_expired",
                    "audit_type": "onboarding",
                    "severity": "high",
                    "title": "Meta Access Token expiré",
                    "description": (
                        "Le token Meta est expiré. Régénérez-le dans Meta Business Suite."
                    ),
                    "action_available": True,
                    "action_label": "Meta Business Suite",
                    "action_status": "available",
                    "action_url": "https://business.facebook.com/settings/system-users",
                },
            }

        # Check required scopes for Meta Audit
        required_scopes = [
            "ads_management",
            "pages_read_engagement",
            "business_management",
        ]
        missing_scopes = [s for s in required_scopes if s not in scopes]

        if missing_scopes:
            step["status"] = "warning"
            step["result"] = {
                "scopes_present": scopes,
                "scopes_missing": missing_scopes,
            }
            step["error_message"] = f"Permissions manquantes: {', '.join(missing_scopes)}"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {
                "success": False,
                "step": step,
                "issue": {
                    "id": "meta_insufficient_permissions",
                    "audit_type": "onboarding",
                    "severity": "medium",
                    "title": "Permissions Meta insuffisantes",
                    "description": (
                        f"Le token Meta manque de permissions requises pour l'audit complet: "
                        f"{', '.join(missing_scopes)}. L'audit Meta sera limité."
                    ),
                    "details": [
                        "Permissions manquantes:",
                        *[f"• {scope}" for scope in missing_scopes],
                        "",
                        "Régénérez le token avec toutes les permissions requises.",
                    ],
                    "action_available": True,
                    "action_label": "Régénérer Token",
                    "action_status": "available",
                    "action_url": "https://business.facebook.com/settings/system-users",
                },
            }

        # All good
        step["status"] = "success"
        step["result"] = {
            "scopes_present": scopes,
            "all_permissions_granted": True,
        }
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": True, "step": step}

    except Exception as e:
        step["status"] = "warning"
        step["error_message"] = f"Erreur: {str(e)[:50]}"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"success": False, "step": step}


def _finalize_result(
    result: dict[str, Any],
    services_configured: int,
    services_total: int,
) -> dict[str, Any]:
    """Finalize the audit result with summary."""
    # Determine overall status
    statuses = [s["status"] for s in result["steps"]]
    if "error" in statuses:
        result["status"] = "error"
    elif "warning" in statuses:
        result["status"] = "warning"
    else:
        result["status"] = "success"

    result["completed_at"] = datetime.now(tz=UTC).isoformat()

    # Build summary
    result["summary"] = {
        "services_configured": services_configured,
        "services_total": services_total,
        "completion_rate": int((services_configured / services_total) * 100),
        "issues_count": len(result["issues"]),
    }

    # Add completion message if all configured
    if services_configured == services_total:
        result["issues"].insert(
            0,
            {
                "id": "onboarding_complete",
                "audit_type": "onboarding",
                "severity": "info",
                "title": "Configuration complète !",
                "description": (
                    "Tous vos services Ads et SEO sont configurés. "
                    "Vous pouvez maintenant lancer les audits détaillés."
                ),
                "action_available": False,
            },
        )

    return result


# Create the function if enabled
onboarding_audit_function = create_onboarding_function()
