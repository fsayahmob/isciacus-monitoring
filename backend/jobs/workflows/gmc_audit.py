"""
GMC (Google Merchant Center) Audit Workflow - Inngest Job
==========================================================
Full async workflow with step-by-step progress updates.
"""

from __future__ import annotations

from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from uuid import uuid4

import inngest
import requests

from jobs.audit_workflow import inngest_client
from jobs.pocketbase_progress import init_audit_result, save_audit_progress


AUDIT_TYPE = "merchant_center"

# Step definitions for this audit
STEPS = [
    {
        "id": "gmc_connection",
        "name": "Connexion GMC",
        "description": "Connexion au Merchant Center",
    },
    {
        "id": "products_status",
        "name": "Statut Produits",
        "description": "Analyse des produits GMC",
    },
    {
        "id": "feed_sync",
        "name": "Synchronisation Feed",
        "description": "Vérification de la sync",
    },
    {
        "id": "feed_quality",
        "name": "Qualité du Feed",
        "description": "Analyse GTIN, images, descriptions",
    },
    {
        "id": "issues_check",
        "name": "Problèmes",
        "description": "Détection des problèmes",
    },
]




def _get_gmc_config() -> dict[str, str]:
    """Get GMC config from ConfigService."""
    try:
        from services.config_service import ConfigService

        config = ConfigService()
        return config.get_merchant_center_values()
    except Exception:
        return {}


def _get_gmc_credentials(creds_path: str) -> tuple[Any, str] | None:
    """Get GMC credentials and access token."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        if not creds_path or not Path(creds_path).exists():
            return None

        credentials = service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/content"],
        )
        credentials.refresh(Request())
        return credentials, credentials.token
    except Exception:
        return None


def _step_1_check_connection(merchant_id: str, creds_path: str) -> dict[str, Any]:
    """Step 1: Check GMC connection."""
    step = {
        "id": "gmc_connection",
        "name": "Connexion GMC",
        "description": "Connexion au Merchant Center",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    if not merchant_id:
        step["status"] = "error"
        step["error_message"] = "GOOGLE_MERCHANT_ID non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "step": step,
            "success": False,
            "credentials": None,
            "token": None,
            "account_issues": [],
        }

    creds_result = _get_gmc_credentials(creds_path)
    if not creds_result:
        step["status"] = "error"
        step["error_message"] = "Fichier credentials Google non trouvé"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "step": step,
            "success": False,
            "credentials": None,
            "token": None,
            "account_issues": [],
        }

    _credentials, token = creds_result
    headers = {"Authorization": f"Bearer {token}"}

    # Test connection
    try:
        resp = requests.get(
            f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/accounts/{merchant_id}",
            headers=headers,
            timeout=10,
        )
        if resp.status_code != 200:
            step["status"] = "error"
            step["error_message"] = f"Erreur API GMC: {resp.status_code}"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {
                "step": step,
                "success": False,
                "credentials": None,
                "token": None,
                "account_issues": [],
            }
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {
            "step": step,
            "success": False,
            "credentials": None,
            "token": None,
            "account_issues": [],
        }

    # Get account-level issues
    account_issues = []
    try:
        account_resp = requests.get(
            f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/accountstatuses/{merchant_id}",
            headers=headers,
            timeout=30,
        )
        if account_resp.status_code == 200:
            account_issues = account_resp.json().get("accountLevelIssues", [])
    except Exception:
        pass

    step["status"] = "success"
    step["result"] = {"merchant_id": merchant_id}
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "success": True, "token": token, "account_issues": account_issues}


def _fetch_gmc_products(merchant_id: str, headers: dict[str, str]) -> list[dict]:
    """Fetch all GMC products with pagination."""
    gmc_products = []
    next_page_token = None
    page_count = 0
    max_pages = 50

    while page_count < max_pages:
        page_count += 1
        url = f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/productstatuses?maxResults=250"
        if next_page_token:
            url += f"&pageToken={next_page_token}"

        try:
            resp = requests.get(url, headers=headers, timeout=60)
            if resp.status_code != 200:
                break
            data = resp.json()
            gmc_products.extend(data.get("resources", []))
            next_page_token = data.get("nextPageToken")
            if not next_page_token:
                break
        except Exception:
            break

    return gmc_products


def _get_product_status_for_france(dest_statuses: list[dict]) -> str:
    """Determine product status for France market."""
    for dest in dest_statuses:
        dest_name = dest.get("destination", "")
        if "SurfacesAcrossGoogle" in dest_name or "Shopping" in dest_name:
            if "FR" in dest.get("approvedCountries", []):
                return "approved"
            if "FR" in dest.get("disapprovedCountries", []):
                return "disapproved"
    return "pending"


def _extract_product_issues(
    product: dict[str, Any],
    product_id: str,
    title: str,
) -> tuple[list[dict], dict[str, list[dict]]]:
    """Extract rejection reasons from product issues."""
    item_issues = product.get("itemLevelIssues", [])
    product_issues = []
    rejection_reasons: dict[str, list[dict]] = {}
    seen_codes = set()

    for issue in item_issues:
        if issue.get("servability") == "disapproved":
            code = issue.get("code", "unknown")
            if code not in seen_codes:
                seen_codes.add(code)
                issue_info = {
                    "product_id": product_id,
                    "title": title,
                    "description": issue.get("description", code),
                    "attribute": issue.get("attributeName", ""),
                    "detail": issue.get("detail", ""),
                    "documentation": issue.get("documentation", ""),
                }
                if code not in rejection_reasons:
                    rejection_reasons[code] = []
                rejection_reasons[code].append(issue_info)
                product_issues.append(issue_info)

    return product_issues, rejection_reasons


def _analyze_products(
    gmc_products: list[dict],
) -> tuple[int, int, int, dict[str, list[dict]], list[dict]]:
    """Analyze GMC products and count statuses."""
    approved = disapproved = pending = 0
    all_rejection_reasons: dict[str, list[dict]] = {}
    products_with_issues: list[dict] = []

    for product in gmc_products:
        product_id = product.get("productId", "")
        title = product.get("title", "Sans titre")
        dest_statuses = product.get("destinationStatuses", [])

        product_status = _get_product_status_for_france(dest_statuses)

        if product_status == "approved":
            approved += 1
        elif product_status == "disapproved":
            disapproved += 1
        else:
            pending += 1

        product_issues, rejection_reasons = _extract_product_issues(product, product_id, title)

        for code, issues in rejection_reasons.items():
            if code not in all_rejection_reasons:
                all_rejection_reasons[code] = []
            all_rejection_reasons[code].extend(issues)

        if product_issues:
            products_with_issues.append(
                {
                    "product_id": product_id,
                    "title": title,
                    "status": product_status,
                    "issues": product_issues,
                }
            )

    return approved, disapproved, pending, all_rejection_reasons, products_with_issues


def _step_2_products_status(merchant_id: str, token: str) -> dict[str, Any]:
    """Step 2: Fetch and analyze product statuses."""
    step = {
        "id": "products_status",
        "name": "Statut Produits",
        "description": "Analyse des produits GMC",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    headers = {"Authorization": f"Bearer {token}"}

    gmc_products = _fetch_gmc_products(merchant_id, headers)
    total_products = len(gmc_products)

    approved, disapproved, pending, rejection_reasons, products_with_issues = _analyze_products(
        gmc_products
    )

    step["status"] = "warning" if disapproved > 0 else "success"
    step["result"] = {
        "total": total_products,
        "approved": approved,
        "disapproved": disapproved,
        "pending": pending,
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {
        "step": step,
        "success": True,
        "total_products": total_products,
        "approved": approved,
        "disapproved": disapproved,
        "pending": pending,
        "rejection_reasons": rejection_reasons,
        "products_with_issues": products_with_issues,
    }


def _step_3_feed_sync(_merchant_id: str, products_data: dict[str, Any]) -> dict[str, Any]:
    """Step 3: Analyze feed sync with Shopify."""
    step = {
        "id": "feed_sync",
        "name": "Synchronisation Feed",
        "description": "Vérification de la sync",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    try:
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify = ShopifyAnalyticsService()
        google_pub_status = shopify.fetch_products_google_shopping_status()
    except Exception:
        google_pub_status = {
            "google_channel_found": False,
            "published_to_google": 0,
            "not_published_to_google": 0,
            "products_not_published": [],
            "products_published": [],
            "products_not_published_eligible": [],
        }

    total_products = products_data.get("total_products", 0)
    approved = products_data.get("approved", 0)

    step["status"] = "success" if total_products > 0 else "warning"
    step["result"] = {
        "gmc_total": total_products,
        "gmc_approved": approved,
        "gmc_disapproved": products_data.get("disapproved", 0),
        "gmc_pending": products_data.get("pending", 0),
        "shopify_published_to_google": google_pub_status.get("published_to_google", 0),
        "shopify_not_published": google_pub_status.get("not_published_to_google", 0),
    }
    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {
        "step": step,
        "success": True,
        "google_pub_status": google_pub_status,
    }


def _step_5_feed_quality(
    merchant_id: str, token: str, products_data: dict[str, Any]
) -> dict[str, Any]:
    """
    Step 5: Analyze feed quality (GTIN, images, descriptions).

    Checks product data quality for better Google Shopping performance.
    """
    step = {
        "id": "feed_quality",
        "name": "Qualité du Feed",
        "description": "Analyse GTIN, images, descriptions",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    headers = {"Authorization": f"Bearer {token}"}

    # Fetch sample of products to analyze quality
    total_products = products_data.get("total_products", 0)
    sample_size = min(100, total_products)  # Analyze up to 100 products

    try:
        # Fetch products with full data (not just statuses)
        url = (
            f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/"
            f"products?maxResults={sample_size}"
        )
        resp = requests.get(url, headers=headers, timeout=60)

        if resp.status_code != 200:
            step["status"] = "warning"
            step["result"] = {"error": "Could not fetch product data"}
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"step": step, "quality_metrics": {}}

        products = resp.json().get("resources", [])

        # Analyze quality
        with_gtin = 0
        high_quality_images = 0
        good_descriptions = 0

        for product in products:
            # Check GTIN
            if product.get("gtin"):
                with_gtin += 1

            # Check image quality (>= 800x800)
            image_link = product.get("imageLink", "")
            if image_link and any(
                size in image_link for size in ["_800x", "_1024x", "_2048x", "large"]
            ):
                high_quality_images += 1

            # Check description quality (> 200 chars)
            description = product.get("description", "")
            if len(description) > 200:
                good_descriptions += 1

        # Calculate percentages
        total_analyzed = len(products)
        gtin_coverage = round((with_gtin / total_analyzed * 100), 1) if total_analyzed > 0 else 0
        image_quality = (
            round((high_quality_images / total_analyzed * 100), 1) if total_analyzed > 0 else 0
        )
        desc_quality = (
            round((good_descriptions / total_analyzed * 100), 1) if total_analyzed > 0 else 0
        )

        # Determine status based on benchmarks
        # Good: GTIN >80%, Images >90%, Desc >70%
        status = "success"
        if gtin_coverage < 50 or image_quality < 70 or gtin_coverage < 80 or image_quality < 90:
            status = "warning"

        quality_metrics = {
            "total_analyzed": total_analyzed,
            "gtin_coverage_pct": gtin_coverage,
            "high_quality_images_pct": image_quality,
            "good_descriptions_pct": desc_quality,
        }

        step["status"] = status
        step["result"] = quality_metrics
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

        return {"step": step, "quality_metrics": quality_metrics}

    except Exception as e:
        step["status"] = "warning"
        step["result"] = {"error": str(e)}
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "quality_metrics": {}}


def _build_issues(
    merchant_id: str,
    products_data: dict[str, Any],
    google_pub_status: dict[str, Any],
    account_issues: list[dict],
) -> list[dict[str, Any]]:
    """Build issues list from audit data."""
    issues = []

    total_products = products_data.get("total_products", 0)
    approved = products_data.get("approved", 0)
    disapproved = products_data.get("disapproved", 0)
    pending = products_data.get("pending", 0)
    rejection_reasons = products_data.get("rejection_reasons", {})

    published_to_google = google_pub_status.get("published_to_google", 0)
    not_published_to_google = google_pub_status.get("not_published_to_google", 0)
    total_shopify = published_to_google + not_published_to_google

    approval_rate = round((approved / total_products * 100), 1) if total_products > 0 else 0

    # KPI Summary issue
    kpi_severity = "info"
    if disapproved > 0 or approval_rate < 90:
        kpi_severity = "high"
    elif pending > 0 or approval_rate < 95:
        kpi_severity = "warning"

    issues.append(
        {
            "id": "kpi_summary",
            "audit_type": "merchant_center",
            "severity": kpi_severity,
            "title": f"📊 GMC: {approved}/{total_products} approuvés ({approval_rate}%)",
            "description": (
                f"Shopify {total_shopify} → Canal Google {published_to_google} → "
                f"GMC {total_products} → {approved} approuvées"
            ),
            "details": [
                f"🛍️  SHOPIFY: {total_shopify} produits",
                f"📤  CANAL GOOGLE: {published_to_google} publiés",
                f"📥  GMC REÇUS: {total_products} variantes",
                f"✅  APPROUVÉS: {approved} ({approval_rate}%)",
                f"⏳  En attente: {pending}",
                f"❌  Rejetés: {disapproved}",
            ],
            "action_available": False,
        }
    )

    # Account issues
    if account_issues:
        critical = [i for i in account_issues if i.get("severity") == "critical"]
        errors = [i for i in account_issues if i.get("severity") == "error"]
        if critical or errors:
            issues.append(
                {
                    "id": "gmc_account_issues",
                    "audit_type": "merchant_center",
                    "severity": "critical" if critical else "high",
                    "title": f"🚨 {len(account_issues)} problème(s) de compte GMC",
                    "description": "Ces problèmes peuvent bloquer la synchronisation",
                    "details": [f"• {i.get('title', 'Problème')}" for i in account_issues[:10]],
                    "action_available": False,
                }
            )

    # Rejection reasons
    total_variants_with_issues = len(products_data.get("products_with_issues", []))
    if rejection_reasons and total_variants_with_issues > 0:
        impact_percentage = (
            round((total_variants_with_issues / total_products * 100), 1)
            if total_products > 0
            else 0
        )
        issues.append(
            {
                "id": "gmc_issues_summary",
                "audit_type": "merchant_center",
                "severity": "high",
                "title": f"⚠️ {total_variants_with_issues} variante(s) GMC avec problèmes",
                "description": (
                    f"Ces issues empêchent {total_variants_with_issues} variantes "
                    f"({impact_percentage}%) d'être diffusées dans Google Shopping, ce qui "
                    f"réduit la surface publicitaire et le potentiel ROAS."
                ),
                "details": [
                    f"• {k}: {len(v)} variante(s)" for k, v in list(rejection_reasons.items())[:10]
                ],
                "action_available": False,
            }
        )

        # Individual rejection reasons
        for reason_code, products_list in sorted(
            rejection_reasons.items(), key=lambda x: -len(x[1])
        ):
            count = len(products_list)
            if count >= 1:
                desc = products_list[0]["description"] if products_list else reason_code
                gmc_url = f"https://merchants.google.com/mc/products/diagnostics?a={merchant_id}"
                issues.append(
                    {
                        "id": f"gmc_rejection_{reason_code}",
                        "audit_type": "merchant_center",
                        "severity": "high" if count > 5 else "medium",
                        "title": f"❌ {count} variante(s) rejetée(s): {desc[:50]}",
                        "description": f"Raison Google: {desc}",
                        "details": [f"• {p['title']}" for p in products_list[:10]],
                        "action_available": True,
                        "action_id": "open_gmc_diagnostics",
                        "action_label": "Ouvrir GMC",
                        "action_status": "available",
                        "action_url": gmc_url,
                    }
                )

    # Not published products
    eligible = google_pub_status.get("products_not_published_eligible", [])
    if google_pub_status.get("google_channel_found") and not_published_to_google > 0:
        issues.append(
            {
                "id": "gmc_not_published_google",
                "audit_type": "merchant_center",
                "severity": "high" if len(eligible) > 0 else "medium",
                "title": (
                    f"🚫 {not_published_to_google} produits NON publiés "
                    f"({len(eligible)} éligibles)"
                ),
                "description": f"{len(eligible)} prêts à publier",
                "details": [f"• {p['title']}" for p in eligible[:10]],
                "action_available": len(eligible) > 0,
                "action_id": "publish_eligible_to_google" if len(eligible) > 0 else None,
                "action_label": f"Publier {len(eligible)} éligibles" if len(eligible) > 0 else None,
                "action_status": "available" if len(eligible) > 0 else "not_available",
            }
        )

    return issues


def _finalize_result(
    result: dict[str, Any],
    products_data: dict[str, Any],
    google_pub_status: dict[str, Any],
    quality_metrics: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Finalize the audit result."""
    total_products = products_data.get("total_products", 0)
    approved = products_data.get("approved", 0)
    disapproved = products_data.get("disapproved", 0)
    pending = products_data.get("pending", 0)

    published_to_google = google_pub_status.get("published_to_google", 0)
    not_published_to_google = google_pub_status.get("not_published_to_google", 0)
    total_shopify = published_to_google + not_published_to_google

    # Determine overall status
    has_errors = any(s.get("status") == "error" for s in result["steps"])
    has_warnings = any(s.get("status") == "warning" for s in result["steps"])

    result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
    result["completed_at"] = datetime.now(tz=UTC).isoformat()
    result["summary"] = {
        "total_products": total_products,
        "approved": approved,
        "disapproved": disapproved,
        "pending": pending,
        "issues_count": len(result["issues"]),
        "google_channel": {
            "found": google_pub_status.get("google_channel_found", False),
            "published": published_to_google,
            "not_published": not_published_to_google,
        },
        "kpi": {
            "shopify_total": total_shopify,
            "google_channel_published": published_to_google,
            "google_channel_not_published": not_published_to_google,
            "gmc_received": total_products,
            "gmc_approved": approved,
            "gmc_pending": pending,
            "gmc_disapproved": disapproved,
        },
        "feed_quality": quality_metrics or {},
    }

    return result


def create_gmc_audit_function() -> inngest.Function | None:
    """Create the GMC audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="gmc-audit",
        trigger=inngest.TriggerEvent(event="audit/gmc.requested"),
        retries=1,
    )
    async def gmc_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run GMC audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        session_id = ctx.event.data.get("session_id", run_id)
        pb_record_id = ctx.event.data.get("pocketbase_record_id")
        result = init_audit_result(run_id, AUDIT_TYPE)
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Get config
        gmc_config = _get_gmc_config()
        merchant_id = gmc_config.get("merchant_id", "")
        creds_path = gmc_config.get("service_account_key_path", "")

        # Step 1: Check connection
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step1_result = await ctx.step.run(
            "check-gmc-connection",
            lambda: _step_1_check_connection(merchant_id, creds_path),
        )
        result["steps"].append(step1_result["step"])
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        if not step1_result["success"]:
            # Skip remaining steps
            for step_def in STEPS[1:]:
                result["steps"].append(
                    {
                        "id": step_def["id"],
                        "name": step_def["name"],
                        "description": step_def["description"],
                        "status": "skipped",
                        "started_at": None,
                        "completed_at": None,
                        "duration_ms": None,
                        "result": None,
                        "error_message": None,
                    }
                )
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
            return result

        token = step1_result["token"]
        account_issues = step1_result["account_issues"]

        # Step 2: Products status
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step2_result = await ctx.step.run(
            "fetch-products-status",
            lambda: _step_2_products_status(merchant_id, token),
        )
        result["steps"].append(step2_result["step"])
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        products_data = {
            "total_products": step2_result["total_products"],
            "approved": step2_result["approved"],
            "disapproved": step2_result["disapproved"],
            "pending": step2_result["pending"],
            "rejection_reasons": step2_result["rejection_reasons"],
            "products_with_issues": step2_result["products_with_issues"],
        }

        # Step 3: Feed sync
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step3_result = await ctx.step.run(
            "analyze-feed-sync",
            lambda: _step_3_feed_sync(merchant_id, products_data),
        )
        result["steps"].append(step3_result["step"])
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        google_pub_status = step3_result["google_pub_status"]

        # Step 4: Feed quality
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        step4_result = await ctx.step.run(
            "analyze-feed-quality",
            lambda: _step_5_feed_quality(merchant_id, token, products_data),
        )
        result["steps"].append(step4_result["step"])
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        quality_metrics = step4_result["quality_metrics"]

        # Step 5: Issues check
        step5 = {
            "id": "issues_check",
            "name": "Problèmes",
            "description": "Détection des problèmes",
            "status": "running",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": None,
            "duration_ms": None,
            "result": None,
            "error_message": None,
        }
        start_time = datetime.now(tz=UTC)

        # Build issues
        result["issues"] = _build_issues(
            merchant_id, products_data, google_pub_status, account_issues
        )

        # Determine step status based on issues
        has_critical = any(i.get("severity") == "critical" for i in result["issues"])
        has_high = any(i.get("severity") == "high" for i in result["issues"])
        step5["status"] = "error" if has_critical else ("warning" if has_high else "success")
        step5["result"] = {"issues_count": len(result["issues"])}
        step5["completed_at"] = datetime.now(tz=UTC).isoformat()
        step5["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        result["steps"].append(step5)
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Finalize
        final_result = _finalize_result(result, products_data, google_pub_status, quality_metrics)
        save_audit_progress(final_result, AUDIT_TYPE, session_id, pb_record_id)

        return final_result

    return gmc_audit


# Create the function if enabled
gmc_audit_function = create_gmc_audit_function()
