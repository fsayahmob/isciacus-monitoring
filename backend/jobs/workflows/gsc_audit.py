"""
Google Search Console Audit Workflow - Inngest Job
===================================================
Full async workflow with step-by-step progress updates.
Supports two modes:
- Full GSC mode: When Google Search Console is configured
- Basic SEO mode: When GSC is not configured (robots.txt, sitemap, meta tags analysis)
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote, urljoin
from uuid import uuid4
from xml.etree import ElementTree as ET

import inngest
import requests
from bs4 import BeautifulSoup

from jobs.audit_workflow import inngest_client
from jobs.pocketbase_progress import init_audit_result, save_audit_progress


AUDIT_TYPE = "search_console"

STEPS_WITH_GSC = [
    {"id": "gsc_connection", "name": "Connexion GSC", "description": "Connexion Search Console"},
    {"id": "indexation", "name": "Indexation", "description": "Couverture d'indexation"},
    {"id": "errors", "name": "Erreurs", "description": "Vérification des erreurs"},
    {"id": "sitemaps", "name": "Sitemaps", "description": "Statut des sitemaps"},
]

STEPS_BASIC_SEO = [
    {"id": "robots_txt", "name": "Robots.txt", "description": "Analyse du fichier robots.txt"},
    {"id": "sitemap_check", "name": "Sitemap", "description": "Vérification du sitemap public"},
    {"id": "meta_tags", "name": "Meta Tags", "description": "Analyse des balises meta"},
    {"id": "seo_basics", "name": "SEO Basique", "description": "Vérifications techniques SEO"},
]

# Keep STEPS for backwards compatibility
STEPS = STEPS_WITH_GSC




def _get_gsc_config() -> dict[str, str]:
    """Get GSC config from ConfigService."""
    try:
        from services.config_service import ConfigService

        config = ConfigService()
        return config.get_search_console_values()
    except Exception:
        return {}


def _get_site_url() -> str:
    """Get the site URL from Shopify config."""
    try:
        from services.config_service import ConfigService

        config = ConfigService()
        shopify_config = config.get_shopify_values()
        store_url = shopify_config.get("store_url", "")
        if store_url and not store_url.startswith("http"):
            store_url = f"https://{store_url}"
        return store_url
    except Exception:
        return ""


# =============================================================================
# BASIC SEO ANALYSIS FUNCTIONS (when GSC is not configured)
# =============================================================================


def _step_basic_robots_txt(site_url: str) -> dict[str, Any]:
    """Analyze robots.txt file."""
    step = {
        "id": "robots_txt",
        "name": "Robots.txt",
        "description": "Analyse du fichier robots.txt",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    try:
        robots_url = urljoin(site_url, "/robots.txt")
        resp = requests.get(robots_url, timeout=10)

        if resp.status_code == 200:
            content = resp.text
            has_sitemap = "sitemap:" in content.lower()
            has_disallow = "disallow:" in content.lower()
            blocks_all = "disallow: /" in content and "user-agent: *" in content.lower()

            step["result"] = {
                "exists": True,
                "has_sitemap_directive": has_sitemap,
                "has_disallow_rules": has_disallow,
                "blocks_all": blocks_all,
                "url": robots_url,
            }

            if blocks_all:
                step["status"] = "error"
                issues.append(
                    {
                        "id": "robots_blocks_all",
                        "audit_type": "search_console",
                        "severity": "critical",
                        "title": "⛔ Site bloqué par robots.txt",
                        "description": (
                            "Votre robots.txt bloque l'accès à tout le site. "
                            "Les moteurs de recherche ne peuvent pas indexer vos pages."
                        ),
                        "action_available": True,
                        "action_label": "Modifier robots.txt",
                        "action_url": f"{site_url}/admin/settings/files",
                        "recommendation": (
                            "Retirez la règle 'Disallow: /' pour permettre l'indexation."
                        ),
                    }
                )
            elif not has_sitemap:
                step["status"] = "warning"
                issues.append(
                    {
                        "id": "robots_no_sitemap",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": "⚠️ Sitemap non déclaré dans robots.txt",
                        "description": (
                            "Votre robots.txt ne contient pas de directive Sitemap. "
                            "Ajoutez cette directive pour aider les moteurs de recherche."
                        ),
                        "action_available": False,
                        "recommendation": f"Ajoutez: Sitemap: {urljoin(site_url, '/sitemap.xml')}",
                    }
                )
            else:
                step["status"] = "success"
        elif resp.status_code == 404:
            step["status"] = "warning"
            step["result"] = {"exists": False}
            issues.append(
                {
                    "id": "robots_not_found",
                    "audit_type": "search_console",
                    "severity": "medium",
                    "title": "⚠️ Fichier robots.txt absent",
                    "description": (
                        "Aucun fichier robots.txt n'a été trouvé. Ce fichier aide "
                        "les moteurs de recherche à explorer votre site efficacement."
                    ),
                    "action_available": False,
                    "recommendation": "Shopify génère un robots.txt automatiquement.",
                }
            )
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur HTTP {resp.status_code}"

    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {"step": step, "issues": issues}


def _step_basic_sitemap(site_url: str) -> dict[str, Any]:
    """Check sitemap.xml accessibility and content."""
    step = {
        "id": "sitemap_check",
        "name": "Sitemap",
        "description": "Vérification du sitemap public",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    try:
        sitemap_url = urljoin(site_url, "/sitemap.xml")
        resp = requests.get(sitemap_url, timeout=15)

        if resp.status_code == 200:
            try:
                root = ET.fromstring(resp.content)
                # Count URLs in sitemap
                ns = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
                urls = root.findall(".//sm:url", ns) or root.findall(".//url")
                sitemaps = root.findall(".//sm:sitemap", ns) or root.findall(".//sitemap")

                url_count = len(urls)
                sitemap_count = len(sitemaps)
                is_index = sitemap_count > 0

                step["result"] = {
                    "exists": True,
                    "is_index": is_index,
                    "url_count": url_count,
                    "sitemap_count": sitemap_count,
                    "url": sitemap_url,
                }

                if url_count == 0 and sitemap_count == 0:
                    step["status"] = "warning"
                    issues.append(
                        {
                            "id": "sitemap_empty",
                            "audit_type": "search_console",
                            "severity": "medium",
                            "title": "⚠️ Sitemap vide",
                            "description": "Le sitemap existe mais ne contient aucune URL.",
                            "action_available": False,
                            "recommendation": "Vérifiez que vos produits/pages sont publiés.",
                        }
                    )
                elif url_count < 10 and not is_index:
                    step["status"] = "warning"
                    issues.append(
                        {
                            "id": "sitemap_few_urls",
                            "audit_type": "search_console",
                            "severity": "low",
                            "title": f"📊 Sitemap contient seulement {url_count} URLs",
                            "description": (
                                "Peu d'URLs dans votre sitemap. "
                                "C'est normal pour un petit site ou un site récent."
                            ),
                            "action_available": False,
                        }
                    )
                else:
                    step["status"] = "success"

            except ET.ParseError:
                step["status"] = "error"
                step["error_message"] = "Sitemap XML invalide"
                issues.append(
                    {
                        "id": "sitemap_invalid",
                        "audit_type": "search_console",
                        "severity": "critical",
                        "title": "⛔ Sitemap XML invalide",
                        "description": "Le fichier sitemap.xml contient des erreurs de syntaxe.",
                        "action_available": False,
                        "recommendation": "Contactez le support Shopify si le problème persiste.",
                    }
                )

        elif resp.status_code == 404:
            step["status"] = "error"
            step["result"] = {"exists": False}
            issues.append(
                {
                    "id": "sitemap_not_found",
                    "audit_type": "search_console",
                    "severity": "critical",
                    "title": "⛔ Sitemap introuvable",
                    "description": (
                        "Aucun sitemap.xml trouvé à l'URL standard. "
                        "Les moteurs de recherche ont besoin d'un sitemap pour découvrir vos pages."
                    ),
                    "action_available": True,
                    "action_label": "Vérifier dans Search Console",
                    "action_url": "https://search.google.com/search-console",
                    "recommendation": "Shopify génère automatiquement un sitemap.",
                }
            )
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur HTTP {resp.status_code}"

    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {"step": step, "issues": issues}


def _step_basic_meta_tags(site_url: str) -> dict[str, Any]:
    """Analyze meta tags on the homepage."""
    step = {
        "id": "meta_tags",
        "name": "Meta Tags",
        "description": "Analyse des balises meta de la page d'accueil",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"User-Agent": "Mozilla/5.0 SEO Audit Bot"}
    try:
        resp = requests.get(site_url, timeout=15, headers=headers)

        if resp.status_code == 200:
            soup = BeautifulSoup(resp.text, "html.parser")

            # Extract meta tags
            title_tag = soup.find("title")
            title = title_tag.text.strip() if title_tag else ""

            meta_desc = soup.find("meta", attrs={"name": "description"})
            description = meta_desc.get("content", "").strip() if meta_desc else ""

            canonical = soup.find("link", attrs={"rel": "canonical"})
            canonical_url = canonical.get("href", "") if canonical else ""

            og_title = soup.find("meta", attrs={"property": "og:title"})
            og_desc = soup.find("meta", attrs={"property": "og:description"})
            og_image = soup.find("meta", attrs={"property": "og:image"})

            h1_tags = soup.find_all("h1")
            h1_count = len(h1_tags)
            h1_text = h1_tags[0].text.strip() if h1_tags else ""

            step["result"] = {
                "title": title,
                "title_length": len(title),
                "description": description[:150] + "..." if len(description) > 150 else description,
                "description_length": len(description),
                "has_canonical": bool(canonical_url),
                "has_og_tags": bool(og_title or og_desc or og_image),
                "h1_count": h1_count,
                "h1_text": h1_text[:100] if h1_text else "",
            }

            # Analyze issues
            if not title:
                step["status"] = "error"
                issues.append(
                    {
                        "id": "meta_no_title",
                        "audit_type": "search_console",
                        "severity": "critical",
                        "title": "⛔ Balise title manquante",
                        "description": "Balise title manquante sur la page d'accueil.",
                        "action_available": True,
                        "action_label": "Modifier dans Shopify",
                        "action_url": f"{site_url}/admin/online_store/preferences",
                        "recommendation": (
                            "Ajoutez un titre unique et descriptif de 50 à 60 caractères."
                        ),
                    }
                )
            elif len(title) < 30:
                issues.append(
                    {
                        "id": "meta_title_short",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": f"⚠️ Title trop court ({len(title)} car.)",
                        "description": f'Votre title "{title}" est trop court.',
                        "action_available": False,
                        "recommendation": "Visez 50-60 caractères pour un titre optimal.",
                    }
                )
            elif len(title) > 70:
                issues.append(
                    {
                        "id": "meta_title_long",
                        "audit_type": "search_console",
                        "severity": "low",
                        "title": f"📊 Title long ({len(title)} car.)",
                        "description": "Votre title sera tronqué dans les résultats Google.",
                        "action_available": False,
                        "recommendation": "Gardez l'essentiel dans les 60 premiers caractères.",
                    }
                )

            if not description:
                issues.append(
                    {
                        "id": "meta_no_description",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": "⚠️ Meta description manquante",
                        "description": "Ajoutez une description pour améliorer votre taux de clic.",
                        "action_available": True,
                        "action_label": "Modifier dans Shopify",
                        "action_url": f"{site_url}/admin/online_store/preferences",
                        "recommendation": (
                            "Rédigez une description attrayante de 150 à 160 caractères."
                        ),
                    }
                )
            elif len(description) < 100:
                issues.append(
                    {
                        "id": "meta_desc_short",
                        "audit_type": "search_console",
                        "severity": "low",
                        "title": f"📊 Meta description courte ({len(description)} car.)",
                        "description": "Une description plus longue peut améliorer votre CTR.",
                        "action_available": False,
                        "recommendation": "Visez 150-160 caractères.",
                    }
                )

            if h1_count == 0:
                issues.append(
                    {
                        "id": "meta_no_h1",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": "⚠️ Aucune balise H1",
                        "description": "La page d'accueil n'a pas de titre principal (H1).",
                        "action_available": False,
                        "recommendation": "Ajoutez un H1 unique décrivant votre activité.",
                    }
                )
            elif h1_count > 1:
                issues.append(
                    {
                        "id": "meta_multiple_h1",
                        "audit_type": "search_console",
                        "severity": "low",
                        "title": f"📊 {h1_count} balises H1 détectées",
                        "description": "Idéalement, une seule H1 par page.",
                        "action_available": False,
                    }
                )

            if step["status"] != "error":
                step["status"] = "warning" if issues else "success"
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur HTTP {resp.status_code}"

    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {"step": step, "issues": issues}


def _step_basic_seo_checks(site_url: str) -> dict[str, Any]:
    """Perform basic SEO technical checks."""
    step = {
        "id": "seo_basics",
        "name": "SEO Basique",
        "description": "Vérifications techniques SEO",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    checks = {
        "https": False,
        "www_redirect": None,
        "response_time_ms": None,
        "page_size_kb": None,
    }

    try:
        # Check HTTPS
        checks["https"] = site_url.startswith("https://")

        if not checks["https"]:
            issues.append(
                {
                    "id": "seo_no_https",
                    "audit_type": "search_console",
                    "severity": "critical",
                    "title": "⛔ Site non sécurisé (HTTP)",
                    "description": "Votre site n'utilise pas HTTPS, pénalisé par Google.",
                    "action_available": False,
                    "recommendation": "Activez SSL dans Shopify > Paramètres > Domaines.",
                }
            )

        # Check response time and page size
        start_request = datetime.now(tz=UTC)
        seo_headers = {"User-Agent": "Mozilla/5.0 SEO Audit Bot"}
        resp = requests.get(site_url, timeout=15, headers=seo_headers)
        end_request = datetime.now(tz=UTC)

        checks["response_time_ms"] = int((end_request - start_request).total_seconds() * 1000)
        checks["page_size_kb"] = len(resp.content) / 1024

        if checks["response_time_ms"] > 3000:
            issues.append(
                {
                    "id": "seo_slow_response",
                    "audit_type": "search_console",
                    "severity": "medium",
                    "title": f"⚠️ Site lent ({checks['response_time_ms']}ms)",
                    "description": "Le temps de réponse est supérieur à 3 secondes.",
                    "action_available": False,
                    "recommendation": "Optimisez vos images, réduisez les apps, utilisez un CDN.",
                }
            )

        if checks["page_size_kb"] > 3000:
            issues.append(
                {
                    "id": "seo_large_page",
                    "audit_type": "search_console",
                    "severity": "medium",
                    "title": f"⚠️ Page lourde ({checks['page_size_kb']:.0f} KB)",
                    "description": "La page d'accueil dépasse 3 MB.",
                    "action_available": False,
                    "recommendation": "Compressez vos images et limitez les scripts externes.",
                }
            )

        # Check WWW redirect
        if "www" in site_url:
            non_www = site_url.replace("www.", "")
            www_resp = requests.get(non_www, timeout=5, allow_redirects=False)
            checks["www_redirect"] = www_resp.status_code in [301, 302]
        else:
            www_url = site_url.replace("://", "://www.")
            www_resp = requests.get(www_url, timeout=5, allow_redirects=False)
            checks["www_redirect"] = www_resp.status_code in [301, 302]

        step["result"] = checks
        step["status"] = "warning" if issues else "success"

    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
    return {"step": step, "issues": issues}


def _get_gsc_token(creds_path: str) -> str | None:
    """Get GSC access token."""
    try:
        from google.auth.transport.requests import Request
        from google.oauth2 import service_account

        if not creds_path or not Path(creds_path).exists():
            return None

        credentials = service_account.Credentials.from_service_account_file(
            creds_path,
            scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
        )
        credentials.refresh(Request())
        return credentials.token
    except Exception:
        return None


def _step_1_check_connection(site_url: str, creds_path: str) -> dict[str, Any]:
    """Step 1: Check GSC connection."""
    step = {
        "id": "gsc_connection",
        "name": "Connexion GSC",
        "description": "Connexion Search Console",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)

    if not site_url:
        step["status"] = "error"
        step["error_message"] = "GOOGLE_SEARCH_CONSOLE_PROPERTY non configuré"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    token = _get_gsc_token(creds_path)
    if not token:
        step["status"] = "error"
        step["error_message"] = "Fichier credentials Google non trouvé"
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    try:
        headers = {"Authorization": f"Bearer {token}"}
        encoded_site = quote(site_url, safe="")
        resp = requests.get(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}",
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            step["status"] = "success"
            step["result"] = {"site_url": site_url}
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API GSC: {resp.status_code}"
            step["completed_at"] = datetime.now(tz=UTC).isoformat()
            step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
            return {"step": step, "success": False, "token": None}
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)
        step["completed_at"] = datetime.now(tz=UTC).isoformat()
        step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)
        return {"step": step, "success": False, "token": None}

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "success": True, "token": token}


def _step_2_check_indexation(site_url: str, token: str) -> dict[str, Any]:
    """Step 2: Check indexation coverage."""
    step = {
        "id": "indexation",
        "name": "Indexation",
        "description": "Couverture d'indexation",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    end_date = datetime.now(tz=UTC).date()
    start_date = end_date - timedelta(days=28)

    try:
        resp = requests.post(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query",
            headers=headers,
            json={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["page"],
                "rowLimit": 1000,
            },
            timeout=30,
        )

        if resp.status_code == 200:
            rows = resp.json().get("rows", [])
            indexed_pages = len(rows)

            # Estimate total pages
            # Use a conservative estimate since we can't access product count here
            # without ShopifyAnalyticsService internal methods
            try:
                # Estimate based on indexed pages (conservative)
                estimated_pages = max(indexed_pages, 100)
            except Exception:
                estimated_pages = 100

            if indexed_pages >= estimated_pages * 0.8:
                step["status"] = "success"
            else:
                step["status"] = "warning"
                issues.append(
                    {
                        "id": "gsc_low_indexation",
                        "audit_type": "search_console",
                        "severity": "warning",
                        "title": "Couverture d'indexation faible",
                        "description": (
                            f"{indexed_pages} pages indexées " f"sur ~{estimated_pages} estimées"
                        ),
                        "action_available": False,
                    }
                )

            step["result"] = {"indexed": indexed_pages, "estimated_total": estimated_pages}
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API: {resp.status_code}"
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_3_check_errors(site_url: str, token: str) -> dict[str, Any]:
    """Step 3: Check crawl errors."""
    step = {
        "id": "errors",
        "name": "Erreurs",
        "description": "Vérification des erreurs",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    end_date = datetime.now(tz=UTC).date()
    start_date = end_date - timedelta(days=28)

    try:
        resp = requests.post(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/searchAnalytics/query",
            headers=headers,
            json={
                "startDate": start_date.strftime("%Y-%m-%d"),
                "endDate": end_date.strftime("%Y-%m-%d"),
                "dimensions": ["page"],
                "rowLimit": 1000,
            },
            timeout=30,
        )

        errors_found = 0
        if resp.status_code == 200:
            rows = resp.json().get("rows", [])
            low_impression_pages = [r for r in rows if r.get("impressions", 0) == 0]
            errors_found = len(low_impression_pages)

        if errors_found > 10:
            step["status"] = "warning"
            issues.append(
                {
                    "id": "gsc_potential_errors",
                    "audit_type": "search_console",
                    "severity": "medium",
                    "title": f"{errors_found} pages à vérifier",
                    "description": "Plusieurs pages ont 0 impressions",
                    "action_available": False,
                }
            )
        else:
            step["status"] = "success"

        step["result"] = {"potential_issues": errors_found}
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


def _step_4_check_sitemaps(site_url: str, token: str) -> dict[str, Any]:
    """Step 4: Check sitemaps."""
    step = {
        "id": "sitemaps",
        "name": "Sitemaps",
        "description": "Statut des sitemaps",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues = []

    headers = {"Authorization": f"Bearer {token}"}
    encoded_site = quote(site_url, safe="")

    try:
        resp = requests.get(
            f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/sitemaps",
            headers=headers,
            timeout=10,
        )

        if resp.status_code == 200:
            sitemaps = resp.json().get("sitemap", [])
            if sitemaps:
                step["status"] = "success"
                step["result"] = {
                    "count": len(sitemaps),
                    "sitemaps": [s.get("path") for s in sitemaps[:5]],
                }
            else:
                step["status"] = "warning"
                step["result"] = {"count": 0}
                issues.append(
                    {
                        "id": "gsc_no_sitemap",
                        "audit_type": "search_console",
                        "severity": "medium",
                        "title": "Aucun sitemap soumis",
                        "description": "Soumettez un sitemap pour améliorer l'indexation",
                        "action_available": True,
                        "action_label": "Soumettre sitemap",
                        "action_url": f"https://search.google.com/search-console/sitemaps?resource_id={quote(site_url)}",
                        "action_status": "available",
                    }
                )
        else:
            step["status"] = "error"
            step["error_message"] = f"Erreur API: {resp.status_code}"
    except Exception as e:
        step["status"] = "error"
        step["error_message"] = str(e)

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues}


async def _run_basic_seo_audit(
    ctx: inngest.Context,
    result: dict[str, Any],
    session_id: str | None = None,
    pb_record_id: str | None = None,
) -> dict[str, Any]:
    """Run basic SEO audit (when GSC is not configured)."""
    site_url = _get_site_url()

    if not site_url:
        # No site URL configured - cannot run audit
        result["steps"].append(
            {
                "id": "robots_txt",
                "name": "Robots.txt",
                "description": "Analyse du fichier robots.txt",
                "status": "error",
                "error_message": "URL du site non configurée. Configurez Shopify dans Settings.",
                "started_at": datetime.now(tz=UTC).isoformat(),
                "completed_at": datetime.now(tz=UTC).isoformat(),
                "duration_ms": 0,
                "result": None,
            }
        )
        for step_def in STEPS_BASIC_SEO[1:]:
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
        result["summary"] = {"mode": "basic_seo", "site_url": "", "issues_count": 0}
        return result

    # Step 1: Robots.txt
    step1_result = await ctx.step.run("check-robots-txt", lambda: _step_basic_robots_txt(site_url))
    result["steps"].append(step1_result["step"])
    result["issues"].extend(step1_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Step 2: Sitemap
    step2_result = await ctx.step.run("check-sitemap", lambda: _step_basic_sitemap(site_url))
    result["steps"].append(step2_result["step"])
    result["issues"].extend(step2_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Step 3: Meta Tags
    step3_result = await ctx.step.run("check-meta-tags", lambda: _step_basic_meta_tags(site_url))
    result["steps"].append(step3_result["step"])
    result["issues"].extend(step3_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Step 4: SEO Basics
    step4_result = await ctx.step.run("check-seo-basics", lambda: _step_basic_seo_checks(site_url))
    result["steps"].append(step4_result["step"])
    result["issues"].extend(step4_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Finalize
    has_errors = any(s.get("status") == "error" for s in result["steps"])
    has_warnings = any(s.get("status") == "warning" for s in result["steps"])
    result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
    result["completed_at"] = datetime.now(tz=UTC).isoformat()
    result["summary"] = {
        "mode": "basic_seo",
        "site_url": site_url,
        "issues_count": len(result["issues"]),
        "note": "Mode basique - Configurez GSC pour plus de données",
    }

    return result


async def _run_gsc_audit(
    ctx: inngest.Context,
    result: dict[str, Any],
    site_url: str,
    creds_path: str,
    session_id: str | None = None,
    pb_record_id: str | None = None,
) -> dict[str, Any]:
    """Run full GSC audit (when GSC is configured)."""
    # Step 1: Check connection
    step1_result = await ctx.step.run(
        "check-gsc-connection",
        lambda: _step_1_check_connection(site_url, creds_path),
    )
    result["steps"].append(step1_result["step"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    if not step1_result["success"]:
        for step_def in STEPS_WITH_GSC[1:]:
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
        result["summary"] = {"mode": "gsc", "site_url": site_url, "issues_count": 0}
        return result

    token = step1_result["token"]

    # Step 2: Check indexation
    step2_result = await ctx.step.run(
        "check-indexation", lambda: _step_2_check_indexation(site_url, token)
    )
    result["steps"].append(step2_result["step"])
    result["issues"].extend(step2_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Step 3: Check errors
    step3_result = await ctx.step.run("check-errors", lambda: _step_3_check_errors(site_url, token))
    result["steps"].append(step3_result["step"])
    result["issues"].extend(step3_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Step 4: Check sitemaps
    step4_result = await ctx.step.run(
        "check-sitemaps", lambda: _step_4_check_sitemaps(site_url, token)
    )
    result["steps"].append(step4_result["step"])
    result["issues"].extend(step4_result["issues"])
    save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

    # Finalize
    has_errors = any(s.get("status") == "error" for s in result["steps"])
    has_warnings = any(s.get("status") == "warning" for s in result["steps"])
    result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
    result["completed_at"] = datetime.now(tz=UTC).isoformat()
    result["summary"] = {"mode": "gsc", "site_url": site_url, "issues_count": len(result["issues"])}

    return result


def create_gsc_audit_function() -> inngest.Function | None:
    """Create the GSC/SEO audit Inngest function.

    This function runs in two modes:
    - Full GSC mode: When Google Search Console is configured
    - Basic SEO mode: When GSC is not configured (analyzes robots.txt, sitemap, meta tags)
    """
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="gsc-audit",
        trigger=inngest.TriggerEvent(event="audit/gsc.requested"),
        retries=1,
    )
    async def gsc_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run GSC/SEO audit with step-by-step progress."""
        run_id = ctx.event.data.get("run_id", str(uuid4())[:8])
        session_id = ctx.event.data.get("session_id", run_id)
        pb_record_id = ctx.event.data.get("pocketbase_record_id")

        result = init_audit_result(run_id, AUDIT_TYPE)
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Check if GSC is configured
        gsc_config = _get_gsc_config()
        gsc_site_url = gsc_config.get("property_url", "")
        creds_path = gsc_config.get("service_account_key_path", "")
        gsc_configured = bool(gsc_site_url and creds_path)

        if gsc_configured:
            # Run full GSC audit
            result = await _run_gsc_audit(
                ctx, result, gsc_site_url, creds_path, session_id, pb_record_id
            )
        else:
            # Run basic SEO audit
            result = await _run_basic_seo_audit(ctx, result, session_id, pb_record_id)

        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        return result

    return gsc_audit


gsc_audit_function = create_gsc_audit_function()
