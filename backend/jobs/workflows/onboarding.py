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


# Backend API URL for internal calls
BACKEND_URL = os.getenv("BACKEND_URL", "http://localhost:8000")


def create_onboarding_function() -> inngest.Function | None:
    """Create the onboarding audit function if Inngest is enabled."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="onboarding-audit",
        trigger=inngest.TriggerEvent(event="audit/onboarding.requested"),
        retries=1,
    )
    async def onboarding_audit(
        ctx: inngest.Context,
    ) -> dict[str, Any]:
        """
        Run onboarding audit - checks all service configurations.

        Steps:
        1. Check Shopify connection
        2. Check GA4 configuration
        3. Check Meta Pixel configuration
        4. Check Google Merchant Center configuration
        5. Check Google Search Console configuration
        """
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])

        # Initialize result structure
        result = {
            "id": run_id,
            "audit_type": "onboarding",
            "status": "running",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": None,
            "steps": [],
            "issues": [],
            "summary": {},
        }

        services_configured = 0
        services_total = 5

        # Step 1: Check Shopify connection
        shopify_result = await ctx.step.run(
            "check-shopify",
            lambda: _check_shopify_connection(),
        )
        result["steps"].append(shopify_result["step"])
        if shopify_result.get("issue"):
            result["issues"].append(shopify_result["issue"])
        if shopify_result["success"]:
            services_configured += 1

        # Step 2: Check GA4 configuration
        ga4_result = await ctx.step.run(
            "check-ga4",
            lambda: _check_ga4_config(),
        )
        result["steps"].append(ga4_result["step"])
        if ga4_result.get("issue"):
            result["issues"].append(ga4_result["issue"])
        if ga4_result["success"]:
            services_configured += 1

        # Step 3: Check Meta Pixel configuration
        meta_result = await ctx.step.run(
            "check-meta",
            lambda: _check_meta_config(),
        )
        result["steps"].append(meta_result["step"])
        if meta_result.get("issue"):
            result["issues"].append(meta_result["issue"])
        if meta_result["success"]:
            services_configured += 1

        # Step 4: Check Google Merchant Center
        gmc_result = await ctx.step.run(
            "check-gmc",
            lambda: _check_gmc_config(),
        )
        result["steps"].append(gmc_result["step"])
        if gmc_result.get("issue"):
            result["issues"].append(gmc_result["issue"])
        if gmc_result["success"]:
            services_configured += 1

        # Step 5: Check Google Search Console
        gsc_result = await ctx.step.run(
            "check-gsc",
            lambda: _check_gsc_config(),
        )
        result["steps"].append(gsc_result["step"])
        if gsc_result.get("issue"):
            result["issues"].append(gsc_result["issue"])
        if gsc_result["success"]:
            services_configured += 1

        # Finalize result
        result = await ctx.step.run(
            "finalize",
            lambda: _finalize_result(result, services_configured, services_total),
        )

        # Save to session file via API
        await ctx.step.run(
            "save-session",
            lambda: _save_audit_session(result),
        )

        return result

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


def _save_audit_session(result: dict[str, Any]) -> dict[str, str]:
    """Save audit result to session via internal API or direct file write."""
    import json
    from pathlib import Path

    # Direct file write (simpler than API call for internal use)
    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)

    # Load or create session
    latest_file = storage_dir / "latest_session.json"
    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": result["id"],
            "created_at": result["started_at"],
            "updated_at": result["completed_at"],
            "audits": {},
        }

    # Update session with this audit result
    session["audits"]["onboarding"] = result
    session["updated_at"] = result["completed_at"]

    # Save
    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)

    # Also save specific session file
    session_file = storage_dir / f"session_{session['id']}.json"
    with session_file.open("w") as f:
        json.dump(session, f, indent=2)

    return {"status": "saved", "session_id": session["id"]}


# Create the function if enabled
onboarding_audit_function = create_onboarding_function()
