"""
Audit Orchestrator - Manage multiple audit types with persistence
=================================================================
Coordinates different audit types (GA4, Meta, GMC, Theme) and persists results
to allow user-triggered corrections.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from pathlib import Path
from typing import TYPE_CHECKING, Any
from uuid import uuid4


if TYPE_CHECKING:
    from services.audit_service import AuditService
    from services.config_service import ConfigService
    from services.theme_analyzer import ThemeAnalyzerService

# Constants
COVERAGE_RATE_HIGH = 90
COVERAGE_RATE_MEDIUM = 70
MAX_DETAILS_ITEMS = 10
MS_PER_SECOND = 1000


class AuditType(Enum):
    """Available audit types."""

    ONBOARDING = "onboarding"  # Check all service configurations
    GA4_TRACKING = "ga4_tracking"
    META_PIXEL = "meta_pixel"
    MERCHANT_CENTER = "merchant_center"
    SEARCH_CONSOLE = "search_console"
    THEME_CODE = "theme_code"
    ADS_READINESS = "ads_readiness"  # Global Ads readiness score
    CAPI = "capi"  # Meta Conversion API audit
    CUSTOMER_DATA = "customer_data"  # Customer data readiness for Ads
    CART_RECOVERY = "cart_recovery"  # Cart abandonment analysis for retargeting
    BOT_ACCESS = "bot_access"  # Check if Ads crawlers can access the site


class AuditStepStatus(Enum):
    """Status of an audit step (like GitHub Actions)."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
    COMPLETED = "completed"  # Alias for workflows using "completed" instead of "success"
    WARNING = "warning"
    ERROR = "error"
    SKIPPED = "skipped"


class ActionStatus(Enum):
    """Status of a correction action."""

    AVAILABLE = "available"  # Can be triggered
    RUNNING = "running"  # Currently executing
    COMPLETED = "completed"  # Successfully applied
    FAILED = "failed"  # Failed to apply
    NOT_AVAILABLE = "not_available"  # Cannot be auto-fixed


@dataclass
class AuditStep:
    """A single step in an audit (for pipeline display)."""

    id: str
    name: str
    description: str
    status: AuditStepStatus = AuditStepStatus.PENDING
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None
    result: dict[str, Any] | None = None
    error_message: str | None = None


@dataclass
class AuditIssue:
    """An issue found during audit with possible action."""

    id: str
    audit_type: AuditType
    severity: str  # critical, high, medium, low
    title: str
    description: str
    details: list[str] | None = None
    action_available: bool = False
    action_id: str | None = None
    action_label: str | None = None
    action_status: ActionStatus = ActionStatus.NOT_AVAILABLE
    action_url: str | None = None  # External URL for link-type actions


@dataclass
class AuditResult:
    """Complete result of an audit run."""

    id: str
    audit_type: AuditType
    status: AuditStepStatus
    steps: list[AuditStep] = field(default_factory=list)
    issues: list[AuditIssue] = field(default_factory=list)
    summary: dict[str, Any] = field(default_factory=dict)
    started_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())
    completed_at: str | None = None
    raw_data: dict[str, Any] | None = None
    execution_mode: str = "sync"  # "sync" or "inngest" - indicates how audit was executed


@dataclass
class AuditSession:
    """A complete audit session containing multiple audit types."""

    id: str
    audits: dict[str, AuditResult] = field(default_factory=dict)  # audit_type -> result
    created_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())


class AuditOrchestrator:
    """Orchestrates multiple audit types and persists results."""

    def __init__(
        self,
        ga4_audit_service: AuditService | None = None,
        theme_analyzer: ThemeAnalyzerService | None = None,
        config_service: ConfigService | None = None,
    ) -> None:
        """Initialize the orchestrator with audit services."""
        from services.paths import get_data_dir

        self.ga4_audit = ga4_audit_service
        self.theme_analyzer = theme_analyzer
        self._config_service = config_service
        self._storage_dir = get_data_dir() / "audits"
        self._storage_dir.mkdir(parents=True, exist_ok=True)
        self._current_session: AuditSession | None = None

    def _clear_cache_for_audit(self, audit_type: AuditType) -> None:
        """Clear only the relevant caches for a specific audit type.

        Each audit clears caches for the services it depends on:
        - GA4_TRACKING: GA4 service + Shopify (for comparison)
        - THEME_CODE: Theme analyzer
        - MERCHANT_CENTER: Shopify products
        - META_PIXEL: Theme analyzer
        - SEARCH_CONSOLE: Shopify products
        """
        # Map audit types to their required services
        audit_services: dict[AuditType, list[str]] = {
            AuditType.GA4_TRACKING: ["ga4_audit", "shopify"],
            AuditType.THEME_CODE: ["theme_analyzer"],
            AuditType.MERCHANT_CENTER: ["shopify"],
            AuditType.META_PIXEL: ["theme_analyzer"],
            AuditType.SEARCH_CONSOLE: ["shopify"],
        }

        services_to_clear = audit_services.get(audit_type, [])

        for service_name in services_to_clear:
            if service_name == "ga4_audit" and self.ga4_audit is not None:
                if hasattr(self.ga4_audit, "clear_cache"):
                    self.ga4_audit.clear_cache()

            elif service_name == "theme_analyzer" and self.theme_analyzer is not None:
                if hasattr(self.theme_analyzer, "clear_cache"):
                    self.theme_analyzer.clear_cache()

            elif service_name == "shopify":
                from services.shopify_analytics import clear_shopify_cache

                clear_shopify_cache()

    def _get_ga4_measurement_id(self) -> str:
        """Get GA4 measurement ID from ConfigService (SQLite)."""
        if self._config_service is None:
            # Lazy import to avoid circular imports
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        ga4_config = self._config_service.get_ga4_values()
        return ga4_config.get("measurement_id", "")

    def _get_session_file(self, session_id: str) -> Path:
        """Get the file path for a session."""
        return self._storage_dir / f"session_{session_id}.json"

    def _get_latest_session_file(self) -> Path:
        """Get the latest session file."""
        return self._storage_dir / "latest_session.json"

    def _save_session(self, session: AuditSession) -> None:
        """Save session to disk."""
        session.updated_at = datetime.now(tz=UTC).isoformat()
        data = self._session_to_dict(session)

        # Save to specific file
        with self._get_session_file(session.id).open("w") as f:
            json.dump(data, f, indent=2)

        # Also save as latest
        with self._get_latest_session_file().open("w") as f:
            json.dump(data, f, indent=2)

    def _load_session(self, session_id: str | None = None) -> AuditSession | None:
        """Load a session from disk."""
        if session_id:
            file_path = self._get_session_file(session_id)
        else:
            file_path = self._get_latest_session_file()

        if not file_path.exists():
            return None

        try:
            with file_path.open() as f:
                data = json.load(f)
                return self._dict_to_session(data)
        except (json.JSONDecodeError, OSError):
            return None

    def get_latest_session(self) -> AuditSession | None:
        """Get the most recent audit session."""
        return self._load_session()

    def cleanup_stale_running_audits(self) -> int:
        """Clean up audits stuck in 'running' status from previous runs.

        Called on backend startup to prevent stale running states after Docker restart.
        Returns the number of audits cleaned up.
        """
        session = self._load_session()
        if session is None:
            return 0

        cleaned_count = 0
        for audit_data in session.audits.values():
            if audit_data.status in (AuditStepStatus.RUNNING, AuditStepStatus.PENDING):
                audit_data.status = AuditStepStatus.ERROR
                audit_data.error_message = "Audit interrompu par redémarrage du serveur"
                audit_data.completed_at = datetime.now(tz=UTC).isoformat()
                cleaned_count += 1

        if cleaned_count > 0:
            self._save_session(session)

        return cleaned_count

    def clear_all_sessions(self) -> dict[str, Any]:
        """Clear all audit sessions and caches.

        Returns a dict with count of files deleted.
        """
        deleted_count = 0

        # Clear the latest session file
        latest_file = self._get_latest_session_file()
        if latest_file.exists():
            latest_file.unlink()
            deleted_count += 1

        # Clear all session files
        for session_file in self._storage_dir.glob("session_*.json"):
            session_file.unlink()
            deleted_count += 1

        # Reset in-memory state
        self._current_session = None

        # Clear all service caches
        if self.ga4_audit is not None and hasattr(self.ga4_audit, "clear_cache"):
            self.ga4_audit.clear_cache()

        if self.theme_analyzer is not None and hasattr(self.theme_analyzer, "clear_cache"):
            self.theme_analyzer.clear_cache()

        # Clear Shopify cache
        from services.shopify_analytics import clear_shopify_cache

        clear_shopify_cache()

        # Clear PocketBase audit_runs records
        from services.pocketbase_service import get_pocketbase_service

        pb_service = get_pocketbase_service()
        deleted_pb_records = pb_service.delete_all_audit_runs()

        return {
            "success": True,
            "deleted_sessions": deleted_count,
            "deleted_pocketbase_records": deleted_pb_records,
            "message": f"Supprimé {deleted_count} session(s), {deleted_pb_records} audit(s) PocketBase et tous les caches",
        }

    def _get_meta_config(self) -> dict[str, str]:
        """Get Meta configuration from ConfigService."""
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()
        return self._config_service.get_meta_values()

    def _get_merchant_center_config(self) -> dict[str, str]:
        """Get Google Merchant Center configuration from ConfigService."""
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()
        return self._config_service.get_merchant_center_values()

    def _get_search_console_config(self) -> dict[str, str]:
        """Get Google Search Console configuration from ConfigService."""
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()
        return self._config_service.get_search_console_values()

    def get_available_audits(self) -> list[dict[str, Any]]:
        """Get list of available audit types with their status."""
        latest = self.get_latest_session()

        # Check if GA4 is configured in Settings
        ga4_measurement_id = self._get_ga4_measurement_id()
        ga4_configured = bool(ga4_measurement_id)

        # Check if Meta is configured
        meta_config = self._get_meta_config()
        meta_configured = bool(meta_config.get("pixel_id")) and bool(
            meta_config.get("access_token")
        )

        # Check if Merchant Center is configured
        gmc_config = self._get_merchant_center_config()
        gmc_configured = bool(gmc_config.get("merchant_id"))

        # Check if Search Console is configured
        gsc_config = self._get_search_console_config()
        gsc_configured = bool(gsc_config.get("property_url"))

        # Determine availability and descriptions based on config
        if ga4_configured:
            ga4_description = (
                "Vérifie la couverture du tracking GA4 " "(événements, collections, produits)"
            )
            theme_description = (
                "Analyse le code du thème Shopify " "pour détecter les erreurs de tracking"
            )
        else:
            ga4_description = (
                "⚠️ GA4 non configuré - Allez dans Settings > GA4 "
                "pour configurer votre ID de mesure"
            )
            theme_description = (
                "⚠️ GA4 non configuré - Allez dans Settings > GA4 "
                "pour configurer votre ID de mesure"
            )

        # Meta description based on config
        if meta_configured:
            meta_description = (
                "Vérifie la configuration du Meta Pixel, "
                "les événements et la synchronisation catalogue"
            )
        else:
            meta_description = (
                "⚠️ Meta non configuré - Allez dans Settings > Meta "
                "pour configurer votre Pixel ID et Access Token"
            )

        # GMC description based on config
        if gmc_configured:
            gmc_description = (
                "Vérifie les produits dans Google Shopping, "
                "leur statut et les problèmes de données"
            )
        else:
            gmc_description = (
                "⚠️ Merchant Center non configuré - Allez dans Settings > Merchant Center "
                "pour configurer votre Merchant ID"
            )

        # GSC description based on config
        if gsc_configured:
            gsc_description = (
                "Vérifie l'indexation des pages, " "les erreurs d'exploration et les sitemaps"
            )
        else:
            gsc_description = (
                "Analyse SEO basique (robots.txt, sitemap, méta tags). "
                "Configurez GSC pour des données d'indexation complètes."
            )

        audits = [
            {
                "type": AuditType.ONBOARDING.value,
                "name": "🚀 Diagnostic Initial",
                "description": (
                    "Vérifiez que tous vos services Ads et SEO sont correctement "
                    "configurés dans Shopify avant de lancer les audits détaillés"
                ),
                "icon": "rocket",
                "available": True,  # Always available
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
                "is_primary": True,  # Mark as primary audit
            },
            {
                "type": AuditType.THEME_CODE.value,
                "name": "Code Tracking Thème",
                "description": theme_description,
                "icon": "code",
                "available": self.theme_analyzer is not None and ga4_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.GA4_TRACKING.value,
                "name": "GA4 Tracking",
                "description": ga4_description,
                "icon": "chart-bar",
                "available": self.ga4_audit is not None and ga4_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.META_PIXEL.value,
                "name": "Meta Pixel",
                "description": meta_description,
                "icon": "facebook",
                "available": meta_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.CAPI.value,
                "name": "Meta CAPI",
                "description": (
                    "Vérifie la configuration de Meta Conversions API "
                    "(server-side tracking, events quality, deduplication)"
                ),
                "icon": "server",
                "available": meta_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.CUSTOMER_DATA.value,
                "name": "Données Clients",
                "description": (
                    "Analyse la qualité des données clients pour les campagnes Ads "
                    "(email opt-in, SMS, numéros de téléphone)"
                ),
                "icon": "users",
                "available": True,  # Always available (uses Shopify data)
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.CART_RECOVERY.value,
                "name": "Récupération Panier",
                "description": (
                    "Évalue le potentiel de récupération des paniers abandonnés "
                    "(volume, capture email, taux de récupération)"
                ),
                "icon": "shopping-bag",
                "available": True,  # Always available (uses Shopify data)
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.ADS_READINESS.value,
                "name": "Prêt pour Ads",
                "description": (
                    "Score /100 évaluant la capacité à lancer des campagnes Ads "
                    "(tracking, conversions, segmentation, attribution, métriques)"
                ),
                "icon": "target",
                "available": ga4_configured and meta_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.MERCHANT_CENTER.value,
                "name": "Google Merchant Center",
                "description": gmc_description,
                "icon": "shopping-cart",
                "available": gmc_configured,
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.SEARCH_CONSOLE.value,
                "name": "SEO & Search Console",
                "description": gsc_description,
                "icon": "search",
                "available": True,  # Always available - basic SEO without GSC, full with GSC
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.BOT_ACCESS.value,
                "name": "Accès Crawlers Ads",
                "description": (
                    "Vérifie que Googlebot et Facebookbot peuvent accéder au site "
                    "(robots.txt, WAF, Cloudflare, CAPTCHA)"
                ),
                "icon": "shield-check",
                "available": True,  # Always available
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
        ]

        # Update with latest session data
        if latest:
            for audit in audits:
                audit_type = audit["type"]
                if audit_type in latest.audits:
                    result = latest.audits[audit_type]
                    audit["last_run"] = result.completed_at or result.started_at
                    audit["last_status"] = result.status.value
                    audit["issues_count"] = len(result.issues)

        return audits

    def start_audit(self, audit_type: AuditType) -> AuditResult:
        """Start a specific audit type and return initial result with steps."""
        # Clear only the relevant caches for this audit type
        self._clear_cache_for_audit(audit_type)

        # Create or get current session
        if self._current_session is None:
            self._current_session = AuditSession(id=str(uuid4())[:8])

        result = AuditResult(
            id=str(uuid4())[:8],
            audit_type=audit_type,
            status=AuditStepStatus.RUNNING,
        )

        # Define steps based on audit type
        if audit_type == AuditType.GA4_TRACKING:
            result.steps = self._get_ga4_audit_steps()
        elif audit_type == AuditType.THEME_CODE:
            result.steps = self._get_theme_audit_steps()
        elif audit_type == AuditType.META_PIXEL:
            result.steps = self._get_meta_audit_steps()
        elif audit_type == AuditType.MERCHANT_CENTER:
            result.steps = self._get_gmc_audit_steps()
        elif audit_type == AuditType.SEARCH_CONSOLE:
            result.steps = self._get_gsc_audit_steps()

        self._current_session.audits[audit_type.value] = result
        self._save_session(self._current_session)

        return result

    def _get_ga4_audit_steps(self) -> list[AuditStep]:
        """Define steps for GA4 tracking audit."""
        return [
            AuditStep(
                id="ga4_connection",
                name="Connexion GA4",
                description="Vérification de la connexion à l'API GA4",
            ),
            AuditStep(
                id="collections_coverage",
                name="Couverture Collections",
                description="Vérification du tracking sur les pages collection",
            ),
            AuditStep(
                id="products_coverage",
                name="Couverture Produits",
                description="Vérification du tracking sur les fiches produit",
            ),
            AuditStep(
                id="events_coverage",
                name="Événements E-commerce",
                description="Vérification des événements GA4 (view_item, add_to_cart, purchase...)",
            ),
            AuditStep(
                id="transactions_match",
                name="Match Transactions",
                description="Comparaison des transactions GA4 vs Shopify",
            ),
        ]

    def _get_theme_audit_steps(self) -> list[AuditStep]:
        """Define steps for theme code audit."""
        return [
            AuditStep(
                id="theme_access",
                name="Accès Thème",
                description="Récupération des fichiers du thème actif",
            ),
            AuditStep(
                id="ga4_code",
                name="Code GA4",
                description="Analyse du code de tracking GA4 dans le thème",
            ),
            AuditStep(
                id="meta_code",
                name="Code Meta Pixel",
                description="Analyse du code Meta Pixel dans le thème",
            ),
            AuditStep(
                id="gtm_code",
                name="Google Tag Manager",
                description="Détection de GTM et analyse du dataLayer",
            ),
            AuditStep(
                id="issues_detection",
                name="Détection Erreurs",
                description="Identification des erreurs et corrections possibles",
            ),
        ]

    def _get_meta_audit_steps(self) -> list[AuditStep]:
        """Define steps for Meta Pixel audit."""
        return [
            AuditStep(
                id="meta_connection",
                name="Connexion Meta",
                description="Vérification de la connexion à l'API Meta",
            ),
            AuditStep(
                id="pixel_config",
                name="Configuration Pixel",
                description="Vérification de la configuration du pixel",
            ),
            AuditStep(
                id="events_check",
                name="Événements Meta",
                description="Vérification des événements de conversion",
            ),
            AuditStep(
                id="pixel_status",
                name="Statut Pixel Meta",
                description="Vérification du pixel sur Meta (activité, état)",
            ),
        ]

    def _get_gmc_audit_steps(self) -> list[AuditStep]:
        """Define steps for Merchant Center audit."""
        return [
            AuditStep(
                id="gmc_connection",
                name="Connexion GMC",
                description="Vérification de la connexion à Merchant Center",
            ),
            AuditStep(
                id="products_status",
                name="Statut Produits",
                description="Vérification des produits approuvés/rejetés",
            ),
            AuditStep(
                id="feed_sync",
                name="Synchronisation Feed",
                description="Vérification de la synchronisation avec Shopify",
            ),
            AuditStep(
                id="issues_check",
                name="Problèmes Produits",
                description="Détection des erreurs sur les produits",
            ),
        ]

    def _get_gsc_audit_steps(self) -> list[AuditStep]:
        """Define steps for Search Console audit."""
        return [
            AuditStep(
                id="gsc_connection",
                name="Connexion GSC",
                description="Vérification de la connexion à Search Console",
            ),
            AuditStep(
                id="indexation",
                name="Couverture Indexation",
                description="Vérification des pages indexées vs pages Shopify",
            ),
            AuditStep(
                id="errors",
                name="Erreurs Crawl",
                description="Détection des erreurs d'exploration",
            ),
            AuditStep(
                id="sitemaps",
                name="Sitemaps",
                description="Vérification des sitemaps soumis",
            ),
        ]

    def execute_action(self, audit_type: str, action_id: str) -> dict[str, Any]:
        """Execute a correction action on an audit issue.

        This is ONLY triggered by user action (button click).
        """
        # Validate session and find issue
        validation = self._validate_action_request(audit_type, action_id)
        if validation.get("error"):
            return validation

        issue = validation["issue"]
        session = validation["session"]

        # Mark as running
        issue.action_status = ActionStatus.RUNNING
        self._current_session = session
        self._save_current_session()

        # Execute and return result
        return self._execute_action_impl(issue, action_id)

    def _validate_action_request(self, audit_type: str, action_id: str) -> dict[str, Any]:
        """Validate action request and return issue if valid."""
        session = self.get_latest_session()
        if not session or audit_type not in session.audits:
            return {
                "success": False,
                "error": "Aucun audit trouvé - lancez d'abord un audit",
            }

        audit_result = session.audits[audit_type]

        # Find the issue with this action
        issue = None
        for i in audit_result.issues:
            if i.action_id == action_id:
                issue = i
                break

        if not issue:
            return {
                "success": False,
                "error": f"Action '{action_id}' non trouvée",
            }

        # Allow retry if action failed or is available
        if issue.action_status not in (ActionStatus.AVAILABLE, ActionStatus.FAILED):
            return {
                "success": False,
                "error": f"Action non disponible (status: {issue.action_status.value})",
            }

        return {"issue": issue, "session": session}

    def _execute_action_impl(self, issue: AuditIssue, action_id: str) -> dict[str, Any]:
        """Execute the actual action implementation."""
        try:
            if action_id == "add_ga4_base":
                return self._execute_add_ga4_base(issue)

            if action_id.startswith("fix_theme_"):
                return self._execute_theme_fix(issue, action_id)

            if action_id.startswith("fix_meta_event_"):
                return self._execute_fix_meta_event(issue, action_id)

            if action_id.startswith("fix_event_"):
                event_name = action_id.replace("fix_event_", "")
                issue.action_status = ActionStatus.FAILED
                self._save_current_session()
                error_msg = (
                    f"Correction automatique de l'événement "
                    f"'{event_name}' non encore implémentée"
                )
                return {"success": False, "error": error_msg}

            if action_id == "publish_to_google":
                return self._execute_publish_to_google(issue)

            if action_id == "publish_eligible_to_google":
                return self._execute_publish_eligible_to_google(issue)

            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "Échec de la correction"}

        except Exception as e:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": str(e)}

    def _execute_add_ga4_base(self, issue: AuditIssue) -> dict[str, Any]:
        """Add GA4 tracking via a separate snippet (safer approach).

        Creates snippets/isciacus-ga4.liquid and adds a render tag to theme.liquid.
        This is safer because:
        - The GA4 code is in a separate file (easy to remove)
        - Only one line is added to theme.liquid
        - If something breaks, just delete the snippet
        """
        if not self.theme_analyzer:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "Theme Analyzer non disponible"}

        # Check write_themes permission first
        from services.permissions_checker import PermissionsCheckerService

        permissions_checker = PermissionsCheckerService(self._config_service)
        has_permission, error_msg = permissions_checker.has_write_themes_permission()

        if not has_permission:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": error_msg
                or (
                    "Permission write_themes manquante. "
                    "Allez dans Shopify > Apps > Votre app > Configuration API > "
                    "Ajoutez le scope 'write_themes' et réinstallez l'app."
                ),
            }

        ga4_id = self._get_ga4_measurement_id()

        if not ga4_id:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": (
                    "GA4_MEASUREMENT_ID non configuré dans Settings. "
                    "Allez dans Settings > GA4 pour configurer votre ID de mesure, "
                    "ou configurez GA4 dans Shopify > Online Store > Preferences."
                ),
            }

        theme_id = self.theme_analyzer._get_active_theme_id()
        if not theme_id:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "Impossible d'accéder au thème actif"}

        # Step 1: Create the GA4 snippet file
        snippet_content = f"""{{%- comment -%}}
  GA4 Tracking - Added by Isciacus Monitoring
  To remove: delete this file and remove the render tag from theme.liquid
{{%- endcomment -%}}

<script async src="https://www.googletagmanager.com/gtag/js?id={ga4_id}"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){{dataLayer.push(arguments);}}
  gtag('js', new Date());
  gtag('config', '{ga4_id}');
</script>
"""

        snippet_key = "snippets/isciacus-ga4.liquid"
        snippet_created = self.theme_analyzer._update_theme_asset(
            theme_id, snippet_key, snippet_content
        )

        if not snippet_created:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "Impossible de créer le snippet GA4"}

        # Step 2: Add render tag to theme.liquid (if not already present)
        theme_liquid = self.theme_analyzer._get_theme_asset(theme_id, "layout/theme.liquid")
        if not theme_liquid:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "Impossible de lire theme.liquid"}

        render_tag = "{% render 'isciacus-ga4' %}"

        # Check if already included
        if "isciacus-ga4" in theme_liquid or ga4_id in theme_liquid:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": f"GA4 ({ga4_id}) - snippet créé, déjà inclus dans le thème",
            }

        # Insert render tag after content_for_header or before </head>
        if "{{ content_for_header }}" in theme_liquid:
            new_content = theme_liquid.replace(
                "{{ content_for_header }}",
                f"{{{{ content_for_header }}}}\n  {render_tag}",
            )
        elif "</head>" in theme_liquid:
            new_content = theme_liquid.replace(
                "</head>",
                f"  {render_tag}\n</head>",
            )
        else:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": "Structure theme.liquid non reconnue",
            }

        # Update theme.liquid with just the render tag
        theme_updated = self.theme_analyzer._update_theme_asset(
            theme_id, "layout/theme.liquid", new_content
        )

        if theme_updated:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": (
                    f"GA4 ({ga4_id}) ajouté via snippet 'isciacus-ga4'. "
                    f"Pour supprimer: effacez snippets/isciacus-ga4.liquid"
                ),
            }

        issue.action_status = ActionStatus.FAILED
        self._save_current_session()
        return {"success": False, "error": "Échec de la mise à jour du thème"}

    def _execute_theme_fix(self, issue: AuditIssue, action_id: str) -> dict[str, Any]:
        """Execute a theme fix action."""
        issue_index = int(action_id.replace("fix_theme_", ""))
        if self.theme_analyzer:
            analysis = self.theme_analyzer.analyze_theme()
            if issue_index < len(analysis.issues):
                success = self.theme_analyzer.apply_fix(analysis.issues[issue_index])
                if success:
                    issue.action_status = ActionStatus.COMPLETED
                    self._save_current_session()
                    return {"success": True, "message": "Correction appliquée"}

        issue.action_status = ActionStatus.FAILED
        self._save_current_session()
        return {"success": False, "error": "Échec de la correction du thème"}

    def _execute_fix_meta_event(self, issue: AuditIssue, action_id: str) -> dict[str, Any]:
        """Execute Meta Pixel event fix (add missing event to theme).

        Args:
            issue: The audit issue to fix
            action_id: Action ID in format "fix_meta_event_<EventName>"

        Returns:
            Success/error dict with execution result
        """
        if not self.theme_analyzer:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {"success": False, "error": "ThemeAnalyzer non disponible"}

        # Extract event name from action_id (e.g., "fix_meta_event_AddToCart" -> "AddToCart")
        event_name = action_id.replace("fix_meta_event_", "")

        # Get fresh theme analysis to find the corresponding issue
        from services.theme_analyzer import TrackingType

        self.theme_analyzer.clear_cache()
        analysis = self.theme_analyzer.analyze_theme(force_refresh=True)

        # Find the matching issue for this Meta event
        matching_issue = None
        for theme_issue in analysis.issues:
            if (
                theme_issue.tracking_type == TrackingType.META_PIXEL
                and theme_issue.event == event_name
                and theme_issue.fix_available
            ):
                matching_issue = theme_issue
                break

        if not matching_issue:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": f"Issue Meta Pixel pour l'événement '{event_name}' non trouvée dans l'analyse du thème",
            }

        # Apply the fix using ThemeAnalyzer
        success = self.theme_analyzer.apply_fix(matching_issue)

        if success:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            # Clear cache to ensure next audit detects the fix
            self.theme_analyzer.clear_cache()
            return {
                "success": True,
                "message": f"Événement Meta Pixel '{event_name}' ajouté au thème avec succès",
                "details": f"Le code a été ajouté dans {matching_issue.file_path or 'le thème'}",
            }

        issue.action_status = ActionStatus.FAILED
        self._save_current_session()
        return {
            "success": False,
            "error": f"Échec de l'ajout de l'événement '{event_name}' au thème",
        }

    def _update_step_status(
        self,
        result: AuditResult,
        step_id: str,
        status: AuditStepStatus,
        result_data: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Update a step's status and save session."""
        for step in result.steps:
            if step.id == step_id:
                now = datetime.now(tz=UTC).isoformat()

                if status == AuditStepStatus.RUNNING:
                    step.started_at = now
                elif status in [
                    AuditStepStatus.SUCCESS,
                    AuditStepStatus.WARNING,
                    AuditStepStatus.ERROR,
                ]:
                    step.completed_at = now
                    if step.started_at:
                        start = datetime.fromisoformat(step.started_at)
                        end = datetime.fromisoformat(now)
                        delta = (end - start).total_seconds()
                        step.duration_ms = int(delta * MS_PER_SECOND)

                step.status = status
                step.result = result_data
                step.error_message = error_message
                break

        self._save_current_session()

    def _rate_to_status(self, rate: float) -> AuditStepStatus:
        """Convert a percentage rate to status."""
        if rate >= COVERAGE_RATE_HIGH:
            return AuditStepStatus.SUCCESS
        if rate >= COVERAGE_RATE_MEDIUM:
            return AuditStepStatus.WARNING
        return AuditStepStatus.ERROR

    def _overall_status(self, steps: list[AuditStep]) -> AuditStepStatus:
        """Determine overall status from steps."""
        has_error = any(s.status == AuditStepStatus.ERROR for s in steps)
        has_warning = any(s.status == AuditStepStatus.WARNING for s in steps)

        if has_error:
            return AuditStepStatus.ERROR
        if has_warning:
            return AuditStepStatus.WARNING
        return AuditStepStatus.SUCCESS

    def _save_current_session(self) -> None:
        """Save the current session."""
        if self._current_session:
            self._save_session(self._current_session)

    def _session_to_dict(self, session: AuditSession) -> dict[str, Any]:
        """Convert session to dict for JSON."""
        return {
            "id": session.id,
            "created_at": session.created_at,
            "updated_at": session.updated_at,
            "audits": {k: self.result_to_dict(v) for k, v in session.audits.items()},
        }

    def result_to_dict(self, result: AuditResult) -> dict[str, Any]:
        """Convert audit result to dict (public method for Inngest workflows)."""
        return {
            "id": result.id,
            "audit_type": result.audit_type.value,
            "status": result.status.value,
            "started_at": result.started_at,
            "completed_at": result.completed_at,
            "steps": [
                {
                    "id": s.id,
                    "name": s.name,
                    "description": s.description,
                    "status": s.status.value,
                    "started_at": s.started_at,
                    "completed_at": s.completed_at,
                    "duration_ms": s.duration_ms,
                    "result": s.result,
                    "error_message": s.error_message,
                }
                for s in result.steps
            ],
            "issues": [
                {
                    "id": i.id,
                    "audit_type": i.audit_type.value,
                    "severity": i.severity,
                    "title": i.title,
                    "description": i.description,
                    "details": i.details,
                    "action_available": i.action_available,
                    "action_id": i.action_id,
                    "action_label": i.action_label,
                    "action_status": i.action_status.value,
                    "action_url": i.action_url,
                }
                for i in result.issues
            ],
            "summary": result.summary,
            "raw_data": result.raw_data,
            "execution_mode": result.execution_mode,
        }

    def _dict_to_session(self, data: dict[str, Any]) -> AuditSession:
        """Convert dict back to session."""
        session = AuditSession(
            id=data.get("id", ""),
            created_at=data.get("created_at", ""),
            updated_at=data.get("updated_at", ""),
        )

        for audit_type, audit_data in data.get("audits", {}).items():
            session.audits[audit_type] = self._dict_to_result(audit_data)

        return session

    def _dict_to_result(self, data: dict[str, Any]) -> AuditResult:
        """Convert dict back to audit result."""
        result = AuditResult(
            id=data.get("id", ""),
            audit_type=AuditType(data.get("audit_type", "ga4_tracking")),
            status=AuditStepStatus(data.get("status", "pending")),
            started_at=data.get("started_at", ""),
            completed_at=data.get("completed_at"),
            summary=data.get("summary", {}),
            raw_data=data.get("raw_data"),
            execution_mode=data.get("execution_mode", "sync"),
        )

        # Handle both list format (standard audits) and dict format (customer_data, cart_recovery)
        steps_data = data.get("steps", [])
        if isinstance(steps_data, dict):
            # Convert dict format {"step_name": {"status": "..."}} to list format
            for step_id, step_info in steps_data.items():
                if isinstance(step_info, dict):
                    result.steps.append(
                        AuditStep(
                            id=step_id,
                            name=step_id.replace("_", " ").title(),
                            description=step_info.get("message", ""),
                            status=AuditStepStatus(step_info.get("status", "pending")),
                            started_at=step_info.get("started_at"),
                            completed_at=step_info.get("completed_at"),
                            duration_ms=step_info.get("duration_ms"),
                            result=step_info.get("result"),
                            error_message=(
                                step_info.get("message")
                                if step_info.get("status") == "error"
                                else None
                            ),
                        )
                    )
        else:
            # Standard list format
            for step_data in steps_data:
                result.steps.append(
                    AuditStep(
                        id=step_data.get("id", ""),
                        name=step_data.get("name", ""),
                        description=step_data.get("description", ""),
                        status=AuditStepStatus(step_data.get("status", "pending")),
                        started_at=step_data.get("started_at"),
                        completed_at=step_data.get("completed_at"),
                        duration_ms=step_data.get("duration_ms"),
                        result=step_data.get("result"),
                        error_message=step_data.get("error_message"),
                    )
                )

        for issue_data in data.get("issues", []):
            result.issues.append(
                AuditIssue(
                    id=issue_data.get("id", ""),
                    audit_type=AuditType(issue_data.get("audit_type", "ga4_tracking")),
                    severity=issue_data.get("severity", "medium"),
                    title=issue_data.get("title", ""),
                    description=issue_data.get("description", ""),
                    details=issue_data.get("details"),
                    action_available=issue_data.get("action_available", False),
                    action_id=issue_data.get("action_id"),
                    action_label=issue_data.get("action_label"),
                    action_status=ActionStatus(issue_data.get("action_status", "not_available")),
                    action_url=issue_data.get("action_url"),
                )
            )

        return result

    def _execute_publish_to_google(self, issue: AuditIssue) -> dict[str, Any]:
        """Execute publish products to Google Shopping channel.

        This uses the Shopify publishablePublish mutation to add unpublished
        products to the Google & YouTube sales channel.
        Requires write_publications scope (Shopify Plus).
        """
        # Check write_publications permission first
        from services.permissions_checker import PermissionsCheckerService

        permissions_checker = PermissionsCheckerService(self._config_service)
        has_permission, error_msg = permissions_checker.has_write_publications_permission()

        if not has_permission:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": error_msg
                or (
                    "Permission write_publications manquante (Shopify Plus requis). "
                    "Allez dans Shopify > Apps > Votre app > Configuration API > "
                    "Ajoutez le scope 'write_publications' et réinstallez l'app."
                ),
            }

        # Get list of products not published to Google
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify = ShopifyAnalyticsService()
        google_status = shopify.fetch_products_google_shopping_status()

        if not google_status.get("google_channel_found"):
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": "Canal Google & YouTube non trouvé dans Shopify. Installez l'app Google & YouTube.",
            }

        products_to_publish = google_status.get("products_not_published", [])
        if not products_to_publish:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": "Tous les produits sont déjà publiés sur Google!",
            }

        # Extract product IDs
        product_ids = [p.get("id") for p in products_to_publish if p.get("id")]

        # Publish products
        result = shopify.publish_products_to_google(product_ids)

        if result.get("success"):
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": f"{result.get('published_count', 0)} produits publiés sur Google Shopping!",
            }

        # Partial success or failure
        published = result.get("published_count", 0)
        failed = result.get("failed_count", 0)

        if published > 0:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": f"{published} produits publiés, {failed} échecs.",
            }

        issue.action_status = ActionStatus.FAILED
        self._save_current_session()
        return {
            "success": False,
            "error": result.get("error", f"Échec de la publication ({failed} erreurs)"),
        }

    def _execute_publish_eligible_to_google(self, issue: AuditIssue) -> dict[str, Any]:
        """Publish only ELIGIBLE products to Google Shopping channel.

        Only publishes products that have image, price, and stock.
        These are the products most likely to be approved by GMC.
        """
        # Check write_publications permission first
        from services.permissions_checker import PermissionsCheckerService

        permissions_checker = PermissionsCheckerService(self._config_service)
        has_permission, error_msg = permissions_checker.has_write_publications_permission()

        if not has_permission:
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": error_msg
                or (
                    "Permission write_publications manquante (Shopify Plus requis). "
                    "Allez dans Shopify > Apps > Votre app > Configuration API > "
                    "Ajoutez le scope 'write_publications' et réinstallez l'app."
                ),
            }

        # Get list of eligible products not published to Google
        from services.shopify_analytics import ShopifyAnalyticsService

        shopify = ShopifyAnalyticsService()
        google_status = shopify.fetch_products_google_shopping_status()

        if not google_status.get("google_channel_found"):
            issue.action_status = ActionStatus.FAILED
            self._save_current_session()
            return {
                "success": False,
                "error": "Canal Google & YouTube non trouvé dans Shopify.",
            }

        # Get only eligible products (have image, price, stock)
        products_to_publish = google_status.get("products_not_published_eligible", [])
        if not products_to_publish:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": "Aucun produit éligible à publier (tous déjà publiés ou aucun éligible).",
            }

        # Extract product IDs
        product_ids = [p.get("id") for p in products_to_publish if p.get("id")]

        # Publish products
        result = shopify.publish_products_to_google(product_ids)

        if result.get("success"):
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": f"{result.get('published_count', 0)} produits éligibles publiés sur Google!",
            }

        # Partial success or failure
        published = result.get("published_count", 0)
        failed = result.get("failed_count", 0)

        if published > 0:
            issue.action_status = ActionStatus.COMPLETED
            self._save_current_session()
            return {
                "success": True,
                "message": f"{published} produits éligibles publiés, {failed} échecs.",
            }

        issue.action_status = ActionStatus.FAILED
        self._save_current_session()
        return {
            "success": False,
            "error": result.get("error", f"Échec de la publication ({failed} erreurs)"),
        }
