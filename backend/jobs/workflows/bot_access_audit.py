"""
Bot Access Audit Workflow.

Inngest workflow that checks if Ads crawlers can access the site:
1. Check robots.txt for crawler blocks
2. Test Googlebot user-agent access
3. Test Facebookbot user-agent access
4. Check for anti-bot protection headers
"""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import inngest
import requests

from jobs.audit_workflow import INNGEST_ENABLED, inngest_client
from services.config_service import ConfigService


# Bot User-Agents to test
BOT_USER_AGENTS = {
    "googlebot": ("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"),
    "googlebot_ads": ("AdsBot-Google (+http://www.google.com/adsbot.html)"),
    "facebookbot": ("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)"),
    "meta_crawler": (
        "meta-externalagent/1.1 (+https://developers.facebook.com/docs/sharing/webmasters/crawler)"
    ),
}

# Paths that GMC and Meta need to access
CRITICAL_PATHS = [
    "/",
    "/collections",
    "/products",
]

STEPS = [
    {
        "id": "robots_txt",
        "name": "Robots.txt",
        "description": "Vérification des règles pour crawlers Ads",
    },
    {
        "id": "googlebot_access",
        "name": "Accès Googlebot",
        "description": "Test d'accès avec User-Agent Googlebot",
    },
    {
        "id": "facebookbot_access",
        "name": "Accès Facebookbot",
        "description": "Test d'accès avec User-Agent Meta/Facebook",
    },
    {
        "id": "protection_headers",
        "name": "Protection Anti-Bot",
        "description": "Détection de Cloudflare, WAF, etc.",
    },
]


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result structure."""
    now = datetime.now(tz=UTC).isoformat()
    return {
        "id": run_id,
        "audit_type": "bot_access",
        "audit_category": "config",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": now,
        "completed_at": None,
        "progress": 0,
        "steps": [
            {
                "id": step["id"],
                "name": step["name"],
                "description": step["description"],
                "status": "pending",
                "started_at": None,
                "completed_at": None,
                "duration_ms": None,
                "result": None,
                "error_message": None,
            }
            for step in STEPS
        ],
        "bots_can_access": False,
        "robots_txt": {},
        "googlebot_access": {},
        "facebookbot_access": {},
        "protection_headers": {},
        "recommendations": [],
        "issues": [],
        "summary": {},
        "error": None,
    }


def _save_progress(
    result: dict[str, Any],
    session_id: str | None = None,
    pocketbase_record_id: str | None = None,
) -> None:
    """Save audit progress to session file."""
    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)
    latest_file = storage_dir / "latest_session.json"

    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": f"session_{result['id'][:8]}",
            "created_at": result.get("started_at", ""),
            "updated_at": "",
            "audits": {},
        }

    session["audits"]["bot_access"] = result
    session["updated_at"] = result.get("completed_at") or result.get("started_at", "")

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2)

    # Update PocketBase for realtime subscriptions
    from jobs.pocketbase_progress import update_audit_progress

    pb_session_id = session_id or session["id"]
    update_audit_progress(
        session_id=pb_session_id,
        audit_type="bot_access",
        status=result.get("status", "running"),
        result=result if result.get("status") in ("success", "warning", "error") else None,
        error=result.get("error"),
        pocketbase_record_id=pocketbase_record_id,
    )


def _find_step(result: dict[str, Any], step_id: str) -> dict[str, Any] | None:
    """Find a step by ID in the steps list."""
    for step in result["steps"]:
        if step["id"] == step_id:
            return step
    return None


def _update_step(
    result: dict[str, Any],
    step_id: str,
    status: str,
    error_message: str | None = None,
    step_result: dict[str, Any] | None = None,
) -> None:
    """Update a step's status and optionally its result."""
    step = _find_step(result, step_id)
    if step:
        now = datetime.now(tz=UTC).isoformat()
        if status == "running" and step["started_at"] is None:
            step["started_at"] = now
        step["status"] = status
        if status in ("success", "error", "warning"):
            step["completed_at"] = now
            if step["started_at"]:
                started = datetime.fromisoformat(step["started_at"])
                completed = datetime.fromisoformat(now)
                step["duration_ms"] = int((completed - started).total_seconds() * 1000)
        if error_message:
            step["error_message"] = error_message
        if step_result:
            step["result"] = step_result


def _get_shop_url() -> str | None:
    """
    Get the public shop URL from config.

    The store_url in config is the admin API URL (e.g., isciacus-store.myshopify.com).
    For bot access checks, we need the public storefront URL (e.g., www.isciacusstore.com).
    """
    config = ConfigService()
    shopify_config = config.get_shopify_values()

    # First try shop_domain (the public-facing domain)
    shop_domain = shopify_config.get("shop_domain", "")
    if shop_domain:
        if not shop_domain.startswith("http"):
            return f"https://{shop_domain}"
        return shop_domain

    # Fallback to store_url (admin URL) - but this may not be the public URL
    store_url = shopify_config.get("store_url", "")
    if store_url:
        # Remove https:// prefix and admin path if present
        clean_url = store_url.replace("https://", "").replace("http://", "").rstrip("/")
        # Try to use the public URL - Shopify stores usually have a www. version
        # For now, use the myshopify.com URL as fallback
        return f"https://{clean_url}"

    return None


def _check_robots_txt(result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 1: Check robots.txt for crawler blocks.
    """
    _update_step(result, "robots_txt", "running")

    shop_url = _get_shop_url()
    if not shop_url:
        _update_step(
            result,
            "robots_txt",
            "error",
            error_message="Shop URL not configured",
        )
        result["error"] = "Shop URL not configured"
        return result

    robots_url = f"{shop_url}/robots.txt"
    blocked_bots = []
    warnings = []

    try:
        response = requests.get(robots_url, timeout=10)
        if response.status_code == 200:
            content = response.text.lower()

            # Check for disallow rules that might block crawlers
            # Parse robots.txt
            current_agent = None
            for raw_line in content.split("\n"):
                line = raw_line.strip()
                if line.startswith("user-agent:"):
                    current_agent = line.split(":", 1)[1].strip()
                elif line.startswith("disallow:") and current_agent:
                    path = line.split(":", 1)[1].strip()
                    # Check if critical paths are blocked
                    if path in {"/", "/*"}:
                        if current_agent == "*" or "googlebot" in current_agent:
                            blocked_bots.append(f"Googlebot bloqué par Disallow: {path}")
                        if current_agent == "*" or "facebook" in current_agent:
                            blocked_bots.append(f"Facebookbot bloqué par Disallow: {path}")

            # Check for specific bot blocks
            if "googlebot" in content and "disallow: /" in content:
                warnings.append("Règles spécifiques pour Googlebot détectées")
            if "adsbot" in content and "disallow" in content:
                warnings.append("AdsBot-Google potentiellement bloqué")

            robots_data = {
                "accessible": True,
                "blocked_bots": blocked_bots,
                "warnings": warnings,
                "message": (
                    "✓ robots.txt accessible"
                    if not blocked_bots
                    else f"⚠ {len(blocked_bots)} règle(s) bloquante(s) détectée(s)"
                ),
            }

            status = "warning" if blocked_bots or warnings else "success"
            _update_step(
                result,
                "robots_txt",
                status,
                step_result={"message": robots_data["message"]},
            )
            result["robots_txt"] = robots_data

        elif response.status_code == 404:
            # No robots.txt - that's fine, means no restrictions
            robots_data = {
                "accessible": False,
                "no_file": True,
                "message": "✓ Pas de robots.txt (aucune restriction)",
            }
            _update_step(
                result,
                "robots_txt",
                "success",
                step_result={"message": robots_data["message"]},
            )
            result["robots_txt"] = robots_data
        else:
            robots_data = {
                "accessible": False,
                "error": f"HTTP {response.status_code}",
                "message": f"⚠ Erreur accès robots.txt: HTTP {response.status_code}",
            }
            _update_step(
                result,
                "robots_txt",
                "warning",
                step_result={"message": robots_data["message"]},
            )
            result["robots_txt"] = robots_data

    except requests.RequestException as e:
        _update_step(
            result,
            "robots_txt",
            "error",
            error_message=str(e),
        )
        result["robots_txt"] = {"accessible": False, "error": str(e)}

    result["progress"] = 25
    return result


def _check_googlebot_access(result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 2: Test access with Googlebot user-agent.
    """
    _update_step(result, "googlebot_access", "running")

    shop_url = _get_shop_url()
    if not shop_url:
        _update_step(
            result,
            "googlebot_access",
            "error",
            error_message="Shop URL not configured",
        )
        return result

    tests = []
    blocked = False

    for path in CRITICAL_PATHS:
        url = f"{shop_url}{path}"
        try:
            # Test with Googlebot user-agent
            response = requests.get(
                url,
                headers={"User-Agent": BOT_USER_AGENTS["googlebot"]},
                timeout=10,
                allow_redirects=True,
            )

            test_result = {
                "path": path,
                "status_code": response.status_code,
                "accessible": response.status_code == 200,
            }

            # Check for bot challenge pages
            if response.status_code == 200:
                content = response.text.lower()
                if "captcha" in content or "challenge" in content:
                    test_result["accessible"] = False
                    test_result["blocked_by"] = "CAPTCHA/Challenge"
                    test_result["note"] = (
                        "Cloudflare peut présenter un challenge à notre test, "
                        "mais whitelist généralement les vrais crawlers Google"
                    )
                    blocked = True
                elif "access denied" in content or "forbidden" in content:
                    test_result["accessible"] = False
                    test_result["blocked_by"] = "Access Denied page"
                    blocked = True

            elif response.status_code == 403:
                test_result["blocked_by"] = "HTTP 403 Forbidden"
                blocked = True
            elif response.status_code == 429:
                test_result["blocked_by"] = "HTTP 429 Rate Limited"
                blocked = True

            tests.append(test_result)

        except requests.RequestException as e:
            tests.append(
                {
                    "path": path,
                    "error": str(e),
                    "accessible": False,
                }
            )
            blocked = True

    # Also test AdsBot
    try:
        response = requests.get(
            shop_url,
            headers={"User-Agent": BOT_USER_AGENTS["googlebot_ads"]},
            timeout=10,
        )
        adsbot_ok = response.status_code == 200
        tests.append(
            {
                "path": "/ (AdsBot)",
                "status_code": response.status_code,
                "accessible": adsbot_ok,
            }
        )
        if not adsbot_ok:
            blocked = True
    except requests.RequestException:
        blocked = True

    accessible_count = sum(1 for t in tests if t.get("accessible", False))
    total_tests = len(tests)

    googlebot_data = {
        "tests": tests,
        "all_accessible": not blocked,
        "accessible_count": accessible_count,
        "total_tests": total_tests,
        "message": (
            f"✓ Googlebot peut accéder ({accessible_count}/{total_tests} tests OK)"
            if not blocked
            else f"⚠ Googlebot bloqué ({accessible_count}/{total_tests} tests OK)"
        ),
    }

    status = "success" if not blocked else "warning"
    _update_step(
        result,
        "googlebot_access",
        status,
        step_result={"message": googlebot_data["message"]},
    )
    result["googlebot_access"] = googlebot_data
    result["progress"] = 50

    return result


def _check_facebookbot_access(result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 3: Test access with Facebookbot user-agent.
    """
    _update_step(result, "facebookbot_access", "running")

    shop_url = _get_shop_url()
    if not shop_url:
        _update_step(
            result,
            "facebookbot_access",
            "error",
            error_message="Shop URL not configured",
        )
        return result

    tests = []
    blocked = False

    for path in CRITICAL_PATHS:
        url = f"{shop_url}{path}"
        try:
            # Test with Facebook user-agent
            response = requests.get(
                url,
                headers={"User-Agent": BOT_USER_AGENTS["facebookbot"]},
                timeout=10,
                allow_redirects=True,
            )

            test_result = {
                "path": path,
                "status_code": response.status_code,
                "accessible": response.status_code == 200,
            }

            if response.status_code == 200:
                content = response.text.lower()
                if "captcha" in content or "challenge" in content:
                    test_result["accessible"] = False
                    test_result["blocked_by"] = "CAPTCHA/Challenge"
                    test_result["note"] = (
                        "Cloudflare peut présenter un challenge à notre test, "
                        "mais whitelist généralement les vrais crawlers Meta"
                    )
                    blocked = True
            elif response.status_code in (403, 429):
                test_result["blocked_by"] = f"HTTP {response.status_code}"
                blocked = True

            tests.append(test_result)

        except requests.RequestException as e:
            tests.append(
                {
                    "path": path,
                    "error": str(e),
                    "accessible": False,
                }
            )
            blocked = True

    # Also test Meta crawler
    try:
        response = requests.get(
            shop_url,
            headers={"User-Agent": BOT_USER_AGENTS["meta_crawler"]},
            timeout=10,
        )
        meta_ok = response.status_code == 200
        tests.append(
            {
                "path": "/ (Meta Crawler)",
                "status_code": response.status_code,
                "accessible": meta_ok,
            }
        )
        if not meta_ok:
            blocked = True
    except requests.RequestException:
        blocked = True

    accessible_count = sum(1 for t in tests if t.get("accessible", False))
    total_tests = len(tests)

    facebookbot_data = {
        "tests": tests,
        "all_accessible": not blocked,
        "accessible_count": accessible_count,
        "total_tests": total_tests,
        "message": (
            f"✓ Facebookbot peut accéder ({accessible_count}/{total_tests} tests OK)"
            if not blocked
            else f"⚠ Facebookbot bloqué ({accessible_count}/{total_tests} tests OK)"
        ),
    }

    status = "success" if not blocked else "warning"
    _update_step(
        result,
        "facebookbot_access",
        status,
        step_result={"message": facebookbot_data["message"]},
    )
    result["facebookbot_access"] = facebookbot_data
    result["progress"] = 75

    return result


def _check_protection_headers(result: dict[str, Any]) -> dict[str, Any]:
    """
    Step 4: Check for anti-bot protection (Cloudflare, WAF, etc.).
    """
    _update_step(result, "protection_headers", "running")

    shop_url = _get_shop_url()
    if not shop_url:
        _update_step(
            result,
            "protection_headers",
            "error",
            error_message="Shop URL not configured",
        )
        return result

    protections_detected = []
    warnings = []

    try:
        # Make a request and check headers
        response = requests.get(
            shop_url,
            headers={"User-Agent": BOT_USER_AGENTS["googlebot"]},
            timeout=10,
        )

        headers = response.headers

        # Check for Cloudflare
        if "cf-ray" in headers or "cf-cache-status" in headers:
            protections_detected.append(
                {
                    "type": "Cloudflare",
                    "severity": "info",
                    "note": "Cloudflare détecté - vérifiez que les bots Ads sont whitelistés",
                }
            )

        # Check for other WAFs
        server = headers.get("server", "").lower()
        if "cloudflare" in server:
            pass  # Already detected above
        elif "sucuri" in server:
            protections_detected.append(
                {
                    "type": "Sucuri WAF",
                    "severity": "warning",
                    "note": "Sucuri peut bloquer les crawlers - whitelist recommandée",
                }
            )
        elif "akamai" in server:
            protections_detected.append(
                {
                    "type": "Akamai",
                    "severity": "info",
                    "note": "Akamai CDN détecté",
                }
            )

        # Check for bot detection headers
        if "x-robots-tag" in headers:
            x_robots = headers["x-robots-tag"]
            if "noindex" in x_robots.lower() or "nofollow" in x_robots.lower():
                warnings.append(f"X-Robots-Tag restrictif: {x_robots}")

        # Check response for JavaScript challenges
        content = response.text[:5000].lower()  # Only check first 5KB
        if "turnstile" in content or "cf-turnstile" in content:
            protections_detected.append(
                {
                    "type": "Cloudflare Turnstile",
                    "severity": "high",
                    "note": "Challenge CAPTCHA peut bloquer les crawlers Ads",
                }
            )
        if "hcaptcha" in content:
            protections_detected.append(
                {
                    "type": "hCaptcha",
                    "severity": "high",
                    "note": "hCaptcha bloque les crawlers - configuration requise",
                }
            )
        if "recaptcha" in content and "grecaptcha" in content:
            protections_detected.append(
                {
                    "type": "reCAPTCHA",
                    "severity": "medium",
                    "note": "reCAPTCHA détecté - peut affecter les crawlers",
                }
            )

        # Check for Shopify's own bot protection
        if "__cf_bm" in response.cookies:
            protections_detected.append(
                {
                    "type": "Cloudflare Bot Management",
                    "severity": "info",
                    "note": "Cookie __cf_bm détecté (normal pour Shopify)",
                }
            )

        has_high_severity = any(p.get("severity") == "high" for p in protections_detected)

        blocking_count = sum(1 for p in protections_detected if p["severity"] == "high")
        protection_message = (
            "✓ Aucune protection bloquante détectée"
            if not has_high_severity
            else f"⚠ {blocking_count} protection(s) bloquante(s)"
        )
        protection_data = {
            "protections_detected": protections_detected,
            "warnings": warnings,
            "count": len(protections_detected),
            "has_blocking_protection": has_high_severity,
            "message": protection_message,
        }

        status = "warning" if has_high_severity or warnings else "success"
        _update_step(
            result,
            "protection_headers",
            status,
            step_result={"message": protection_data["message"]},
        )
        result["protection_headers"] = protection_data

    except requests.RequestException as e:
        _update_step(
            result,
            "protection_headers",
            "error",
            error_message=str(e),
        )
        result["protection_headers"] = {"error": str(e)}

    result["progress"] = 100

    # Generate recommendations and issues
    _generate_recommendations(result)

    return result


def _generate_recommendations(result: dict[str, Any]) -> None:
    """Generate recommendations based on audit results."""
    recommendations = []
    issues = []

    # Check robots.txt issues
    robots = result.get("robots_txt", {})
    if robots.get("blocked_bots"):
        issues.append(
            {
                "id": "robots_blocking_bots",
                "audit_type": "bot_access",
                "severity": "high",
                "title": "robots.txt bloque les crawlers Ads",
                "description": (
                    "Votre robots.txt contient des règles qui bloquent Googlebot ou "
                    "Facebookbot. Cela empêche l'indexation de vos produits dans "
                    "Google Shopping et les Dynamic Ads Meta."
                ),
                "details": robots.get("blocked_bots", []),
                "action_available": False,
                "action_status": "not_available",
            }
        )
        recommendations.append("Modifiez robots.txt pour autoriser Googlebot et Facebookbot")

    # Check Googlebot access
    googlebot = result.get("googlebot_access", {})
    if not googlebot.get("all_accessible", True):
        blocked_tests = [t for t in googlebot.get("tests", []) if not t.get("accessible", True)]
        # Check if blocked by Cloudflare challenge
        is_cloudflare_challenge = any("CAPTCHA" in t.get("blocked_by", "") for t in blocked_tests)
        issues.append(
            {
                "id": "googlebot_blocked",
                "audit_type": "bot_access",
                "severity": "medium" if is_cloudflare_challenge else "high",
                "title": "Googlebot ne peut pas accéder au site",
                "description": (
                    "⚠️ Note: Ce test simule Googlebot depuis notre serveur. "
                    "Cloudflare whitelist automatiquement les vraies IPs de Googlebot. "
                    "Vérifiez avec Google Search Console > Paramètres > Exploration."
                    if is_cloudflare_challenge
                    else "Google ne peut pas crawler votre site. Vos produits ne seront pas "
                    "indexés dans Google Shopping et les campagnes Performance Max "
                    "seront impactées."
                ),
                "details": [
                    f"{t['path']}: {t.get('blocked_by', 'Bloqué')}" for t in blocked_tests[:5]
                ],
                "action_available": False,
                "action_status": "not_available",
            }
        )
        recommendations.append(
            "Vérifiez l'exploration dans Google Search Console > Paramètres"
            if is_cloudflare_challenge
            else "Whitelistez les IPs/User-Agents de Googlebot dans votre WAF"
        )

    # Check Facebookbot access
    facebookbot = result.get("facebookbot_access", {})
    if not facebookbot.get("all_accessible", True):
        blocked_fb_tests = [
            t for t in facebookbot.get("tests", []) if not t.get("accessible", True)
        ]
        is_fb_cloudflare_challenge = any(
            "CAPTCHA" in t.get("blocked_by", "") for t in blocked_fb_tests
        )
        issues.append(
            {
                "id": "facebookbot_blocked",
                "audit_type": "bot_access",
                "severity": "medium" if is_fb_cloudflare_challenge else "high",
                "title": "Facebookbot ne peut pas accéder au site",
                "description": (
                    "⚠️ Note: Ce test simule Facebookbot depuis notre serveur. "
                    "Cloudflare whitelist automatiquement les vraies IPs de Meta. "
                    "Vérifiez avec le Debugger de Partage Facebook."
                    if is_fb_cloudflare_challenge
                    else "Meta ne peut pas crawler votre site. Les Dynamic Product Ads "
                    "et le catalogue Meta ne fonctionneront pas correctement."
                ),
                "action_available": bool(is_fb_cloudflare_challenge),
                "action_status": "available" if is_fb_cloudflare_challenge else "not_available",
                "action_label": (
                    "Tester avec Facebook Debugger" if is_fb_cloudflare_challenge else None
                ),
                "action_url": (
                    "https://developers.facebook.com/tools/debug/"
                    if is_fb_cloudflare_challenge
                    else None
                ),
            }
        )
        recommendations.append(
            "Testez avec le Debugger de Partage Facebook pour confirmer"
            if is_fb_cloudflare_challenge
            else "Whitelistez les User-Agents Meta/Facebook dans votre protection anti-bot"
        )

    # Check protection headers
    protection = result.get("protection_headers", {})
    if protection.get("has_blocking_protection"):
        high_protections = [
            p for p in protection.get("protections_detected", []) if p.get("severity") == "high"
        ]
        issues.extend(
            [
                {
                    "id": f"blocking_protection_{prot['type'].lower().replace(' ', '_')}",
                    "audit_type": "bot_access",
                    "severity": "high",
                    "title": f"{prot['type']} bloque les crawlers",
                    "description": prot.get("note", ""),
                    "action_available": False,
                    "action_status": "not_available",
                }
                for prot in high_protections
            ]
        )
        recommendations.append("Configurez votre solution anti-bot pour autoriser les crawlers Ads")

    # Determine overall status
    googlebot_ok = googlebot.get("all_accessible", True)
    facebookbot_ok = facebookbot.get("all_accessible", True)
    no_blocking = not protection.get("has_blocking_protection", False)
    no_robots_block = not robots.get("blocked_bots")

    result["bots_can_access"] = googlebot_ok and facebookbot_ok and no_blocking and no_robots_block
    result["recommendations"] = recommendations
    result["issues"] = issues


def create_bot_access_audit_function() -> inngest.Function | None:
    """Create Bot Access audit workflow."""
    if not INNGEST_ENABLED or inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="bot-access-audit",
        trigger=inngest.TriggerEvent(event="audit/bot-access.requested"),
        retries=1,
    )
    async def bot_access_audit_fn(ctx: inngest.Context) -> dict[str, Any]:
        """
        Bot Access Audit workflow.

        Checks if Ads crawlers (Googlebot, Facebookbot) can access the site.

        Steps:
        1. Check robots.txt for crawler blocks
        2. Test Googlebot user-agent access
        3. Test Facebookbot user-agent access
        4. Check for anti-bot protection

        Returns:
            Audit result with bot access status and recommendations
        """
        run_id = ctx.run_id if hasattr(ctx, "run_id") else str(ctx.event.data.get("run_id", ""))
        session_id = ctx.event.data.get("session_id", run_id)
        pb_record_id = ctx.event.data.get("pocketbase_record_id")

        result = _init_result(run_id)
        _save_progress(result, session_id, pb_record_id)

        # Step 1: Check robots.txt
        robots_result = await ctx.step.run(
            "check-robots-txt",
            lambda: _check_robots_txt(result),
        )
        result.update(robots_result)
        _save_progress(result, session_id, pb_record_id)

        # Step 2: Check Googlebot access
        googlebot_result = await ctx.step.run(
            "check-googlebot-access",
            lambda: _check_googlebot_access(result),
        )
        result.update(googlebot_result)
        _save_progress(result, session_id, pb_record_id)

        # Step 3: Check Facebookbot access
        facebookbot_result = await ctx.step.run(
            "check-facebookbot-access",
            lambda: _check_facebookbot_access(result),
        )
        result.update(facebookbot_result)
        _save_progress(result, session_id, pb_record_id)

        # Step 4: Check protection headers
        protection_result = await ctx.step.run(
            "check-protection-headers",
            lambda: _check_protection_headers(result),
        )
        result.update(protection_result)
        _save_progress(result, session_id, pb_record_id)

        # Mark as completed
        result["status"] = "success" if result["bots_can_access"] else "warning"
        result["progress"] = 100
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            "bots_can_access": result["bots_can_access"],
            "googlebot_ok": result.get("googlebot_access", {}).get("all_accessible", False),
            "facebookbot_ok": result.get("facebookbot_access", {}).get("all_accessible", False),
            "protections_count": result.get("protection_headers", {}).get("count", 0),
            "issues_count": len(result.get("issues", [])),
        }
        _save_progress(result, session_id, pb_record_id)

        return result

    return bot_access_audit_fn


# Create the function if enabled
bot_access_audit_function = create_bot_access_audit_function()
