"""
Ads Readiness Audit Workflow - Inngest Job
===========================================
Audit global de préparation pour lancer des campagnes publicitaires.

Vérifie :
1. Qualité du tracking (GA4, Meta, GTM)
2. Données de conversion complètes
3. Segmentation disponible
4. Attribution multi-touch possible
5. Métriques ROAS/CPA/LTV calculables

Score final : X/100 avec détails des problèmes.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client
from jobs.pocketbase_progress import (
    get_audit_result,
    init_audit_result,
    save_audit_progress,
)


AUDIT_TYPE = "ads_readiness"

# Session ID stored during workflow execution for cross-audit lookups
_current_session_id: str | None = None

STEPS = [
    {
        "id": "tracking_quality",
        "name": "Qualité Tracking",
        "description": "Vérification qualité des données GA4/Meta",
    },
    {
        "id": "conversion_completeness",
        "name": "Conversions Complètes",
        "description": "Validation données de conversion",
    },
    {
        "id": "segmentation_data",
        "name": "Données Segmentation",
        "description": "Device, country, source/medium disponibles",
    },
    {
        "id": "attribution_readiness",
        "name": "Attribution Multi-Touch",
        "description": "UTM tracking et user journey",
    },
    {
        "id": "ads_metrics_calculable",
        "name": "Métriques Ads",
        "description": "ROAS, CPA, LTV calculables",
    },
]




def _get_ga4_audit_results() -> dict[str, Any] | None:
    """Récupère les résultats de l'audit GA4 depuis PocketBase."""
    if _current_session_id is None:
        return None
    return get_audit_result(_current_session_id, "ga4_tracking")


def _get_capi_audit_results() -> dict[str, Any] | None:
    """Récupère les résultats de l'audit CAPI depuis PocketBase."""
    if _current_session_id is None:
        return None
    return get_audit_result(_current_session_id, "capi")


def _get_meta_audit_results() -> dict[str, Any] | None:
    """Récupère les résultats de l'audit Meta Pixel depuis PocketBase."""
    if _current_session_id is None:
        return None
    return get_audit_result(_current_session_id, "meta_pixel")


def _check_tracking_quality() -> dict[str, Any]:
    """
    Step 1: Vérifier la qualité du tracking GA4 et Meta.

    Priorité :
    1. Utiliser les résultats des audits GA4/Meta déjà effectués (données réelles)
    2. Sinon, analyser le thème (peut ne pas détecter les Custom Pixels)

    Vérifie :
    - GA4 : Événements avec paramètres complets (currency, value, items)
    - Meta : Événements avec paramètres complets (content_id, value, currency)
    - CAPI : Conversion API configuré (important pour iOS14+)
    """
    step = {
        "id": "tracking_quality",
        "name": "Qualité Tracking",
        "description": "Vérification qualité des données GA4/Meta",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    required_ga4_events = [
        "page_view",
        "view_item",
        "add_to_cart",
        "begin_checkout",
        "purchase",
    ]
    required_meta_events = [
        "PageView",
        "ViewContent",
        "AddToCart",
        "InitiateCheckout",
        "Purchase",
    ]

    try:
        # 1. Essayer de récupérer les résultats des audits précédents
        ga4_audit = _get_ga4_audit_results()
        meta_audit = _get_meta_audit_results()
        capi_audit = _get_capi_audit_results()

        # GA4: Utiliser les résultats de l'audit GA4 si disponibles
        ga4_events_present: list[str] = []
        ga4_source = "theme"  # Source des données

        if ga4_audit and ga4_audit.get("status") in ("success", "warning"):
            # Chercher le step events_coverage dans l'audit GA4
            for audit_step in ga4_audit.get("steps", []):
                if audit_step.get("id") == "events_coverage":
                    result = audit_step.get("result", {})
                    items = result.get("items", [])
                    # Extraire les événements trackés
                    ga4_events_present.extend(
                        item.get("name") for item in items if item.get("tracked")
                    )
                    ga4_source = "ga4_api"
                    break

        # Si pas de données GA4 audit, fallback sur l'analyse du thème
        if not ga4_events_present:
            from services.theme_analyzer import ThemeAnalyzerService

            theme_analyzer = ThemeAnalyzerService()
            theme_analysis = theme_analyzer.analyze_theme(force_refresh=True)
            ga4_events_present = [
                e for e in required_ga4_events if e in theme_analysis.ga4_events_found
            ]
            ga4_source = "theme"

        # Score GA4 Events Quality (max 30 points)
        ga4_matched = [e for e in required_ga4_events if e in ga4_events_present]
        ga4_score = (len(ga4_matched) / len(required_ga4_events)) * 30

        if len(ga4_matched) < len(required_ga4_events):
            missing = [e for e in required_ga4_events if e not in ga4_events_present]
            issues.append(
                {
                    "id": "ga4_events_missing",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": f"Événements GA4 manquants ({len(missing)})",
                    "description": f"Événements manquants : {', '.join(missing)}",
                    "action_available": True,
                    "action_label": "Ajouter événements GA4",
                    "action_id": "fix_ga4_events",
                    "action_status": "available",
                }
            )

        # Meta: Vérifier le statut du pixel
        meta_events_present: list[str] = []
        meta_source = "theme"
        meta_pixel_active = False

        if meta_audit and meta_audit.get("status") in ("success", "warning"):
            # Pixel actif = tous les événements standards sont envoyés via Shopify
            for audit_step in meta_audit.get("steps", []):
                if audit_step.get("id") == "pixel_status":
                    result = audit_step.get("result", {})
                    if result.get("active"):
                        meta_pixel_active = True
                        # Shopify Web Pixels envoie automatiquement les événements standards
                        meta_events_present = required_meta_events.copy()
                        meta_source = "meta_api"
                    break

        # Si pas de données Meta audit, fallback sur l'analyse du thème
        if not meta_events_present:
            from services.theme_analyzer import ThemeAnalyzerService

            theme_analyzer = ThemeAnalyzerService()
            theme_analysis = theme_analyzer.analyze_theme(force_refresh=False)
            meta_events_present = [
                e for e in required_meta_events if e in theme_analysis.meta_events_found
            ]
            meta_source = "theme"

        # Score Meta Events Quality (max 20 points)
        meta_matched = [e for e in required_meta_events if e in meta_events_present]
        meta_score = (len(meta_matched) / len(required_meta_events)) * 20

        if len(meta_matched) < len(required_meta_events):
            missing_meta = [e for e in required_meta_events if e not in meta_events_present]
            issues.append(
                {
                    "id": "meta_events_missing",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": f"Événements Meta manquants ({len(missing_meta)})",
                    "description": f"Événements manquants : {', '.join(missing_meta)}",
                    "action_available": True,
                    "action_label": "Ajouter événements Meta",
                    "action_id": "fix_meta_events",
                    "action_status": "available",
                }
            )

        score = int(ga4_score + meta_score)

        # Détection de CAPI (Meta Conversion API)
        has_capi = False
        if capi_audit:
            summary = capi_audit.get("summary", {})
            has_capi = summary.get("configured", False) and summary.get("connection_ok", False)

        if not has_capi:
            issues.append(
                {
                    "id": "meta_capi_missing",
                    "audit_type": "ads_readiness",
                    "severity": "medium",
                    "title": "Meta CAPI non configuré",
                    "description": "Conversion API server-side recommandé pour iOS14+",
                    "action_available": True,
                    "action_label": "Configurer CAPI",
                    "action_url": "https://developers.facebook.com/docs/marketing-api/conversions-api",
                    "action_status": "available",
                }
            )

        step["status"] = "success" if score >= 40 else "warning"

        # Message explicatif pour l'UI
        ga4_pct = (len(ga4_matched) / len(required_ga4_events)) * 100
        meta_pct = (len(meta_matched) / len(required_meta_events)) * 100

        if score >= 40:
            message = f"Tracking de qualité : GA4 {ga4_pct:.0f}%, Meta {meta_pct:.0f}%"
        elif score >= 20:
            message = (
                f"Tracking partiel : GA4 {ga4_pct:.0f}%, "
                f"Meta {meta_pct:.0f}% - événements manquants"
            )
        else:
            message = (
                f"Tracking insuffisant : GA4 {ga4_pct:.0f}%, "
                f"Meta {meta_pct:.0f}% - configuration requise"
            )

        step["result"] = {
            "score": score,
            "max_score": 50,
            "ga4_events_found": len(ga4_matched),
            "ga4_events_required": len(required_ga4_events),
            "ga4_source": ga4_source,
            "meta_events_found": len(meta_matched),
            "meta_events_required": len(required_meta_events),
            "meta_source": meta_source,
            "meta_pixel_active": meta_pixel_active,
            "has_capi": has_capi,
            "message": message,
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except ValueError as e:
        step["status"] = "error"
        step["error_message"] = f"Configuration error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_conversion_completeness() -> dict[str, Any]:
    """
    Step 2: Vérifier que les conversions sont complètes et cohérentes.

    Vérifie :
    - Match rate GA4 ↔ Shopify > 90%
    - Données de conversion avec currency, value, items
    - User ID propagé dans les événements
    """
    step = {
        "id": "conversion_completeness",
        "name": "Conversions Complètes",
        "description": "Validation données de conversion",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify_service = ShopifyAnalyticsService()

        # Récupérer les données Shopify
        funnel = shopify_service.fetch_conversion_funnel(days=30, force_refresh=True)

        shopify_orders = funnel.purchases
        has_checkout_data = funnel.checkout > 0

        # TODO: Implémenter vérification GA4 match rate via ga4_audit
        # Pour l'instant, score basé sur la présence de données de checkout
        if has_checkout_data and shopify_orders > 0:
            score = 15  # Données Shopify présentes
        elif shopify_orders > 0:
            score = 10  # Seulement des commandes
        else:
            score = 0  # Pas de données

        if shopify_orders == 0:
            issues.append(
                {
                    "id": "no_shopify_orders",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": "Aucune commande Shopify sur 30 jours",
                    "description": (
                        "Impossible de calculer les métriques de conversion "
                        "sans données historiques"
                    ),
                    "action_available": False,
                }
            )

        step["status"] = "success" if score >= 10 else "warning"
        step["result"] = {
            "score": score,
            "max_score": 20,
            "shopify_orders": shopify_orders,
            "has_checkout_data": has_checkout_data,
            "note": "GA4 match rate check à implémenter",
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except (ValueError, KeyError, AttributeError) as e:
        step["status"] = "error"
        step["error_message"] = f"Data error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_segmentation_data() -> dict[str, Any]:
    """
    Step 3: Vérifier que les données de segmentation sont disponibles.

    Vérifie :
    - Device (mobile, desktop, tablet)
    - Country / City
    - Source / Medium (organic, paid, direct, referral)
    """
    step = {
        "id": "segmentation_data",
        "name": "Données Segmentation",
        "description": "Device, country, source/medium disponibles",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        from services.config_service import ConfigService

        config = ConfigService()
        ga4_config = config.get_ga4_values()
        has_ga4 = bool(ga4_config.get("measurement_id"))

        # Vérifier si GA4 est configuré (nécessaire pour segmentation)
        if not has_ga4:
            issues.append(
                {
                    "id": "ga4_required_for_segmentation",
                    "audit_type": "ads_readiness",
                    "severity": "high",
                    "title": "GA4 requis pour segmentation",
                    "description": (
                        "GA4 doit être configuré pour accéder aux données de "
                        "device, country, et source/medium"
                    ),
                    "action_available": True,
                    "action_label": "Configurer GA4",
                    "action_id": "configure_ga4",
                    "action_status": "available",
                }
            )
            score = 0
            step["status"] = "error"
        else:
            # GA4 configuré - assume que les données de base sont collectées
            # Score basé sur la configuration GA4
            score = 12  # Données de base disponibles via GA4

            # Note: Pour un check plus précis, il faudrait:
            # 1. Vérifier les dimensions custom configurées
            # 2. Checker les rapports GA4 pour confirm data collection
            # 3. Valider la qualité des données (pas de null/unknown)

            step["status"] = "success"

        step["result"] = {
            "score": score,
            "max_score": 15,
            "has_ga4": has_ga4,
            "note": "Segmentation basique disponible via GA4 si configuré",
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except (ValueError, KeyError) as e:
        step["status"] = "error"
        step["error_message"] = f"Config error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_attribution_readiness() -> dict[str, Any]:
    """
    Step 4: Vérifier que l'attribution multi-touch est possible.

    Vérifie :
    - UTM parameters tracking
    - Source / Medium cohérents
    - User journey tracking possible
    """
    step = {
        "id": "attribution_readiness",
        "name": "Attribution Multi-Touch",
        "description": "UTM tracking et user journey",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        from services.config_service import ConfigService
        from services.theme_analyzer import ThemeAnalyzerService

        config = ConfigService()
        theme_analyzer = ThemeAnalyzerService()

        # Vérifier GA4 pour UTM tracking
        ga4_config = config.get_ga4_values()
        has_ga4 = bool(ga4_config.get("measurement_id"))

        # Analyser le thème pour UTM/tracking setup
        theme_analysis = theme_analyzer.analyze_theme(force_refresh=False)
        has_gtm = theme_analysis.gtm_configured

        # Score basé sur les outils d'attribution disponibles
        if has_ga4 and has_gtm:
            score = 10  # Setup optimal: GA4 + GTM pour attribution complète
            step["status"] = "success"
        elif has_ga4:
            score = 7  # GA4 seul - attribution basique possible
            step["status"] = "success"
            issues.append(
                {
                    "id": "gtm_recommended_for_attribution",
                    "audit_type": "ads_readiness",
                    "severity": "medium",
                    "title": ("Google Tag Manager recommandé - " "Attribution multi-touch avancée"),
                    "description": (
                        "GTM optimise vos campagnes Ads grâce à : attribution "
                        "multi-touch avancée, suivi UTM précis, gestion "
                        "centralisée des pixels (Meta, TikTok, etc.), "
                        "A/B testing facilité, et meilleur tracking des conversions."
                    ),
                    "details": [
                        "📋 GUIDE D'INSTALLATION (5 minutes)",
                        "",
                        "ÉTAPE 1 : Créer un compte GTM",
                        "→ Allez sur tagmanager.google.com",
                        "→ Créez un conteneur de type 'Web'",
                        "→ Notez votre Container ID (ex: GTM-ABC123)",
                        "",
                        "ÉTAPE 2 : Installer dans Shopify",
                        "→ Online Store > Themes > Actions > Edit Code",
                        "→ Fichier : layout/theme.liquid",
                        "",
                        "📝 Code à ajouter dans <head> (après l'ouverture) :",
                        "<!-- Google Tag Manager -->",
                        ("<script>(function(w,d,s,l,i){w[l]=w[l]||[];" "w[l].push({'gtm.start':"),
                        (
                            "new Date().getTime(),event:'gtm.js'});"
                            "var f=d.getElementsByTagName(s)[0],"
                        ),
                        (
                            "j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';"
                            "j.async=true;j.src="
                        ),
                        (
                            "'https://www.googletagmanager.com/gtm.js?id='+i+dl;"
                            "f.parentNode.insertBefore(j,f);"
                        ),
                        ("})(window,document,'script','dataLayer'," "'GTM-XXXXXXX');</script>"),
                        "<!-- End Google Tag Manager -->",
                        "",
                        ("📝 Code à ajouter après <body> " "(juste après l'ouverture) :"),
                        "<!-- Google Tag Manager (noscript) -->",
                        (
                            '<noscript><iframe src="https://www.'
                            'googletagmanager.com/ns.html?id=GTM-XXXXXXX"'
                        ),
                        (
                            'height="0" width="0" style="display:none;'
                            'visibility:hidden"></iframe></noscript>'
                        ),
                        "<!-- End Google Tag Manager (noscript) -->",
                        "",
                        "⚠️ Remplacez GTM-XXXXXXX par votre vrai Container ID",
                        "",
                        "ÉTAPE 3 : Vérifier l'installation",
                        ("→ Installez l'extension Chrome " "'Tag Assistant Legacy'"),
                        ("→ Visitez votre boutique et vérifiez que " "GTM est détecté"),
                        ("→ Ou relancez cet audit pour confirmer " "la détection"),
                        "",
                        "💡 BONUS : Configurer les tags dans GTM",
                        "→ Ajoutez GA4 et Meta Pixel comme tags",
                        ("→ Configurez les triggers pour les " "événements e-commerce"),
                        "→ Testez avec le mode Preview de GTM",
                        "",
                        "🎯 IMPACT SUR VOS CAMPAGNES ADS :",
                        ("→ Meilleure attribution : identifiez les " "canaux qui convertissent"),
                        ("→ Optimisation des enchères : données " "précises pour l'algorithme"),
                        ("→ Remarketing avancé : segments " "d'audience basés sur le comportement"),
                        ("→ ROI mesurable : tracking complet du " "parcours client"),
                    ],
                    "action_available": True,
                    "action_label": "Créer compte GTM",
                    "action_url": "https://tagmanager.google.com",
                    "action_status": "available",
                }
            )
        else:
            score = 0
            step["status"] = "error"
            issues.append(
                {
                    "id": "ga4_required_for_attribution",
                    "audit_type": "ads_readiness",
                    "severity": "critical",
                    "title": "GA4 requis pour attribution",
                    "description": (
                        "Sans GA4, impossible de tracker les UTM et faire "
                        "de l'attribution multi-touch"
                    ),
                    "action_available": True,
                    "action_label": "Configurer GA4",
                    "action_id": "configure_ga4",
                    "action_status": "available",
                }
            )

        # Message explicatif pour l'UI
        if has_ga4 and has_gtm:
            message = "Attribution complète : GA4 + GTM configurés"
        elif has_ga4:
            message = "Attribution basique : GA4 configuré, GTM recommandé pour améliorer"
        else:
            message = "Attribution impossible : GA4 requis"

        step["result"] = {
            "score": score,
            "max_score": 10,
            "has_ga4": has_ga4,
            "has_gtm": has_gtm,
            "attribution_level": (
                "advanced" if has_gtm and has_ga4 else ("basic" if has_ga4 else "none")
            ),
            "message": message,
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except (ValueError, KeyError, AttributeError) as e:
        step["status"] = "error"
        step["error_message"] = f"Error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def _check_ads_metrics() -> dict[str, Any]:
    """
    Step 5: Vérifier que les métriques Ads sont calculables.

    Vérifie :
    - ROAS calculable (revenue / ad spend)
    - CPA calculable (cost / conversions)
    - LTV estimable
    """
    step = {
        "id": "ads_metrics_calculable",
        "name": "Métriques Ads",
        "description": "ROAS, CPA, LTV calculables",
        "status": "running",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": None,
        "duration_ms": None,
        "result": None,
        "error_message": None,
    }
    start_time = datetime.now(tz=UTC)
    issues: list[dict[str, Any]] = []
    score = 0

    try:
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify_service = ShopifyAnalyticsService()

        # Vérifier données Shopify pour calcul métriques
        funnel = shopify_service.fetch_conversion_funnel(days=30, force_refresh=False)

        has_orders = funnel.purchases > 0
        has_checkout = funnel.checkout > 0

        # Score basé sur la disponibilité des données de base
        if has_orders and has_checkout:
            score = 5  # Données de base OK pour calculer CPA, ROAS
            step["status"] = "success"

            # Note: Pour ROAS/CPA réels, il faut:
            # 1. Connecter Meta/Google Ads API pour ad spend
            # 2. Récupérer les coûts par campagne
            # 3. Matcher conversions avec sources

        elif has_orders:
            score = 3  # Seulement conversions, pas de funnel complet
            step["status"] = "warning"
            issues.append(
                {
                    "id": "incomplete_funnel_data",
                    "audit_type": "ads_readiness",
                    "severity": "medium",
                    "title": "Données de funnel incomplètes",
                    "description": ("Checkouts manquants - calcul CPA limité"),
                    "action_available": False,
                }
            )
        else:
            score = 0
            step["status"] = "error"
            issues.append(
                {
                    "id": "no_conversion_data",
                    "audit_type": "ads_readiness",
                    "severity": "critical",
                    "title": "Aucune donnée de conversion",
                    "description": (
                        "Impossible de calculer ROAS/CPA sans commandes. "
                        "Attendez d'avoir des données historiques."
                    ),
                    "action_available": False,
                }
            )

        step["result"] = {
            "score": score,
            "max_score": 5,
            "has_orders": has_orders,
            "has_checkout": has_checkout,
            "orders_30d": funnel.purchases,
            "note": "Ad spend data à connecter via Meta/Google Ads API pour ROAS réel",
        }

    except ImportError as e:
        step["status"] = "error"
        step["error_message"] = f"Service import failed: {e}"
        score = 0
    except (ValueError, KeyError, AttributeError) as e:
        step["status"] = "error"
        step["error_message"] = f"Data error: {e}"
        score = 0

    step["completed_at"] = datetime.now(tz=UTC).isoformat()
    step["duration_ms"] = int((datetime.now(tz=UTC) - start_time).total_seconds() * 1000)

    return {"step": step, "issues": issues, "score": score}


def create_ads_readiness_audit_function() -> inngest.Function | None:
    """Create the Ads Readiness audit Inngest function."""
    if inngest_client is None:
        return None

    @inngest_client.create_function(
        fn_id="ads-readiness-audit",
        trigger=inngest.TriggerEvent(event="audit/ads_readiness.requested"),
        retries=1,
    )
    async def ads_readiness_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Run Ads Readiness audit with step-by-step progress."""
        global _current_session_id  # noqa: PLW0603
        run_id = ctx.event.data.get("run_id", ctx.run_id)
        session_id = ctx.event.data.get("session_id", run_id)
        pb_record_id = ctx.event.data.get("pocketbase_record_id")

        # Set session ID for cross-audit lookups
        _current_session_id = session_id

        result = init_audit_result(run_id, AUDIT_TYPE, "metrics")
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        total_score = 0
        max_total_score = 100

        # Step 1: Tracking Quality
        step1_result = await ctx.step.run("check-tracking-quality", _check_tracking_quality)
        result["steps"].append(step1_result["step"])
        result["issues"].extend(step1_result["issues"])
        total_score += step1_result["score"]
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 2: Conversion Completeness
        step2_result = await ctx.step.run(
            "check-conversion-completeness", _check_conversion_completeness
        )
        result["steps"].append(step2_result["step"])
        result["issues"].extend(step2_result["issues"])
        total_score += step2_result["score"]
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 3: Segmentation Data
        step3_result = await ctx.step.run("check-segmentation-data", _check_segmentation_data)
        result["steps"].append(step3_result["step"])
        result["issues"].extend(step3_result["issues"])
        total_score += step3_result["score"]
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 4: Attribution Readiness
        step4_result = await ctx.step.run(
            "check-attribution-readiness", _check_attribution_readiness
        )
        result["steps"].append(step4_result["step"])
        result["issues"].extend(step4_result["issues"])
        total_score += step4_result["score"]
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Step 5: Ads Metrics
        step5_result = await ctx.step.run("check-ads-metrics", _check_ads_metrics)
        result["steps"].append(step5_result["step"])
        result["issues"].extend(step5_result["issues"])
        total_score += step5_result["score"]
        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)

        # Finalize
        has_errors = any(s.get("status") == "error" for s in result["steps"])
        has_warnings = any(s.get("status") == "warning" for s in result["steps"])
        result["status"] = "error" if has_errors else ("warning" if has_warnings else "success")
        result["completed_at"] = datetime.now(tz=UTC).isoformat()

        # Calculate readiness level
        if total_score >= 80:
            readiness_level = "excellent"
        elif total_score >= 60:
            readiness_level = "good"
        elif total_score >= 40:
            readiness_level = "fair"
        else:
            readiness_level = "poor"

        result["summary"] = {
            "total_score": total_score,
            "max_score": max_total_score,
            "percentage": round((total_score / max_total_score) * 100, 1),
            "readiness_level": readiness_level,
            "critical_issues": len([i for i in result["issues"] if i["severity"] == "critical"]),
            "high_issues": len([i for i in result["issues"] if i["severity"] == "high"]),
            "medium_issues": len([i for i in result["issues"] if i["severity"] == "medium"]),
        }

        save_audit_progress(result, AUDIT_TYPE, session_id, pb_record_id)
        return result

    return ads_readiness_audit


ads_readiness_audit_function = create_ads_readiness_audit_function()
