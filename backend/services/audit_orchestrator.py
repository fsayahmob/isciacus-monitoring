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


class AuditStepStatus(Enum):
    """Status of an audit step (like GitHub Actions)."""

    PENDING = "pending"
    RUNNING = "running"
    SUCCESS = "success"
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
        self.ga4_audit = ga4_audit_service
        self.theme_analyzer = theme_analyzer
        self._config_service = config_service
        self._storage_dir = Path(__file__).parent.parent / "data" / "audits"
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
                "⚠️ Search Console non configuré - Allez dans Settings > Search Console "
                "pour configurer votre propriété"
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
                "name": "Google Search Console",
                "description": gsc_description,
                "icon": "search",
                "available": gsc_configured,
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

    def run_ga4_audit(self, period: int = 30) -> AuditResult:
        """Run the full GA4 tracking audit with step-by-step progress."""
        result = self.start_audit(AuditType.GA4_TRACKING)

        # Check GA4 is configured in Settings first
        ga4_measurement_id = self._get_ga4_measurement_id()
        if not ga4_measurement_id:
            self._mark_audit_unconfigured(
                result,
                "GA4 non configuré. Allez dans Settings > GA4 pour configurer votre ID de mesure (G-XXXXXXXX).",
            )
            return result

        if not self.ga4_audit:
            self._mark_audit_unconfigured(result, "Service GA4 non configuré")
            return result

        try:
            # Step 1: GA4 Connection
            if not self._check_ga4_connection(result):
                return result

            # Run full audit and extract step results
            full_audit = self.ga4_audit.run_full_audit(period)
            coverage = full_audit.get("tracking_coverage", {})

            # Process coverage steps
            self._process_collections_coverage(result, coverage.get("collections", {}))
            self._process_products_coverage(result, coverage.get("products", {}))
            self._process_events_coverage(result, coverage.get("events", {}))
            self._process_transactions_match(result, full_audit.get("transactions_match", {}))

            # Finalize
            result.status = self._overall_status(result.steps)
            result.completed_at = datetime.now(tz=UTC).isoformat()
            result.summary = full_audit.get("summary", {})
            result.raw_data = full_audit

        except Exception as e:
            result.status = AuditStepStatus.ERROR
            result.issues.append(
                AuditIssue(
                    id="audit_error",
                    audit_type=AuditType.GA4_TRACKING,
                    severity="critical",
                    title="Erreur d'audit",
                    description=str(e),
                )
            )

        self._save_current_session()
        return result

    def _mark_audit_unconfigured(self, result: AuditResult, message: str) -> None:
        """Mark audit as unconfigured and skip remaining steps."""
        result.status = AuditStepStatus.ERROR
        result.steps[0].status = AuditStepStatus.ERROR
        result.steps[0].error_message = message
        for step in result.steps[1:]:
            step.status = AuditStepStatus.SKIPPED
        self._save_current_session()

    def _check_ga4_connection(self, result: AuditResult) -> bool:
        """Check GA4 connection and return True if connected."""
        self._update_step_status(result, "ga4_connection", AuditStepStatus.RUNNING)
        ga4_connected = self.ga4_audit.ga4.is_available()  # type: ignore[union-attr]
        conn_status = AuditStepStatus.SUCCESS if ga4_connected else AuditStepStatus.ERROR
        self._update_step_status(
            result, "ga4_connection", conn_status, result_data={"connected": ga4_connected}
        )

        if not ga4_connected:
            result.issues.append(
                AuditIssue(
                    id="ga4_not_connected",
                    audit_type=AuditType.GA4_TRACKING,
                    severity="critical",
                    title="GA4 non connecté",
                    description="Impossible de se connecter à l'API GA4",
                    action_available=False,
                )
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            self._save_current_session()
            return False
        return True

    def _process_collections_coverage(self, result: AuditResult, coll: dict[str, Any]) -> None:
        """Process collections coverage step."""
        self._update_step_status(result, "collections_coverage", AuditStepStatus.RUNNING)
        coll_status = self._rate_to_status(coll.get("rate", 0))
        self._update_step_status(result, "collections_coverage", coll_status, result_data=coll)

        if coll.get("missing"):
            rate = coll.get("rate", 0)
            missing_count = len(coll["missing"])
            tracked, total = coll.get("tracked", 0), coll.get("total", 0)

            # Determine severity based on coverage rate
            # If rate >= 70%, it's just informational (no visits, not a config issue)
            if rate >= COVERAGE_RATE_MEDIUM:
                severity = "low"
                description = (
                    f"{missing_count} collections sans visite récente dans GA4. "
                    f"Le tracking fonctionne ({tracked} pages vues), "
                    f"ces collections n'ont simplement pas reçu de trafic."
                )
            elif rate >= 50:
                severity = "medium"
                description = (
                    f"Collections peu visitées ({tracked}/{total}). "
                    f"Vérifiez leur visibilité dans la navigation."
                )
            else:
                severity = "high"
                description = (
                    f"Faible couverture collections ({tracked}/{total}). "
                    f"Possible problème de tracking ou de navigation."
                )

            result.issues.append(
                AuditIssue(
                    id="missing_collections",
                    audit_type=AuditType.GA4_TRACKING,
                    severity=severity,
                    title=f"{missing_count} collections sans visite",
                    description=description,
                    details=coll["missing"][:MAX_DETAILS_ITEMS],
                    action_available=False,
                )
            )

    def _process_products_coverage(self, result: AuditResult, prod: dict[str, Any]) -> None:
        """Process products coverage step."""
        self._update_step_status(result, "products_coverage", AuditStepStatus.RUNNING)
        prod_status = self._rate_to_status(prod.get("rate", 0))
        self._update_step_status(result, "products_coverage", prod_status, result_data=prod)

        if prod.get("missing"):
            rate = prod.get("rate", 0)
            missing_count = len(prod["missing"])
            tracked, total = prod.get("tracked", 0), prod.get("total", 0)

            # Determine severity based on coverage rate
            # High coverage = just informational (products without visits)
            if rate >= COVERAGE_RATE_HIGH:
                severity = "low"
                description = (
                    f"{missing_count} produits sans vue récente (view_item). "
                    f"Excellent taux de couverture ({rate:.0f}%), "
                    f"ces produits n'ont pas été consultés récemment."
                )
            elif rate >= COVERAGE_RATE_MEDIUM:
                severity = "low"
                description = (
                    f"{missing_count} produits sans visite dans GA4. "
                    f"Bon taux ({rate:.0f}%), probablement des produits "
                    f"peu visibles ou récemment ajoutés."
                )
            elif rate >= 50:
                severity = "medium"
                description = (
                    f"Couverture produits moyenne ({tracked}/{total}). "
                    f"Vérifiez la visibilité de ces produits."
                )
            else:
                severity = "high"
                description = (
                    f"Faible couverture produits ({tracked}/{total}). "
                    f"Possible problème de tracking view_item."
                )

            result.issues.append(
                AuditIssue(
                    id="missing_products",
                    audit_type=AuditType.GA4_TRACKING,
                    severity=severity,
                    title=f"{missing_count} produits sans vue récente",
                    description=description,
                    details=prod["missing"][:MAX_DETAILS_ITEMS],
                    action_available=False,
                )
            )

    def _process_events_coverage(self, result: AuditResult, events: dict[str, Any]) -> None:
        """Process events coverage step."""
        self._update_step_status(result, "events_coverage", AuditStepStatus.RUNNING)
        events_status = self._rate_to_status(events.get("rate", 0))
        self._update_step_status(result, "events_coverage", events_status, result_data=events)

        critical_events = ["purchase", "add_to_cart"]
        for missing_event in events.get("missing", []):
            is_critical = missing_event in critical_events
            result.issues.append(
                AuditIssue(
                    id=f"missing_event_{missing_event}",
                    audit_type=AuditType.GA4_TRACKING,
                    severity="critical" if is_critical else "high",
                    title=f"Événement '{missing_event}' manquant",
                    description=f"L'événement GA4 {missing_event} n'est pas détecté",
                    action_available=True,
                    action_id=f"fix_event_{missing_event}",
                    action_label="Ajouter au thème",
                    action_status=ActionStatus.AVAILABLE,
                )
            )

    def _process_transactions_match(self, result: AuditResult, trans: dict[str, Any]) -> None:
        """Process transactions match step."""
        self._update_step_status(result, "transactions_match", AuditStepStatus.RUNNING)
        match_rate = trans.get("match_rate", 0) * 100
        trans_status = self._rate_to_status(match_rate)
        self._update_step_status(result, "transactions_match", trans_status, result_data=trans)

        if match_rate < COVERAGE_RATE_HIGH:
            ga4_trans = trans.get("ga4_transactions", 0)
            shopify_orders = trans.get("shopify_orders", 0)
            is_critical = match_rate < COVERAGE_RATE_MEDIUM
            result.issues.append(
                AuditIssue(
                    id="transactions_mismatch",
                    audit_type=AuditType.GA4_TRACKING,
                    severity="critical" if is_critical else "high",
                    title=f"Écart transactions: {match_rate:.0f}%",
                    description=f"{ga4_trans} GA4 vs {shopify_orders} Shopify",
                    action_available=False,
                )
            )

    def run_theme_audit(self) -> AuditResult:
        """Run the theme code audit with step-by-step progress."""
        result = self.start_audit(AuditType.THEME_CODE)

        # Check GA4 is configured in Settings first
        ga4_measurement_id = self._get_ga4_measurement_id()
        if not ga4_measurement_id:
            self._mark_audit_unconfigured(
                result,
                "GA4 non configuré. Allez dans Settings > GA4 pour configurer votre ID de mesure (G-XXXXXXXX).",
            )
            return result

        if not self.theme_analyzer:
            result.status = AuditStepStatus.ERROR
            result.steps[0].status = AuditStepStatus.ERROR
            result.steps[0].error_message = "Theme Analyzer non configuré"
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            self._save_current_session()
            return result

        try:
            # Step 1: Theme Access
            self._update_step_status(result, "theme_access", AuditStepStatus.RUNNING)
            analysis = self.theme_analyzer.analyze_theme(force_refresh=True)

            if not analysis.files_analyzed:
                self._update_step_status(result, "theme_access", AuditStepStatus.ERROR)
                result.issues.append(
                    AuditIssue(
                        id="theme_access_error",
                        audit_type=AuditType.THEME_CODE,
                        severity="critical",
                        title="Accès thème impossible",
                        description="Impossible d'accéder aux fichiers du thème Shopify",
                        action_available=False,
                    )
                )
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                self._save_current_session()
                return result

            self._update_step_status(
                result,
                "theme_access",
                AuditStepStatus.SUCCESS,
                result_data={"files_count": len(analysis.files_analyzed)},
            )

            # Step 2: GA4 Code
            self._update_step_status(result, "ga4_code", AuditStepStatus.RUNNING)
            ga4_ok = analysis.ga4_configured
            ga4_status = AuditStepStatus.SUCCESS if ga4_ok else AuditStepStatus.WARNING
            self._update_step_status(
                result,
                "ga4_code",
                ga4_status,
                result_data={
                    "configured": analysis.ga4_configured,
                    "via_shopify_native": analysis.ga4_via_shopify_native,
                    "measurement_id": analysis.ga4_measurement_id,
                    "events_found": analysis.ga4_events_found,
                },
            )

            if not analysis.ga4_configured:
                # GA4 not detected in theme code - check if data is being received anyway
                # (could be via Custom Pixels, GTM, or Shopify native integration)
                ga4_receiving_data = False
                ga4_visitors = 0

                try:
                    from services.ga4_analytics import GA4AnalyticsService

                    ga4_service = GA4AnalyticsService(self._config_service)
                    if ga4_service.is_available():
                        metrics = ga4_service.get_funnel_metrics(days=7, force_refresh=True)
                        ga4_visitors = metrics.get("visitors") or 0
                        ga4_receiving_data = ga4_visitors > 0
                except Exception:
                    pass

                if ga4_receiving_data:
                    # GA4 is receiving data but not installed in theme
                    # This means it's via Custom Pixels, GTM, or Shopify Checkout
                    self._update_step_status(
                        result,
                        "ga4_code",
                        AuditStepStatus.SUCCESS,
                        result_data={
                            "configured": True,
                            "via_custom_pixels": True,
                            "visitors_7d": ga4_visitors,
                        },
                    )
                    result.issues.append(
                        AuditIssue(
                            id="ga4_via_custom_pixels",
                            audit_type=AuditType.THEME_CODE,
                            severity="info",
                            title="GA4 actif via Custom Pixels ou GTM",
                            description=(
                                f"GA4 n'est pas dans le thème mais reçoit des données "
                                f"({ga4_visitors} visiteurs ces 7 derniers jours). "
                                "Probablement installé via Shopify Customer Events (Custom Pixels) "
                                "ou Google Tag Manager."
                            ),
                            action_available=False,
                        )
                    )
                else:
                    # GA4 really not configured anywhere
                    ga4_id = self._get_ga4_measurement_id()
                    if ga4_id:
                        description = (
                            f"Aucun code GA4 détecté et aucune donnée reçue. "
                            f"Option 1: Configurez {ga4_id} dans Shopify > Online Store > Preferences. "
                            f"Option 2: Utilisez Customer Events (Custom Pixels) dans Shopify. "
                            f"Option 3: Cliquez pour ajouter {ga4_id} via un snippet (réversible)."
                        )
                        action_available = True
                    else:
                        description = (
                            "Aucun code GA4 détecté et aucune donnée reçue. "
                            "Configurez GA4 via Shopify Customer Events (Custom Pixels), "
                            "Online Store > Preferences, ou dans Settings > GA4."
                        )
                        action_available = False

                    result.issues.append(
                        AuditIssue(
                            id="ga4_not_in_theme",
                            audit_type=AuditType.THEME_CODE,
                            severity="critical",
                            title="GA4 non configuré",
                            description=description,
                            action_available=action_available,
                            action_id="add_ga4_base" if action_available else None,
                            action_label="Ajouter via snippet" if action_available else None,
                            action_status=(
                                ActionStatus.AVAILABLE
                                if action_available
                                else ActionStatus.NOT_AVAILABLE
                            ),
                        )
                    )
            elif analysis.ga4_via_shopify_native and not analysis.ga4_events_found:
                # GA4 is configured via Shopify native - inform user it's OK
                result.issues.append(
                    AuditIssue(
                        id="ga4_via_shopify_native",
                        audit_type=AuditType.THEME_CODE,
                        severity="info",
                        title="GA4 configuré via Shopify",
                        description=(
                            f"GA4 ({analysis.ga4_measurement_id or 'ID non visible'}) "
                            "est configuré via l'intégration native Shopify "
                            "(Online Store > Preferences). "
                            "Le tracking de base (page_view, purchase) est automatique."
                        ),
                        action_available=False,
                    )
                )

            # Step 3: Meta Code
            self._update_step_status(result, "meta_code", AuditStepStatus.RUNNING)
            meta_ok = analysis.meta_pixel_configured
            meta_status = AuditStepStatus.SUCCESS if meta_ok else AuditStepStatus.WARNING
            self._update_step_status(
                result,
                "meta_code",
                meta_status,
                result_data={
                    "configured": analysis.meta_pixel_configured,
                    "pixel_id": analysis.meta_pixel_id,
                    "events_found": analysis.meta_events_found,
                },
            )

            # Step 4: GTM Code
            self._update_step_status(result, "gtm_code", AuditStepStatus.RUNNING)
            self._update_step_status(
                result,
                "gtm_code",
                AuditStepStatus.SUCCESS,
                result_data={
                    "configured": analysis.gtm_configured,
                    "container_id": analysis.gtm_container_id,
                },
            )

            # Step 5: Issues Detection
            self._update_step_status(result, "issues_detection", AuditStepStatus.RUNNING)

            # Check if GA4/Meta are receiving data via Custom Pixels (not in theme)
            # If so, skip the "missing event" issues since events are tracked elsewhere
            ga4_via_custom_pixels = any(i.id == "ga4_via_custom_pixels" for i in result.issues)

            # Convert theme analyzer issues to audit issues
            filtered_issues_count = 0
            for i, issue in enumerate(analysis.issues):
                # Skip GA4 missing event issues if GA4 is active via Custom Pixels
                if (
                    ga4_via_custom_pixels
                    and issue.tracking_type.value == "ga4"
                    and issue.issue_type == "missing_event"
                ):
                    filtered_issues_count += 1
                    continue

                fixable = issue.fix_available
                action_sts = ActionStatus.AVAILABLE if fixable else ActionStatus.NOT_AVAILABLE
                event_name = issue.event or issue.issue_type
                result.issues.append(
                    AuditIssue(
                        id=f"theme_issue_{i}",
                        audit_type=AuditType.THEME_CODE,
                        severity=issue.severity,
                        title=f"{issue.tracking_type.value.upper()}: {event_name}",
                        description=issue.description,
                        details=[f"Fichier: {issue.file_path}"] if issue.file_path else None,
                        action_available=fixable,
                        action_id=f"fix_theme_{i}" if fixable else None,
                        action_label="Corriger" if fixable else None,
                        action_status=action_sts,
                    )
                )

            reported_issues = len(analysis.issues) - filtered_issues_count
            has_issues = reported_issues > 0
            issues_status = AuditStepStatus.WARNING if has_issues else AuditStepStatus.SUCCESS
            self._update_step_status(
                result,
                "issues_detection",
                issues_status,
                result_data={"issues_count": len(analysis.issues)},
            )

            # Finalize
            result.status = self._overall_status(result.steps)
            result.completed_at = datetime.now(tz=UTC).isoformat()
            result.summary = {
                "ga4_configured": analysis.ga4_configured,
                "ga4_via_shopify_native": analysis.ga4_via_shopify_native,
                "ga4_measurement_id": analysis.ga4_measurement_id,
                "meta_configured": analysis.meta_pixel_configured,
                "gtm_configured": analysis.gtm_configured,
                "issues_count": len(analysis.issues),
                "fixable_count": len([i for i in analysis.issues if i.fix_available]),
                "files_analyzed": analysis.files_analyzed,
            }

        except Exception as e:
            result.status = AuditStepStatus.ERROR
            result.issues.append(
                AuditIssue(
                    id="theme_audit_error",
                    audit_type=AuditType.THEME_CODE,
                    severity="critical",
                    title="Erreur d'audit thème",
                    description=str(e),
                )
            )

        self._save_current_session()
        return result

    def run_meta_audit(self) -> AuditResult:
        """Run the Meta Pixel audit with step-by-step progress."""
        result = self.start_audit(AuditType.META_PIXEL)

        # Get Meta config from ConfigService
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        meta_config = self._config_service.get_meta_values()
        configured_pixel_id = meta_config.get("pixel_id", "")
        access_token = meta_config.get("access_token", "")

        # Step 1: Scan theme for Meta Pixel (detect any pixel, don't require config)
        self._update_step_status(result, "meta_connection", AuditStepStatus.RUNNING)

        theme_pixel_id = None
        pixel_in_theme = False
        analysis = None

        if self.theme_analyzer:
            analysis = self.theme_analyzer.analyze_theme()
            pixel_in_theme = analysis.meta_pixel_configured
            theme_pixel_id = analysis.meta_pixel_id

        if pixel_in_theme and theme_pixel_id:
            # Pixel found in theme - this is the primary source of truth
            self._update_step_status(
                result,
                "meta_connection",
                AuditStepStatus.SUCCESS,
                result_data={
                    "pixel_in_theme": True,
                    "theme_pixel_id": theme_pixel_id,
                    "configured_pixel_id": configured_pixel_id or None,
                },
            )
            # Use theme pixel as the effective pixel ID
            effective_pixel_id = theme_pixel_id
        elif configured_pixel_id:
            # No pixel in theme but we have one configured
            self._update_step_status(
                result,
                "meta_connection",
                AuditStepStatus.WARNING,
                result_data={
                    "pixel_in_theme": False,
                    "configured_pixel_id": configured_pixel_id,
                },
                error_message="Pixel configuré mais non détecté dans le thème",
            )
            effective_pixel_id = configured_pixel_id
        else:
            # No pixel anywhere
            self._update_step_status(
                result,
                "meta_connection",
                AuditStepStatus.ERROR,
                error_message="Aucun Meta Pixel détecté dans le thème ni configuré",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
            result.issues.append(
                AuditIssue(
                    id="meta_no_pixel",
                    audit_type=AuditType.META_PIXEL,
                    severity="critical",
                    title="Aucun Meta Pixel",
                    description=(
                        "Aucun Meta Pixel n'est installé dans le thème Shopify. "
                        "Le Pixel est nécessaire pour tracker les conversions Facebook/Instagram."
                    ),
                    action_available=True,
                    action_label="Configurer Meta",
                    action_url="https://business.facebook.com/events_manager",
                    action_status=ActionStatus.AVAILABLE,
                )
            )
            self._save_current_session()
            return result

        # Step 2: Pixel Configuration (compare theme vs config if both exist)
        self._update_step_status(result, "pixel_config", AuditStepStatus.RUNNING)

        if pixel_in_theme:
            if configured_pixel_id and theme_pixel_id != configured_pixel_id:
                # Mismatch between theme and config - info only
                self._update_step_status(
                    result,
                    "pixel_config",
                    AuditStepStatus.WARNING,
                    result_data={
                        "theme_pixel_id": theme_pixel_id,
                        "configured_pixel_id": configured_pixel_id,
                        "match": False,
                    },
                )
                result.issues.append(
                    AuditIssue(
                        id="meta_pixel_mismatch",
                        audit_type=AuditType.META_PIXEL,
                        severity="info",
                        title="Pixel ID différent de la config",
                        description=(
                            f"Le Pixel dans le thème ({theme_pixel_id}) est différent "
                            f"de celui configuré dans les settings ({configured_pixel_id}). "
                            "Mettez à jour la config si nécessaire."
                        ),
                    )
                )
            else:
                # Pixel in theme, matches config or no config
                self._update_step_status(
                    result,
                    "pixel_config",
                    AuditStepStatus.SUCCESS,
                    result_data={
                        "theme_pixel_id": theme_pixel_id,
                        "status": "installed",
                    },
                )
        else:
            # Pixel configured but not in theme
            self._update_step_status(
                result,
                "pixel_config",
                AuditStepStatus.WARNING,
                result_data={"pixel_in_theme": False},
            )
            result.issues.append(
                AuditIssue(
                    id="meta_pixel_not_in_theme",
                    audit_type=AuditType.META_PIXEL,
                    severity="high",
                    title="Meta Pixel non installé dans le thème",
                    description=(
                        f"Le Pixel {configured_pixel_id} est configuré mais n'est pas "
                        "détecté dans le code du thème Shopify. Vérifiez l'installation."
                    ),
                    action_available=True,
                    action_label="Guide d'installation",
                    action_url="https://www.facebook.com/business/help/952192354843755",
                    action_status=ActionStatus.AVAILABLE,
                )
            )

        # Step 3: Events Check (from theme analysis)
        self._update_step_status(result, "events_check", AuditStepStatus.RUNNING)

        meta_events_found = []
        required_events = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]

        if analysis:
            meta_events_found = analysis.meta_events_found

        missing_events = [e for e in required_events if e not in meta_events_found]

        # We'll update events_check status later, after checking Meta API
        # to detect if pixel is active via Custom Pixels

        # Step 4: Verify pixel status on Meta
        self._update_step_status(result, "pixel_status", AuditStepStatus.RUNNING)

        pixel_active_on_meta = False
        pixel_name = ""
        last_fired = None

        if not access_token:
            self._update_step_status(
                result,
                "pixel_status",
                AuditStepStatus.SKIPPED,
                error_message="Pas de token Meta - impossible de vérifier le statut du pixel",
            )
        else:
            # Query Meta API to check the pixel status
            try:
                import requests

                pixel_url = f"https://graph.facebook.com/v19.0/{effective_pixel_id}"
                pixel_resp = requests.get(
                    pixel_url,
                    params={
                        "access_token": access_token,
                        "fields": "id,name,last_fired_time,is_unavailable,owner_business",
                    },
                    timeout=10,
                )

                if pixel_resp.status_code == 200:
                    pixel_data = pixel_resp.json()
                    pixel_name = pixel_data.get("name", "")
                    last_fired = pixel_data.get("last_fired_time")
                    is_unavailable = pixel_data.get("is_unavailable", False)
                    owner_business = pixel_data.get("owner_business", {})

                    if is_unavailable:
                        self._update_step_status(
                            result,
                            "pixel_status",
                            AuditStepStatus.WARNING,
                            result_data={
                                "pixel_name": pixel_name,
                                "status": "unavailable",
                                "owner_business": owner_business.get("name", ""),
                            },
                            error_message=f"Pixel '{pixel_name}' désactivé sur Meta",
                        )
                        result.issues.append(
                            AuditIssue(
                                id="meta_pixel_disabled",
                                audit_type=AuditType.META_PIXEL,
                                severity="high",
                                title=f"Pixel '{pixel_name}' désactivé",
                                description=(
                                    f"Le pixel {effective_pixel_id} existe sur Meta mais est "
                                    "marqué comme indisponible. Vérifiez dans Events Manager."
                                ),
                                action_available=True,
                                action_label="Ouvrir Events Manager",
                                action_url=f"https://business.facebook.com/events_manager2/list/pixel/{effective_pixel_id}",
                                action_status=ActionStatus.AVAILABLE,
                            )
                        )
                    elif last_fired:
                        # Pixel is active and receiving data
                        pixel_active_on_meta = True
                        self._update_step_status(
                            result,
                            "pixel_status",
                            AuditStepStatus.SUCCESS,
                            result_data={
                                "pixel_name": pixel_name,
                                "last_fired": last_fired,
                                "status": "active",
                                "owner_business": owner_business.get("name", ""),
                                "owner_business_id": owner_business.get("id", ""),
                            },
                        )
                    else:
                        self._update_step_status(
                            result,
                            "pixel_status",
                            AuditStepStatus.WARNING,
                            result_data={
                                "pixel_name": pixel_name,
                                "status": "no_activity",
                                "owner_business": owner_business.get("name", ""),
                            },
                            error_message=f"Pixel '{pixel_name}' sans activité récente",
                        )
                        result.issues.append(
                            AuditIssue(
                                id="meta_pixel_no_activity",
                                audit_type=AuditType.META_PIXEL,
                                severity="warning",
                                title="Pixel sans activité récente",
                                description=(
                                    f"Le pixel '{pixel_name}' ({effective_pixel_id}) existe "
                                    "mais n'a pas reçu de données récemment."
                                ),
                                action_available=True,
                                action_label="Tester avec Pixel Helper",
                                action_url="https://chrome.google.com/webstore/detail/meta-pixel-helper/fdgfkebogiimcoedlicjlajpkdmockpc",
                                action_status=ActionStatus.AVAILABLE,
                            )
                        )
                elif pixel_resp.status_code == 400:
                    error_msg = ""
                    try:
                        error_data = pixel_resp.json()
                        error_msg = error_data.get("error", {}).get("message", "")
                    except Exception:
                        pass
                    self._update_step_status(
                        result,
                        "pixel_status",
                        AuditStepStatus.WARNING,
                        error_message=f"Pixel {effective_pixel_id} non accessible sur Meta",
                    )
                else:
                    self._update_step_status(
                        result,
                        "pixel_status",
                        AuditStepStatus.WARNING,
                        error_message=f"Erreur API Meta ({pixel_resp.status_code})",
                    )
            except Exception as e:
                self._update_step_status(
                    result,
                    "pixel_status",
                    AuditStepStatus.ERROR,
                    error_message=str(e),
                )

        # Now update events_check based on what we found
        # If pixel is active on Meta but not in theme = Custom Pixels installation
        meta_via_custom_pixels = pixel_active_on_meta and not pixel_in_theme

        if meta_via_custom_pixels:
            # Pixel active via Custom Pixels - don't report missing events as errors
            self._update_step_status(
                result,
                "events_check",
                AuditStepStatus.SUCCESS,
                result_data={
                    "via_custom_pixels": True,
                    "last_fired": last_fired,
                    "coverage": "via Custom Pixels",
                },
            )
            # Remove the "not in theme" issue we added earlier
            result.issues = [i for i in result.issues if i.id != "meta_pixel_not_in_theme"]
            # Add info issue instead
            result.issues.append(
                AuditIssue(
                    id="meta_via_custom_pixels",
                    audit_type=AuditType.META_PIXEL,
                    severity="info",
                    title="Meta Pixel actif via Custom Pixels",
                    description=(
                        f"Le pixel '{pixel_name}' ({effective_pixel_id}) n'est pas dans le thème "
                        f"mais est actif sur Meta (dernière activité: {last_fired}). "
                        "Installation via l'app Shopify Facebook ou Custom Pixels détectée."
                    ),
                    action_available=False,
                )
            )
        elif not missing_events:
            self._update_step_status(
                result,
                "events_check",
                AuditStepStatus.SUCCESS,
                result_data={"events_found": meta_events_found, "coverage": "100%"},
            )
        elif len(missing_events) < len(required_events):
            coverage = int(
                (len(required_events) - len(missing_events)) / len(required_events) * 100
            )
            self._update_step_status(
                result,
                "events_check",
                AuditStepStatus.WARNING,
                result_data={
                    "events_found": meta_events_found,
                    "missing_events": missing_events,
                    "coverage": f"{coverage}%",
                },
            )
            # Add issues for missing events
            event_info = {
                "PageView": {
                    "description": "Tracke toutes les pages visitées",
                    "severity": "warning",
                },
                "ViewContent": {"description": "Tracke les vues de produits", "severity": "high"},
                "AddToCart": {
                    "description": "Essentiel pour les campagnes",
                    "severity": "critical",
                },
                "InitiateCheckout": {"description": "Tracke le début d'achat", "severity": "high"},
                "Purchase": {"description": "Indispensable pour le ROAS", "severity": "critical"},
            }
            for event in missing_events:
                info = event_info.get(event, {})
                result.issues.append(
                    AuditIssue(
                        id=f"meta_missing_{event.lower()}",
                        audit_type=AuditType.META_PIXEL,
                        severity=info.get("severity", "warning"),
                        title=f"Événement {event} manquant",
                        description=info.get("description", ""),
                        action_available=False,
                    )
                )
        else:
            self._update_step_status(
                result,
                "events_check",
                AuditStepStatus.ERROR,
                result_data={"events_found": [], "coverage": "0%"},
            )
            result.issues.append(
                AuditIssue(
                    id="meta_no_events",
                    audit_type=AuditType.META_PIXEL,
                    severity="critical",
                    title="Aucun événement Meta détecté",
                    description=(
                        "Aucun événement de conversion n'est tracké dans le thème. "
                        "Si vous utilisez l'app Shopify Facebook, vérifiez qu'elle est bien configurée."
                    ),
                    details=[
                        "📋 Événements requis: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase",
                        "💡 Utilisez l'app Shopify 'Facebook' pour une installation simplifiée",
                    ],
                    action_available=True,
                    action_label="Installer via Shopify",
                    action_url="https://apps.shopify.com/facebook",
                    action_status=ActionStatus.AVAILABLE,
                )
            )

        # Finalize
        result.status = self._overall_status(result.steps)
        result.completed_at = datetime.now(tz=UTC).isoformat()
        result.summary = {
            "pixel_id": effective_pixel_id,
            "theme_pixel_id": theme_pixel_id,
            "configured_pixel_id": configured_pixel_id or None,
            "pixel_in_theme": pixel_in_theme,
            "pixel_active_on_meta": pixel_active_on_meta,
            "via_custom_pixels": meta_via_custom_pixels,
            "events_found": meta_events_found,
            "events_missing": missing_events if not meta_via_custom_pixels else [],
            "issues_count": len(result.issues),
        }

        self._save_current_session()
        return result

    def run_gmc_audit(self) -> AuditResult:
        """Run the Google Merchant Center audit with step-by-step progress."""
        result = self.start_audit(AuditType.MERCHANT_CENTER)

        # Get GMC config from ConfigService
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        gmc_config = self._config_service.get_merchant_center_values()
        merchant_id = gmc_config.get("merchant_id", "")

        # Step 1: GMC Connection
        self._update_step_status(result, "gmc_connection", AuditStepStatus.RUNNING)

        if not merchant_id:
            self._update_step_status(
                result,
                "gmc_connection",
                AuditStepStatus.ERROR,
                error_message="GOOGLE_MERCHANT_ID non configuré. Allez dans Settings > Google Merchant Center.",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
            self._save_current_session()
            return result

        # Try to connect to Merchant Center API
        try:
            from pathlib import Path

            from google.oauth2 import service_account

            creds_path = gmc_config.get("service_account_key_path", "")
            if not creds_path or not Path(creds_path).exists():
                self._update_step_status(
                    result,
                    "gmc_connection",
                    AuditStepStatus.ERROR,
                    error_message="Fichier credentials Google non trouvé",
                )
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                result.completed_at = datetime.now(tz=UTC).isoformat()
                self._save_current_session()
                return result

            credentials = service_account.Credentials.from_service_account_file(
                creds_path,
                scopes=["https://www.googleapis.com/auth/content"],
            )

            import requests
            from google.auth.transport.requests import Request

            credentials.refresh(Request())

            # Test connection by getting account info
            headers = {"Authorization": f"Bearer {credentials.token}"}
            resp = requests.get(
                f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/accounts/{merchant_id}",
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 200:
                self._update_step_status(
                    result,
                    "gmc_connection",
                    AuditStepStatus.SUCCESS,
                    result_data={"merchant_id": merchant_id},
                )
            else:
                self._update_step_status(
                    result,
                    "gmc_connection",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur API GMC: {resp.status_code} - {resp.text[:100]}",
                )
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                result.completed_at = datetime.now(tz=UTC).isoformat()
                self._save_current_session()
                return result

            # Step 1b: Get Account Status (account-level issues that may block products)
            account_issues: list[dict] = []
            try:
                account_status_resp = requests.get(
                    f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/accountstatuses/{merchant_id}",
                    headers=headers,
                    timeout=30,
                )
                if account_status_resp.status_code == 200:
                    account_data = account_status_resp.json()
                    account_issues = account_data.get("accountLevelIssues", [])
            except Exception:
                pass  # Non-blocking, continue audit

            # Step 2: Products Status - Use productstatuses API for detailed status
            self._update_step_status(result, "products_status", AuditStepStatus.RUNNING)

            # Get product statuses with item-level issues (rejection reasons)
            # Fetch ALL productstatuses with pagination
            gmc_products: list[dict] = []
            gmc_products_by_id: dict[str, dict] = {}
            approved = 0
            disapproved = 0
            pending = 0

            # Collect rejection reasons
            rejection_reasons: dict[str, list[dict]] = {}  # reason_code -> list of products

            # Paginate through all products
            next_page_token = None
            page_count = 0
            max_pages = 50  # Safety limit

            while page_count < max_pages:
                page_count += 1
                url = f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/productstatuses?maxResults=250"
                if next_page_token:
                    url += f"&pageToken={next_page_token}"

                statuses_resp = requests.get(url, headers=headers, timeout=60)

                if statuses_resp.status_code != 200:
                    break

                statuses_data = statuses_resp.json()
                page_products = statuses_data.get("resources", [])
                gmc_products.extend(page_products)

                # Check for more pages
                next_page_token = statuses_data.get("nextPageToken")
                if not next_page_token:
                    break

            total_products = len(gmc_products)

            # Track products with disapproved issues (for detailed reporting)
            products_with_issues: list[dict] = []

            if total_products > 0:
                for product in gmc_products:
                    product_id = product.get("productId", "")
                    title = product.get("title", "Sans titre")

                    # Extract Shopify ID from GMC product ID (format: shopify_FR_123456_789)
                    shopify_id = None
                    if "shopify_" in product_id:
                        parts = product_id.split("_")
                        if len(parts) >= 4:
                            shopify_id = parts[3]  # The product ID part
                    gmc_products_by_id[shopify_id or product_id] = product

                    # Check destination status for France (FR)
                    # destinationStatuses contains approvedCountries, pendingCountries, disapprovedCountries
                    dest_statuses = product.get("destinationStatuses", [])
                    product_status = "pending"
                    for dest in dest_statuses:
                        # Check all Google destinations
                        dest_name = dest.get("destination", "")
                        if "SurfacesAcrossGoogle" in dest_name or "Shopping" in dest_name:
                            approved_countries = dest.get("approvedCountries", [])
                            disapproved_countries = dest.get("disapprovedCountries", [])
                            pending_countries = dest.get("pendingCountries", [])

                            if "FR" in approved_countries:
                                product_status = "approved"
                            elif "FR" in disapproved_countries:
                                product_status = "disapproved"
                            elif "FR" in pending_countries:
                                product_status = "pending"

                    if product_status == "approved":
                        approved += 1
                    elif product_status == "disapproved":
                        disapproved += 1
                    else:
                        pending += 1

                    # Extract item-level issues (rejection reasons)
                    # servability: "disapproved" = blocks serving, "demoted" = reduced visibility, "unaffected" = warning only
                    item_issues = product.get("itemLevelIssues", [])
                    product_issues_seen: set[str] = set()
                    product_disapproved_issues: list[dict] = []

                    for issue in item_issues:
                        servability = issue.get("servability", "")
                        # Only count disapproved issues (blocks serving) - not demoted or unaffected
                        if servability == "disapproved":
                            reason_code = issue.get("code", "unknown")
                            reason_desc = issue.get("description", reason_code)

                            # Only add this product once per reason code
                            if reason_code not in product_issues_seen:
                                product_issues_seen.add(reason_code)
                                if reason_code not in rejection_reasons:
                                    rejection_reasons[reason_code] = []
                                issue_info = {
                                    "product_id": product_id,
                                    "title": title,
                                    "description": reason_desc,
                                    "attribute": issue.get("attributeName", ""),
                                    "detail": issue.get("detail", ""),
                                    "documentation": issue.get("documentation", ""),
                                }
                                rejection_reasons[reason_code].append(issue_info)
                                product_disapproved_issues.append(issue_info)

                    if product_disapproved_issues:
                        products_with_issues.append(
                            {
                                "product_id": product_id,
                                "title": title,
                                "status": product_status,
                                "issues": product_disapproved_issues,
                            }
                        )

                if disapproved > 0:
                    self._update_step_status(
                        result,
                        "products_status",
                        AuditStepStatus.WARNING,
                        result_data={
                            "total": total_products,
                            "approved": approved,
                            "disapproved": disapproved,
                            "pending": pending,
                        },
                    )
                else:
                    self._update_step_status(
                        result,
                        "products_status",
                        AuditStepStatus.SUCCESS,
                        result_data={
                            "total": total_products,
                            "approved": approved,
                            "disapproved": disapproved,
                            "pending": pending,
                        },
                    )
            else:
                self._update_step_status(
                    result,
                    "products_status",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur lecture produits: {statuses_resp.status_code}",
                )

            # Step 3: Feed Sync - NEW APPROACH: Start from GMC, cross-reference with Shopify
            self._update_step_status(result, "feed_sync", AuditStepStatus.RUNNING)

            # Get Shopify products and Google channel publication status
            from services.shopify_analytics import ShopifyAnalyticsService

            shopify = ShopifyAnalyticsService()
            google_pub_status = shopify.fetch_products_google_shopping_status()
            google_channel_found = google_pub_status.get("google_channel_found", False)
            published_to_google = google_pub_status.get("published_to_google", 0)
            not_published_to_google = google_pub_status.get("not_published_to_google", 0)
            products_not_published = google_pub_status.get("products_not_published", [])
            products_published = google_pub_status.get("products_published", [])
            # New: eligible products not published (could be activated)
            products_not_published_eligible = google_pub_status.get(
                "products_not_published_eligible", []
            )

            # Analyze products published to Google channel for quality issues
            # These could explain why they don't appear in GMC
            published_no_image: list[dict] = []
            published_no_price: list[dict] = []
            published_no_description: list[dict] = []
            published_out_of_stock: list[dict] = []
            published_ok: list[dict] = []

            for product in products_published:
                # Data now comes pre-analyzed from the service
                has_image = product.get("has_image", False)
                has_description = product.get("has_description", False)
                has_price = product.get("has_price", False)
                in_stock = product.get("in_stock", False)

                product_info = {
                    "title": product.get("title", "Sans titre"),
                    "handle": product.get("handle", ""),
                }

                if not has_image:
                    published_no_image.append(product_info)
                elif not has_price:
                    published_no_price.append(product_info)
                elif not has_description:
                    published_no_description.append(product_info)
                elif not in_stock:
                    published_out_of_stock.append(product_info)
                else:
                    published_ok.append(product_info)

            # Build GMC-first analysis
            # 1. What's IN GMC (we have: total_products, approved, disapproved, pending)
            # 2. What's rejected and WHY (rejection_reasons from productstatuses API)
            # 3. What's missing and why (cross-reference with Shopify Google channel)

            self._update_step_status(
                result,
                "feed_sync",
                AuditStepStatus.SUCCESS if total_products > 0 else AuditStepStatus.WARNING,
                result_data={
                    "gmc_total": total_products,
                    "gmc_approved": approved,
                    "gmc_disapproved": disapproved,
                    "gmc_pending": pending,
                    "shopify_published_to_google": published_to_google,
                    "shopify_not_published": not_published_to_google,
                },
            )

            # Calculate totals for KPI summary
            # Total products in Shopify store (published + not published to Google)
            total_shopify_products = published_to_google + not_published_to_google

            # GMC counts variants, Shopify counts parent products
            # Calculate approval rate based on GMC data
            approval_rate = round((approved / total_products * 100), 1) if total_products > 0 else 0

            # ISSUE 0: KPI SUMMARY - Overview of the full flow
            # Shopify Store → Shopify Google Channel → GMC Received → GMC Approved
            kpi_severity = "info"
            if disapproved > 0 or approval_rate < 90:
                kpi_severity = "high"
            elif pending > 0 or approval_rate < 95:
                kpi_severity = "warning"

            kpi_details = [
                "═══════════════════════════════════════",
                "        FLUX PRODUITS GOOGLE SHOPPING",
                "═══════════════════════════════════════",
                "",
                f"🛍️  SHOPIFY:      {total_shopify_products} produits",
                "         ↓",
                f"📤  CANAL GOOGLE: {published_to_google} publiés",
                f"         ↓        ({not_published_to_google} non publiés)",
                f"📥  GMC REÇUS:    {total_products} variantes reçues",
                "         ↓",
                f"✅  APPROUVÉS:    {approved} ({approval_rate}%)",
                "",
                "───────────────────────────────────────",
                f"⏳  En attente:   {pending}",
                f"❌  Rejetés:      {disapproved}",
                "═══════════════════════════════════════",
                "",
                "i  GMC compte les variantes (taille, couleur...)",
                "    Shopify compte les produits parents",
            ]

            result.issues.append(
                AuditIssue(
                    id="kpi_summary",
                    audit_type=AuditType.MERCHANT_CENTER,
                    severity=kpi_severity,
                    title=f"📊 GMC: {approved}/{total_products} approuvés ({approval_rate}%)",
                    description=f"Shopify {total_shopify_products} produits → Canal Google {published_to_google} → GMC {total_products} variantes → {approved} approuvées",
                    details=kpi_details,
                )
            )

            # ISSUE 1b: Account-level issues (can block entire feed)
            if account_issues:
                critical_issues = [i for i in account_issues if i.get("severity") == "critical"]
                error_issues = [i for i in account_issues if i.get("severity") == "error"]

                if critical_issues or error_issues:
                    account_details = []
                    for issue in account_issues:
                        severity = issue.get("severity", "unknown")
                        title = issue.get("title", "Problème inconnu")
                        detail = issue.get("detail", "")

                        severity_icon = (
                            "🔴"
                            if severity == "critical"
                            else "🟠" if severity == "error" else "🟡"
                        )
                        account_details.append(f"{severity_icon} [{severity.upper()}] {title}")
                        if detail:
                            account_details.append(f"   → {detail[:100]}")

                    account_details.append("🔧 Action: GMC > Diagnostics > Problèmes de compte")

                    result.issues.append(
                        AuditIssue(
                            id="gmc_account_issues",
                            audit_type=AuditType.MERCHANT_CENTER,
                            severity="critical" if critical_issues else "high",
                            title=f"🚨 {len(account_issues)} problème(s) de compte GMC",
                            description="Ces problèmes peuvent bloquer la synchronisation",
                            details=account_details,
                        )
                    )

            # ISSUE 2: GMC Rejection Reasons (THE KEY INFO - from GMC API)
            # Note: products_with_issues contains unique variants that have at least one disapproved issue
            # rejection_reasons groups issues by reason code - a variant can appear in MULTIPLE reasons
            # So sum of all reasons > number of variants with issues (variants can have multiple problems)
            total_variants_with_issues = len(products_with_issues)

            if rejection_reasons and total_variants_with_issues > 0:
                # Add summary issue showing total variants affected
                reason_summary = [
                    f"📊 {total_variants_with_issues} variantes GMC avec au moins 1 problème",
                    f"   (= {disapproved} variantes rejetées pour la France)",
                    "─" * 40,
                    "Détail par type de problème:",
                    "(⚠️ Une variante peut avoir plusieurs problèmes)",
                ]
                for reason_code, products_list in sorted(
                    rejection_reasons.items(), key=lambda x: -len(x[1])
                ):
                    desc = products_list[0]["description"] if products_list else reason_code
                    reason_summary.append(f"• {desc[:40]}: {len(products_list)} variante(s)")

                result.issues.append(
                    AuditIssue(
                        id="gmc_issues_summary",
                        audit_type=AuditType.MERCHANT_CENTER,
                        severity="high",
                        title=f"⚠️ {total_variants_with_issues} variante(s) GMC avec problèmes",
                        description=f"{total_variants_with_issues} variantes ont des issues bloquantes. Une variante peut avoir plusieurs problèmes.",
                        details=reason_summary[:15] + (["..."] if len(reason_summary) > 15 else []),
                    )
                )

                # Then create detailed issues per rejection reason
                for reason_code, products_list in sorted(
                    rejection_reasons.items(), key=lambda x: -len(x[1])
                ):
                    count = len(products_list)
                    # Get description from first variant
                    desc = products_list[0]["description"] if products_list else reason_code

                    # Create separate issue for each major rejection reason
                    if count >= 1:
                        # Get detail/fix info from first variant
                        detail_info = products_list[0].get("detail", "")
                        attribute = products_list[0].get("attribute", "")
                        doc_url = products_list[0].get("documentation", "")

                        # Build details list with variant names
                        rejection_details = []
                        if attribute:
                            rejection_details.append(f"📋 Attribut: {attribute}")
                        if detail_info:
                            rejection_details.append(f"💡 Détail: {detail_info}")
                        if doc_url:
                            rejection_details.append(f"📖 Doc: {doc_url}")
                        rejection_details.append("🔧 Correction: GMC > Produits > Diagnostics")
                        rejection_details.append("─" * 30)
                        rejection_details.append("Variantes concernées:")
                        rejection_details.extend([f"  • {p['title']}" for p in products_list[:15]])
                        if len(products_list) > 15:
                            rejection_details.append(f"  ... et {len(products_list) - 15} autres")

                        # Build GMC diagnostics URL
                        gmc_diagnostics_url = (
                            f"https://merchants.google.com/mc/products/diagnostics?a={merchant_id}"
                        )

                        result.issues.append(
                            AuditIssue(
                                id=f"gmc_rejection_{reason_code}",
                                audit_type=AuditType.MERCHANT_CENTER,
                                severity="high" if count > 5 else "medium",
                                title=f"❌ {count} variante(s) rejetée(s): {desc[:50]}",
                                description=f"Raison Google: {desc}",
                                details=rejection_details,
                                action_available=True,
                                action_id="open_gmc_diagnostics",
                                action_label="Ouvrir GMC",
                                action_status=ActionStatus.AVAILABLE,
                                action_url=gmc_diagnostics_url,
                            )
                        )

            # ISSUE 3: Products not published to Google channel in Shopify
            # Combine both issues into one clear breakdown
            if google_channel_found and not_published_to_google > 0:
                eligible_count = len(products_not_published_eligible)
                not_eligible_count = not_published_to_google - eligible_count

                not_pub_details = [
                    f"📊 {not_published_to_google} produits non publiés sur Google & YouTube",
                    "═" * 40,
                ]

                if eligible_count > 0:
                    not_pub_details.append(f"✅ {eligible_count} ÉLIGIBLES (prêts à publier):")
                    not_pub_details.append("   → Ont image + prix + stock")
                    not_pub_details.extend(
                        f"   • {p['title']}" for p in products_not_published_eligible[:10]
                    )
                    if eligible_count > 10:
                        not_pub_details.append(f"   ... et {eligible_count - 10} autres")

                if not_eligible_count > 0:
                    not_pub_details.append("─" * 40)
                    not_pub_details.append(f"⚠️ {not_eligible_count} NON ÉLIGIBLES:")
                    not_pub_details.append("   → Manque image, prix ou stock")
                    # Show non-eligible products (those in products_not_published but not in eligible)
                    eligible_titles = {p["title"] for p in products_not_published_eligible}
                    non_eligible = [
                        p for p in products_not_published if p["title"] not in eligible_titles
                    ]
                    not_pub_details.extend(f"   • {p['title']}" for p in non_eligible[:10])
                    if len(non_eligible) > 10:
                        not_pub_details.append(f"   ... et {len(non_eligible) - 10} autres")

                not_pub_details.append("═" * 40)
                if eligible_count > 0:
                    not_pub_details.append("🔧 Cliquez 'Publier' pour activer les éligibles")

                result.issues.append(
                    AuditIssue(
                        id="gmc_not_published_google",
                        audit_type=AuditType.MERCHANT_CENTER,
                        severity="high" if eligible_count > 0 else "medium",
                        title=f"🚫 {not_published_to_google} produits NON publiés ({eligible_count} éligibles)",
                        description=f"{eligible_count} prêts à publier, {not_eligible_count} manquent des données",
                        details=not_pub_details,
                        action_available=eligible_count > 0,
                        action_id="publish_eligible_to_google" if eligible_count > 0 else None,
                        action_label=(
                            f"Publier {eligible_count} éligibles" if eligible_count > 0 else None
                        ),
                        action_status=(
                            ActionStatus.AVAILABLE
                            if eligible_count > 0
                            else ActionStatus.NOT_AVAILABLE
                        ),
                    )
                )

            # ISSUE 4: Quality issues analysis - Explain the gap
            # Products published to Google but with quality issues
            # Shopify Google feed filters products missing: image, price, stock
            gap = (
                published_to_google - total_products if total_products < published_to_google else 0
            )

            if gap > 0 and google_channel_found:
                total_quality_issues = (
                    len(published_no_image)
                    + len(published_no_price)
                    + len(published_no_description)
                    + len(published_out_of_stock)
                )
                remaining = gap - total_quality_issues

                # Build details list - Shopify feed filtering criteria
                quality_details = [
                    f"Écart: {gap} produits publiés Shopify → absents GMC",
                    "═" * 35,
                    "FILTRÉS PAR SHOPIFY (non envoyés à GMC):",
                ]
                if published_no_image:
                    quality_details.append(f"  🖼️ {len(published_no_image)} sans image (requis)")
                if published_no_price:
                    quality_details.append(f"  💰 {len(published_no_price)} sans prix (requis)")
                if published_out_of_stock:
                    quality_details.append(
                        f"  📦 {len(published_out_of_stock)} rupture stock (requis)"
                    )
                if published_no_description:
                    quality_details.append(f"  📝 {len(published_no_description)} sans description")

                quality_details.append("─" * 35)
                quality_details.append(f"Total filtrés par Shopify: {total_quality_issues}")

                if remaining > 0:
                    quality_details.extend(
                        [
                            "─" * 35,
                            f"⏳ {remaining} en attente sync Google (24-72h)",
                        ]
                    )

                quality_details.extend(
                    [
                        "═" * 35,
                        "🔧 Corrigez image/prix/stock pour sync",
                    ]
                )

                if total_quality_issues > 0 or remaining > 0:
                    result.issues.append(
                        AuditIssue(
                            id="gmc_quality_gap_analysis",
                            audit_type=AuditType.MERCHANT_CENTER,
                            severity="high" if total_quality_issues > 50 else "medium",
                            title=f"🔍 {total_quality_issues} produits filtrés par Shopify (non envoyés à GMC)",
                            description="Le flux Shopify ne transmet pas ces produits car il manque des données requises",
                            details=quality_details,
                        )
                    )

            # Step 4: Issues Check - Use already fetched data from productstatuses
            self._update_step_status(result, "issues_check", AuditStepStatus.RUNNING)

            # Count total rejection issues from already fetched data
            issues_count = sum(len(products) for products in rejection_reasons.values())

            if issues_count > 0:
                self._update_step_status(
                    result,
                    "issues_check",
                    AuditStepStatus.WARNING,
                    result_data={
                        "issues_count": issues_count,
                        "rejection_reasons": len(rejection_reasons),
                    },
                )
            else:
                self._update_step_status(
                    result,
                    "issues_check",
                    AuditStepStatus.SUCCESS,
                    result_data={"issues_count": 0},
                )

            # Finalize
            result.status = self._overall_status(result.steps)
            result.completed_at = datetime.now(tz=UTC).isoformat()
            result.summary = {
                "merchant_id": merchant_id,
                "total_products": total_products,
                "approved": approved,
                "disapproved": disapproved,
                "pending": pending,
                "issues_count": len(result.issues),
                "google_channel": {
                    "found": google_pub_status.get("google_channel_found", False),
                    "published": google_pub_status.get("published_to_google", 0),
                    "not_published": google_pub_status.get("not_published_to_google", 0),
                },
                # Structured KPI data for frontend visualization
                "kpi": {
                    "shopify_total": total_shopify_products,
                    "google_channel_published": published_to_google,
                    "google_channel_not_published": not_published_to_google,
                    "gmc_received": total_products,
                    "gmc_approved": approved,
                    "gmc_pending": pending,
                    "gmc_disapproved": disapproved,
                },
            }

        except ImportError:
            self._update_step_status(
                result,
                "gmc_connection",
                AuditStepStatus.ERROR,
                error_message="google-auth library non installée",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
        except Exception as e:
            result.status = AuditStepStatus.ERROR
            result.issues.append(
                AuditIssue(
                    id="gmc_audit_error",
                    audit_type=AuditType.MERCHANT_CENTER,
                    severity="critical",
                    title="Erreur d'audit GMC",
                    description=str(e),
                )
            )
            result.completed_at = datetime.now(tz=UTC).isoformat()

        self._save_current_session()
        return result

    def run_gsc_audit(self) -> AuditResult:
        """Run the Google Search Console audit with step-by-step progress."""
        result = self.start_audit(AuditType.SEARCH_CONSOLE)

        # Get GSC config from ConfigService
        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        gsc_config = self._config_service.get_search_console_values()
        site_url = gsc_config.get("property_url", "")

        # Step 1: GSC Connection
        self._update_step_status(result, "gsc_connection", AuditStepStatus.RUNNING)

        if not site_url:
            self._update_step_status(
                result,
                "gsc_connection",
                AuditStepStatus.ERROR,
                error_message="GOOGLE_SEARCH_CONSOLE_PROPERTY non configuré. Allez dans Settings > Search Console.",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
            self._save_current_session()
            return result

        try:
            from pathlib import Path

            from google.oauth2 import service_account

            creds_path = gsc_config.get("service_account_key_path", "")
            if not creds_path or not Path(creds_path).exists():
                self._update_step_status(
                    result,
                    "gsc_connection",
                    AuditStepStatus.ERROR,
                    error_message="Fichier credentials Google non trouvé",
                )
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                result.completed_at = datetime.now(tz=UTC).isoformat()
                self._save_current_session()
                return result

            credentials = service_account.Credentials.from_service_account_file(
                creds_path,
                scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
            )

            from urllib.parse import quote

            import requests
            from google.auth.transport.requests import Request

            credentials.refresh(Request())

            headers = {"Authorization": f"Bearer {credentials.token}"}

            # Test connection
            encoded_site = quote(site_url, safe="")
            resp = requests.get(
                f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}",
                headers=headers,
                timeout=10,
            )

            if resp.status_code == 200:
                self._update_step_status(
                    result,
                    "gsc_connection",
                    AuditStepStatus.SUCCESS,
                    result_data={"site_url": site_url},
                )
            else:
                self._update_step_status(
                    result,
                    "gsc_connection",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur API GSC: {resp.status_code}",
                )
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                result.completed_at = datetime.now(tz=UTC).isoformat()
                self._save_current_session()
                return result

            # Step 2: Indexation Coverage
            self._update_step_status(result, "indexation", AuditStepStatus.RUNNING)

            # Get indexed pages via search analytics
            from datetime import timedelta

            end_date = datetime.now(tz=UTC).date()
            start_date = end_date - timedelta(days=28)

            search_resp = requests.post(
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

            indexed_pages = 0
            if search_resp.status_code == 200:
                rows = search_resp.json().get("rows", [])
                indexed_pages = len(rows)

                # Get Shopify pages count (products + collections + pages)
                from services.shopify_analytics import ShopifyAnalyticsService

                shopify = ShopifyAnalyticsService()
                shopify_products = len(shopify._fetch_all_products(only_published=True))
                # Estimate total pages (products + collections + static)
                estimated_pages = shopify_products + 20  # rough estimate

                if indexed_pages >= estimated_pages * 0.8:
                    self._update_step_status(
                        result,
                        "indexation",
                        AuditStepStatus.SUCCESS,
                        result_data={"indexed": indexed_pages, "estimated_total": estimated_pages},
                    )
                else:
                    self._update_step_status(
                        result,
                        "indexation",
                        AuditStepStatus.WARNING,
                        result_data={"indexed": indexed_pages, "estimated_total": estimated_pages},
                    )
                    result.issues.append(
                        AuditIssue(
                            id="gsc_low_indexation",
                            audit_type=AuditType.SEARCH_CONSOLE,
                            severity="warning",
                            title="Couverture d'indexation faible",
                            description=f"Seulement {indexed_pages} pages indexées sur ~{estimated_pages} estimées",
                        )
                    )
            else:
                self._update_step_status(
                    result,
                    "indexation",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur API: {search_resp.status_code}",
                )

            # Step 3: Crawl Errors
            self._update_step_status(result, "errors", AuditStepStatus.RUNNING)

            # Note: URL Inspection API requires individual URL checks
            # For now, we'll check for 404s in search analytics (pages with 0 clicks/impressions)
            errors_found = 0

            # Simple heuristic: pages in GSC data with 0 impressions might have issues
            if search_resp.status_code == 200:
                rows = search_resp.json().get("rows", [])
                low_impression_pages = [r for r in rows if r.get("impressions", 0) == 0]
                errors_found = len(low_impression_pages)

            if errors_found > 10:
                self._update_step_status(
                    result,
                    "errors",
                    AuditStepStatus.WARNING,
                    result_data={"potential_issues": errors_found},
                )
                result.issues.append(
                    AuditIssue(
                        id="gsc_potential_errors",
                        audit_type=AuditType.SEARCH_CONSOLE,
                        severity="medium",
                        title=f"{errors_found} pages à vérifier",
                        description="Plusieurs pages ont 0 impressions - vérifiez leur indexation",
                    )
                )
            else:
                self._update_step_status(
                    result,
                    "errors",
                    AuditStepStatus.SUCCESS,
                    result_data={"potential_issues": errors_found},
                )

            # Step 4: Sitemaps
            self._update_step_status(result, "sitemaps", AuditStepStatus.RUNNING)

            sitemaps_resp = requests.get(
                f"https://searchconsole.googleapis.com/webmasters/v3/sites/{encoded_site}/sitemaps",
                headers=headers,
                timeout=10,
            )

            if sitemaps_resp.status_code == 200:
                sitemaps = sitemaps_resp.json().get("sitemap", [])
                sitemap_count = len(sitemaps)

                if sitemap_count > 0:
                    # Check for errors in sitemaps
                    has_errors = any(int(s.get("errors", 0) or 0) > 0 for s in sitemaps)
                    if has_errors:
                        self._update_step_status(
                            result,
                            "sitemaps",
                            AuditStepStatus.WARNING,
                            result_data={"count": sitemap_count, "has_errors": True},
                        )
                        result.issues.append(
                            AuditIssue(
                                id="gsc_sitemap_errors",
                                audit_type=AuditType.SEARCH_CONSOLE,
                                severity="warning",
                                title="Erreurs dans les sitemaps",
                                description="Des erreurs ont été détectées dans vos sitemaps",
                            )
                        )
                    else:
                        self._update_step_status(
                            result,
                            "sitemaps",
                            AuditStepStatus.SUCCESS,
                            result_data={"count": sitemap_count, "has_errors": False},
                        )
                else:
                    self._update_step_status(
                        result,
                        "sitemaps",
                        AuditStepStatus.WARNING,
                        result_data={"count": 0},
                    )
                    result.issues.append(
                        AuditIssue(
                            id="gsc_no_sitemap",
                            audit_type=AuditType.SEARCH_CONSOLE,
                            severity="warning",
                            title="Aucun sitemap soumis",
                            description="Soumettez votre sitemap Shopify à Google Search Console",
                        )
                    )
            else:
                self._update_step_status(
                    result,
                    "sitemaps",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur API: {sitemaps_resp.status_code}",
                )

            # Finalize
            result.status = self._overall_status(result.steps)
            result.completed_at = datetime.now(tz=UTC).isoformat()
            result.summary = {
                "site_url": site_url,
                "indexed_pages": indexed_pages,
                "issues_count": len(result.issues),
            }

        except ImportError:
            self._update_step_status(
                result,
                "gsc_connection",
                AuditStepStatus.ERROR,
                error_message="google-auth library non installée",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
        except Exception as e:
            result.status = AuditStepStatus.ERROR
            result.issues.append(
                AuditIssue(
                    id="gsc_audit_error",
                    audit_type=AuditType.SEARCH_CONSOLE,
                    severity="critical",
                    title="Erreur d'audit GSC",
                    description=str(e),
                )
            )
            result.completed_at = datetime.now(tz=UTC).isoformat()

        self._save_current_session()
        return result

    def run_onboarding_audit(self) -> AuditResult:
        """Run the onboarding audit - checks all service configurations.

        This audit verifies that all necessary Ads and SEO services are properly
        configured in Shopify before users can run detailed audits.
        """
        result = self.start_audit(AuditType.ONBOARDING)

        # Define steps for onboarding
        result.steps = [
            AuditStep(
                id="shopify_connection",
                name="Connexion Shopify",
                description="Vérification de l'accès à votre boutique Shopify",
            ),
            AuditStep(
                id="ga4_config",
                name="Google Analytics 4",
                description="Vérification de la configuration GA4",
            ),
            AuditStep(
                id="meta_config",
                name="Meta Pixel",
                description="Vérification de la configuration Meta/Facebook",
            ),
            AuditStep(
                id="gmc_config",
                name="Merchant Center",
                description="Vérification de la configuration GMC",
            ),
            AuditStep(
                id="gsc_config",
                name="Search Console",
                description="Vérification de la configuration GSC",
            ),
        ]
        self._save_current_session()

        services_configured = 0
        services_total = 5

        # Step 1: Shopify Connection
        self._update_step_status(result, "shopify_connection", AuditStepStatus.RUNNING)

        if self._config_service is None:
            from services.config_service import ConfigService

            self._config_service = ConfigService()

        shopify_config = self._config_service.get_shopify_values()
        shopify_ok = bool(shopify_config.get("store_url") and shopify_config.get("access_token"))

        if shopify_ok:
            # Test actual connection
            try:
                import requests

                store_url = shopify_config["store_url"]
                # Remove protocol prefix if present
                store_url = store_url.replace("https://", "").replace("http://", "").rstrip("/")
                token = shopify_config["access_token"]
                resp = requests.get(
                    f"https://{store_url}/admin/api/2024-01/shop.json",
                    headers={"X-Shopify-Access-Token": token},
                    timeout=10,
                )
                if resp.status_code == 200:
                    shop_name = resp.json().get("shop", {}).get("name", "")
                    self._update_step_status(
                        result,
                        "shopify_connection",
                        AuditStepStatus.SUCCESS,
                        result_data={"shop_name": shop_name},
                    )
                    services_configured += 1
                else:
                    self._update_step_status(
                        result,
                        "shopify_connection",
                        AuditStepStatus.ERROR,
                        error_message=f"Token invalide (erreur {resp.status_code})",
                    )
                    result.issues.append(
                        AuditIssue(
                            id="shopify_invalid_token",
                            audit_type=AuditType.ONBOARDING,
                            severity="critical",
                            title="Token Shopify invalide",
                            description=(
                                "Le token d'accès Shopify est invalide ou expiré. "
                                "Régénérez-le dans Shopify Admin > Apps > Développer des apps."
                            ),
                            action_available=True,
                            action_id="configure_shopify",
                            action_label="Configurer",
                            action_status=ActionStatus.AVAILABLE,
                            action_url="/settings",
                        )
                    )
            except Exception as e:
                self._update_step_status(
                    result,
                    "shopify_connection",
                    AuditStepStatus.ERROR,
                    error_message=str(e),
                )
        else:
            self._update_step_status(
                result,
                "shopify_connection",
                AuditStepStatus.ERROR,
                error_message="Non configuré",
            )
            result.issues.append(
                AuditIssue(
                    id="shopify_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="critical",
                    title="Shopify non configuré",
                    description=(
                        "Configurez l'accès à votre boutique Shopify pour activer "
                        "tous les audits. Vous aurez besoin de l'URL de la boutique "
                        "et d'un token d'accès Admin API."
                    ),
                    details=[
                        "1. Allez dans Shopify Admin > Apps > Développer des apps",
                        "2. Créez une app avec les permissions nécessaires",
                        "3. Copiez l'Admin API access token",
                    ],
                    action_available=True,
                    action_id="configure_shopify",
                    action_label="Configurer",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )

        # Step 2: GA4 Configuration
        self._update_step_status(result, "ga4_config", AuditStepStatus.RUNNING)

        ga4_config = self._config_service.get_ga4_values()
        ga4_measurement_id = ga4_config.get("measurement_id", "")

        # If not configured, try to detect from theme
        detected_ga4_id = None
        ga4_via_custom_pixels = False
        ga4_visitors = 0
        if not ga4_measurement_id and self.theme_analyzer:
            try:
                analysis = self.theme_analyzer.analyze_theme()
                if analysis.ga4_configured and analysis.ga4_measurement_id:
                    detected_ga4_id = analysis.ga4_measurement_id
            except Exception:
                pass

        # If still not found, check if GA4 is receiving data via Custom Pixels/GTM
        if not ga4_measurement_id and not detected_ga4_id:
            try:
                from services.ga4_analytics import GA4AnalyticsService

                ga4_service = GA4AnalyticsService(self._config_service)
                if ga4_service.is_available():
                    metrics = ga4_service.get_funnel_metrics(days=7, force_refresh=True)
                    ga4_visitors = metrics.get("visitors") or 0
                    if ga4_visitors > 0:
                        ga4_via_custom_pixels = True
            except Exception:
                pass

        if ga4_measurement_id and ga4_measurement_id.startswith("G-"):
            self._update_step_status(
                result,
                "ga4_config",
                AuditStepStatus.SUCCESS,
                result_data={"measurement_id": ga4_measurement_id},
            )
            services_configured += 1
        elif detected_ga4_id:
            # Found GA4 in theme but not configured in our system
            self._update_step_status(
                result,
                "ga4_config",
                AuditStepStatus.WARNING,
                result_data={"detected_in_theme": detected_ga4_id},
                error_message=f"Détecté: {detected_ga4_id}",
            )
            result.issues.append(
                AuditIssue(
                    id="ga4_detected_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="low",
                    title=f"GA4 détecté dans le thème: {detected_ga4_id}",
                    description=(
                        f"Un ID GA4 ({detected_ga4_id}) a été trouvé dans votre thème Shopify. "
                        "Ajoutez-le dans Configuration pour activer les audits de tracking avancés."
                    ),
                    details=[
                        f"ID détecté: {detected_ga4_id}",
                        "Pour activer les audits GA4 détaillés, ajoutez cet ID dans Configuration > GA4",
                    ],
                    action_available=True,
                    action_id="configure_ga4",
                    action_label="Ajouter",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )
            services_configured += 1  # Count as partially configured
        elif ga4_via_custom_pixels:
            # GA4 is receiving data via Custom Pixels or GTM (not in theme)
            self._update_step_status(
                result,
                "ga4_config",
                AuditStepStatus.SUCCESS,
                result_data={"via_custom_pixels": True, "visitors_7d": ga4_visitors},
            )
            result.issues.append(
                AuditIssue(
                    id="ga4_via_custom_pixels",
                    audit_type=AuditType.ONBOARDING,
                    severity="info",
                    title="GA4 actif via Custom Pixels",
                    description=(
                        f"GA4 n'est pas dans le thème mais reçoit des données "
                        f"({ga4_visitors} visiteurs ces 7 derniers jours). "
                        "Installation via Shopify Customer Events ou GTM détectée."
                    ),
                    action_available=False,
                )
            )
            services_configured += 1
        else:
            self._update_step_status(
                result,
                "ga4_config",
                AuditStepStatus.WARNING,
                error_message="Non configuré",
            )
            result.issues.append(
                AuditIssue(
                    id="ga4_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="high",
                    title="GA4 non configuré",
                    description=(
                        "Google Analytics 4 permet de suivre le comportement des visiteurs "
                        "et les conversions. Configurez-le pour activer les audits de tracking."
                    ),
                    details=[
                        "1. Créez une propriété GA4 sur analytics.google.com",
                        "2. Récupérez le Measurement ID (format: G-XXXXXXXXX)",
                        "3. Installez le tag dans votre thème Shopify ou via GTM",
                        "4. Ajoutez l'ID dans Configuration > GA4",
                    ],
                    action_available=True,
                    action_id="configure_ga4",
                    action_label="Configurer",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )

        # Step 3: Meta Pixel Configuration
        self._update_step_status(result, "meta_config", AuditStepStatus.RUNNING)

        meta_config = self._config_service.get_meta_values()
        meta_pixel_id = meta_config.get("pixel_id", "")
        meta_access_token = meta_config.get("access_token", "")

        if meta_pixel_id and meta_access_token:
            # Test Meta API connection and check pixel activity
            try:
                import requests

                resp = requests.get(
                    f"https://graph.facebook.com/v19.0/{meta_pixel_id}",
                    params={
                        "fields": "id,name,is_unavailable,last_fired_time",
                        "access_token": meta_access_token,
                    },
                    timeout=10,
                )
                if resp.status_code == 200:
                    pixel_data = resp.json()
                    pixel_name = pixel_data.get("name", "")
                    last_fired = pixel_data.get("last_fired_time", "")
                    is_unavailable = pixel_data.get("is_unavailable", False)

                    if is_unavailable:
                        self._update_step_status(
                            result,
                            "meta_config",
                            AuditStepStatus.WARNING,
                            result_data={"pixel_id": meta_pixel_id, "pixel_name": pixel_name},
                            error_message="Pixel désactivé",
                        )
                        result.issues.append(
                            AuditIssue(
                                id="meta_pixel_disabled",
                                audit_type=AuditType.ONBOARDING,
                                severity="high",
                                title="Meta Pixel désactivé",
                                description=(
                                    f"Le pixel '{pixel_name}' existe mais est marqué comme "
                                    "indisponible. Vérifiez sa configuration dans Meta Business Suite."
                                ),
                                action_available=True,
                                action_id="open_meta_events",
                                action_label="Ouvrir Meta Events",
                                action_status=ActionStatus.AVAILABLE,
                                action_url="https://business.facebook.com/events_manager",
                            )
                        )
                    elif last_fired:
                        # Pixel is active and firing
                        self._update_step_status(
                            result,
                            "meta_config",
                            AuditStepStatus.SUCCESS,
                            result_data={
                                "pixel_id": meta_pixel_id,
                                "pixel_name": pixel_name,
                                "last_fired": last_fired,
                            },
                        )
                        services_configured += 1
                    else:
                        # Pixel exists but no recent activity
                        self._update_step_status(
                            result,
                            "meta_config",
                            AuditStepStatus.WARNING,
                            result_data={"pixel_id": meta_pixel_id, "pixel_name": pixel_name},
                            error_message="Aucune activité récente",
                        )
                        result.issues.append(
                            AuditIssue(
                                id="meta_pixel_inactive",
                                audit_type=AuditType.ONBOARDING,
                                severity="medium",
                                title="Meta Pixel inactif",
                                description=(
                                    f"Le pixel '{pixel_name}' est configuré mais n'a pas "
                                    "reçu d'événements récemment. Vérifiez qu'il est bien "
                                    "installé sur votre site."
                                ),
                                action_available=True,
                                action_id="open_meta_events",
                                action_label="Diagnostiquer",
                                action_status=ActionStatus.AVAILABLE,
                                action_url="https://business.facebook.com/events_manager",
                            )
                        )
                        services_configured += 1  # Still count as configured
                else:
                    self._update_step_status(
                        result,
                        "meta_config",
                        AuditStepStatus.WARNING,
                        error_message="Token invalide ou expiré",
                    )
                    result.issues.append(
                        AuditIssue(
                            id="meta_invalid_token",
                            audit_type=AuditType.ONBOARDING,
                            severity="high",
                            title="Token Meta invalide",
                            description=(
                                "Le META_ACCESS_TOKEN est invalide ou expiré. "
                                "Régénérez-le dans Meta Business Suite > Paramètres > "
                                "Utilisateurs > Tokens d'accès système."
                            ),
                            action_available=True,
                            action_id="configure_meta",
                            action_label="Configurer",
                            action_status=ActionStatus.AVAILABLE,
                            action_url="/settings",
                        )
                    )
            except Exception as e:
                self._update_step_status(
                    result,
                    "meta_config",
                    AuditStepStatus.WARNING,
                    error_message=f"Erreur: {str(e)[:50]}",
                )
        else:
            self._update_step_status(
                result,
                "meta_config",
                AuditStepStatus.WARNING,
                error_message="Non configuré",
            )
            result.issues.append(
                AuditIssue(
                    id="meta_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="high",
                    title="Meta Pixel non configuré",
                    description=(
                        "Le Meta Pixel permet de tracker les conversions Facebook/Instagram "
                        "et d'optimiser vos campagnes publicitaires."
                    ),
                    details=[
                        "1. Récupérez votre Pixel ID depuis Meta Business Suite > Events Manager",
                        "2. Générez un Access Token dans Paramètres > Tokens d'accès système",
                        "3. Ajoutez ces valeurs dans Configuration > Meta",
                        "Note: Le pixel peut déjà être installé via Shopify, il suffit de le connecter ici",
                    ],
                    action_available=True,
                    action_id="configure_meta",
                    action_label="Configurer",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )

        # Step 4: Google Merchant Center Configuration
        self._update_step_status(result, "gmc_config", AuditStepStatus.RUNNING)

        gmc_config = self._config_service.get_merchant_center_values()
        gmc_merchant_id = gmc_config.get("merchant_id", "")

        if gmc_merchant_id:
            self._update_step_status(
                result,
                "gmc_config",
                AuditStepStatus.SUCCESS,
                result_data={"merchant_id": gmc_merchant_id},
            )
            services_configured += 1
        else:
            self._update_step_status(
                result,
                "gmc_config",
                AuditStepStatus.WARNING,
                error_message="Non configuré",
            )
            result.issues.append(
                AuditIssue(
                    id="gmc_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="medium",
                    title="Google Merchant Center non configuré",
                    description=(
                        "GMC permet de diffuser vos produits sur Google Shopping "
                        "et dans les résultats de recherche (listings gratuits et payants)."
                    ),
                    details=[
                        "1. Créez un compte sur merchants.google.com",
                        "2. Connectez votre boutique via l'app Google Channel dans Shopify",
                        "3. Vérifiez que vos produits sont synchronisés",
                        "Note: L'app Google & YouTube de Shopify simplifie cette configuration",
                    ],
                    action_available=True,
                    action_id="configure_gmc",
                    action_label="Configurer",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )

        # Step 5: Google Search Console Configuration
        self._update_step_status(result, "gsc_config", AuditStepStatus.RUNNING)

        gsc_config = self._config_service.get_search_console_values()
        gsc_property_url = gsc_config.get("property_url", "")

        if gsc_property_url:
            self._update_step_status(
                result,
                "gsc_config",
                AuditStepStatus.SUCCESS,
                result_data={"property_url": gsc_property_url},
            )
            services_configured += 1
        else:
            self._update_step_status(
                result,
                "gsc_config",
                AuditStepStatus.WARNING,
                error_message="Non configuré",
            )
            result.issues.append(
                AuditIssue(
                    id="gsc_not_configured",
                    audit_type=AuditType.ONBOARDING,
                    severity="medium",
                    title="Google Search Console non configuré",
                    description=(
                        "GSC permet de suivre votre visibilité dans les résultats de recherche "
                        "Google et d'identifier les problèmes d'indexation."
                    ),
                    details=[
                        "1. Ajoutez votre site sur search.google.com/search-console",
                        "2. Vérifiez la propriété via DNS ou fichier HTML",
                        "3. Soumettez votre sitemap (sitemap.xml)",
                        "Note: Shopify génère automatiquement un sitemap",
                    ],
                    action_available=True,
                    action_id="configure_gsc",
                    action_label="Configurer",
                    action_status=ActionStatus.AVAILABLE,
                    action_url="/settings",
                )
            )

        # Finalize
        result.status = self._overall_status(result.steps)
        result.completed_at = datetime.now(tz=UTC).isoformat()

        # Build summary with available audits based on configuration
        available_audits = []
        if shopify_ok:
            if ga4_measurement_id:
                available_audits.extend(["theme_code", "ga4_tracking"])
            if meta_pixel_id and meta_access_token:
                available_audits.append("meta_pixel")
            if gmc_merchant_id:
                available_audits.append("merchant_center")
            if gsc_property_url:
                available_audits.append("search_console")

        result.summary = {
            "services_configured": services_configured,
            "services_total": services_total,
            "completion_rate": int((services_configured / services_total) * 100),
            "available_audits": available_audits,
            "issues_count": len(result.issues),
        }

        # Add completion message issue if all configured
        if services_configured == services_total:
            result.issues.insert(
                0,
                AuditIssue(
                    id="onboarding_complete",
                    audit_type=AuditType.ONBOARDING,
                    severity="info",
                    title="🎉 Configuration complète !",
                    description=(
                        "Tous vos services Ads et SEO sont configurés. "
                        "Vous pouvez maintenant lancer les audits détaillés."
                    ),
                ),
            )

        self._save_current_session()
        return result

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

        for step_data in data.get("steps", []):
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
