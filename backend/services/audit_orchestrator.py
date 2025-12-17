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

    GA4_TRACKING = "ga4_tracking"
    META_PIXEL = "meta_pixel"
    MERCHANT_CENTER = "merchant_center"
    SEARCH_CONSOLE = "search_console"
    THEME_CODE = "theme_code"


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
                id="catalog_sync",
                name="Catalogue Facebook",
                description="Vérification de la synchronisation du catalogue",
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
                # GA4 not detected at all (neither in theme nor via Shopify native)
                # Offer to add via snippet (safe method)
                ga4_id = self._get_ga4_measurement_id()
                if ga4_id:
                    description = (
                        f"Aucun code GA4 détecté. "
                        f"Option 1: Configurez {ga4_id} dans Shopify > Online Store > Preferences. "
                        f"Option 2: Cliquez pour ajouter {ga4_id} via un snippet (réversible)."
                    )
                    action_available = True
                else:
                    description = (
                        "Aucun code GA4 détecté et GA4_MEASUREMENT_ID non configuré dans Settings. "
                        "Configurez GA4 dans Shopify > Online Store > Preferences ou dans Settings > GA4."
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
                        severity="low",
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

            # Convert theme analyzer issues to audit issues
            for i, issue in enumerate(analysis.issues):
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

            has_issues = len(analysis.issues) > 0
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
        pixel_id = meta_config.get("pixel_id", "")
        access_token = meta_config.get("access_token", "")

        # Step 1: Meta Connection
        self._update_step_status(result, "meta_connection", AuditStepStatus.RUNNING)

        if not pixel_id:
            self._update_step_status(
                result,
                "meta_connection",
                AuditStepStatus.ERROR,
                error_message="Meta Pixel ID non configuré. Allez dans Settings > Meta.",
            )
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            result.completed_at = datetime.now(tz=UTC).isoformat()
            self._save_current_session()
            return result

        self._update_step_status(
            result,
            "meta_connection",
            AuditStepStatus.SUCCESS,
            result_data={"pixel_id": pixel_id, "has_token": bool(access_token)},
        )

        # Step 2: Pixel Configuration (check in theme)
        self._update_step_status(result, "pixel_config", AuditStepStatus.RUNNING)

        pixel_in_theme = False
        if self.theme_analyzer:
            analysis = self.theme_analyzer.analyze_theme()
            pixel_in_theme = analysis.meta_pixel_configured
            theme_pixel_id = analysis.meta_pixel_id

        if pixel_in_theme:
            if theme_pixel_id == pixel_id:
                self._update_step_status(
                    result,
                    "pixel_config",
                    AuditStepStatus.SUCCESS,
                    result_data={"pixel_in_theme": True, "pixel_match": True},
                )
            else:
                self._update_step_status(
                    result,
                    "pixel_config",
                    AuditStepStatus.WARNING,
                    result_data={"pixel_in_theme": True, "pixel_match": False},
                )
                result.issues.append(
                    AuditIssue(
                        id="meta_pixel_mismatch",
                        audit_type=AuditType.META_PIXEL,
                        severity="warning",
                        title="ID Pixel différent",
                        description=f"Le Pixel dans le thème ({theme_pixel_id}) est différent de celui configuré ({pixel_id})",
                    )
                )
        else:
            self._update_step_status(
                result,
                "pixel_config",
                AuditStepStatus.WARNING,
                result_data={"pixel_in_theme": False},
            )
            result.issues.append(
                AuditIssue(
                    id="meta_pixel_not_installed",
                    audit_type=AuditType.META_PIXEL,
                    severity="error",
                    title="Meta Pixel non installé",
                    description=f"Le Meta Pixel {pixel_id} n'est pas détecté dans le thème Shopify",
                    action_available=False,
                    action_label="Installer le Pixel",
                )
            )

        # Step 3: Events Check (from theme analysis)
        self._update_step_status(result, "events_check", AuditStepStatus.RUNNING)

        meta_events_found = []
        required_events = ["PageView", "ViewContent", "AddToCart", "InitiateCheckout", "Purchase"]

        if self.theme_analyzer:
            meta_events_found = analysis.meta_events_found

        missing_events = [e for e in required_events if e not in meta_events_found]

        if not missing_events:
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
                result_data={"events_found": meta_events_found, "coverage": f"{coverage}%"},
            )
            for event in missing_events:
                severity = "error" if event in ["Purchase", "AddToCart"] else "warning"
                result.issues.append(
                    AuditIssue(
                        id=f"meta_missing_{event.lower()}",
                        audit_type=AuditType.META_PIXEL,
                        severity=severity,
                        title=f"Événement {event} manquant",
                        description=f"L'événement Meta '{event}' n'est pas tracké",
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
                    description="Aucun événement de conversion n'est tracké avec le Meta Pixel",
                )
            )

        # Step 4: Catalog Sync (requires access token)
        self._update_step_status(result, "catalog_sync", AuditStepStatus.RUNNING)

        if not access_token:
            self._update_step_status(
                result,
                "catalog_sync",
                AuditStepStatus.SKIPPED,
                error_message="META_ACCESS_TOKEN non configuré - synchronisation catalogue non vérifiable",
            )
            result.issues.append(
                AuditIssue(
                    id="meta_no_token",
                    audit_type=AuditType.META_PIXEL,
                    severity="medium",
                    title="Token Meta manquant",
                    description="Configurez META_ACCESS_TOKEN pour vérifier la synchronisation du catalogue Facebook",
                )
            )
        else:
            # Try to check catalog via Meta API
            try:
                import requests

                ad_account_id = meta_config.get("ad_account_id", "")
                if ad_account_id:
                    url = f"https://graph.facebook.com/v18.0/act_{ad_account_id}/product_catalogs"
                    resp = requests.get(url, params={"access_token": access_token}, timeout=10)
                    if resp.status_code == 200:
                        catalogs = resp.json().get("data", [])
                        self._update_step_status(
                            result,
                            "catalog_sync",
                            AuditStepStatus.SUCCESS,
                            result_data={"catalogs_count": len(catalogs)},
                        )
                    else:
                        self._update_step_status(
                            result,
                            "catalog_sync",
                            AuditStepStatus.WARNING,
                            error_message=f"Erreur API Meta: {resp.status_code}",
                        )
                else:
                    self._update_step_status(
                        result,
                        "catalog_sync",
                        AuditStepStatus.SKIPPED,
                        error_message="META_AD_ACCOUNT_ID non configuré",
                    )
            except Exception as e:
                self._update_step_status(
                    result,
                    "catalog_sync",
                    AuditStepStatus.ERROR,
                    error_message=str(e),
                )

        # Finalize
        result.status = self._overall_status(result.steps)
        result.completed_at = datetime.now(tz=UTC).isoformat()
        result.summary = {
            "pixel_id": pixel_id,
            "pixel_in_theme": pixel_in_theme,
            "events_found": meta_events_found,
            "events_missing": missing_events,
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

            # Step 2: Products Status
            self._update_step_status(result, "products_status", AuditStepStatus.RUNNING)

            products_resp = requests.get(
                f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/products",
                headers=headers,
                timeout=30,
            )

            if products_resp.status_code == 200:
                products_data = products_resp.json()
                products = products_data.get("resources", [])
                total_products = len(products)

                # Count by status
                approved = sum(
                    1
                    for p in products
                    if p.get("destinations", [{}])[0].get("status") == "approved"
                )
                disapproved = sum(
                    1
                    for p in products
                    if p.get("destinations", [{}])[0].get("status") == "disapproved"
                )
                pending = total_products - approved - disapproved

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
                    result.issues.append(
                        AuditIssue(
                            id="gmc_disapproved_products",
                            audit_type=AuditType.MERCHANT_CENTER,
                            severity="error",
                            title=f"{disapproved} produits rejetés",
                            description=f"{disapproved} produits sont rejetés par Google Merchant Center",
                        )
                    )
                else:
                    self._update_step_status(
                        result,
                        "products_status",
                        AuditStepStatus.SUCCESS,
                        result_data={
                            "total": total_products,
                            "approved": approved,
                            "disapproved": 0,
                            "pending": pending,
                        },
                    )
            else:
                self._update_step_status(
                    result,
                    "products_status",
                    AuditStepStatus.ERROR,
                    error_message=f"Erreur lecture produits: {products_resp.status_code}",
                )

            # Step 3: Feed Sync (compare with Shopify)
            self._update_step_status(result, "feed_sync", AuditStepStatus.RUNNING)

            # Get Shopify products with full details for GMC analysis
            from services.shopify_analytics import ShopifyAnalyticsService

            shopify = ShopifyAnalyticsService()
            shopify_products_list = shopify.fetch_products_for_gmc_audit()
            shopify_products = len(shopify_products_list)

            # Get Google Shopping publication status from Shopify
            google_pub_status = shopify.fetch_products_google_shopping_status()

            if shopify_products > 0 and total_products > 0:
                sync_rate = int((total_products / shopify_products) * 100)
                if sync_rate >= 90:
                    self._update_step_status(
                        result,
                        "feed_sync",
                        AuditStepStatus.SUCCESS,
                        result_data={
                            "shopify": shopify_products,
                            "gmc": total_products,
                            "sync_rate": f"{sync_rate}%",
                        },
                    )
                else:
                    # Analyze product eligibility for GMC sync
                    missing = shopify_products - total_products

                    # Count products by eligibility criteria
                    no_price = 0
                    no_image = 0
                    no_description = 0
                    draft_products = 0
                    eligible_products = 0  # Products with all required fields

                    for product in shopify_products_list:
                        has_price = False
                        has_image = bool(product.get("featuredImage"))
                        has_description = bool(
                            product.get("descriptionHtml") or product.get("description")
                        )
                        is_draft = product.get("status") == "DRAFT"

                        # Check price from variants
                        variants = product.get("variants", {}).get("nodes", [])
                        if variants:
                            has_price = any(float(v.get("price", 0) or 0) > 0 for v in variants)

                        # Count missing attributes
                        if not has_price:
                            no_price += 1
                        if not has_image:
                            no_image += 1
                        if not has_description:
                            no_description += 1
                        if is_draft:
                            draft_products += 1

                        # Count eligible products (has price, image, description, not draft)
                        if has_price and has_image and has_description and not is_draft:
                            eligible_products += 1

                    # Calculate ineligible products
                    ineligible_products = shopify_products - eligible_products

                    # Build detailed analysis
                    analysis_details = []
                    analysis_details.append(
                        f"{eligible_products} produits éligibles GMC (avec prix, image, description)"
                    )
                    if ineligible_products > 0:
                        analysis_details.append(f"{ineligible_products} produits non éligibles:")
                    if no_price > 0:
                        analysis_details.append(f"  • {no_price} sans prix")
                    if no_image > 0:
                        analysis_details.append(f"  • {no_image} sans image")
                    if no_description > 0:
                        analysis_details.append(f"  • {no_description} sans description")
                    if draft_products > 0:
                        analysis_details.append(f"  • {draft_products} en brouillon")

                    # Add Google Shopping publication status from Shopify API
                    google_channel_found = google_pub_status.get("google_channel_found", False)
                    published_to_google = google_pub_status.get("published_to_google", 0)
                    not_published_to_google = google_pub_status.get("not_published_to_google", 0)

                    if google_channel_found:
                        analysis_details.append("\n📡 Publication Google Shopping (Shopify):")
                        analysis_details.append(
                            f"  • {published_to_google} produits publiés sur le canal Google"
                        )
                        analysis_details.append(
                            f"  • {not_published_to_google} produits NON publiés"
                        )

                    # Add sync gap analysis
                    if total_products < eligible_products:
                        gap = eligible_products - total_products
                        analysis_details.append(
                            f"\n⚠️ {gap} produits éligibles ne sont PAS dans GMC"
                        )
                        if google_channel_found and not_published_to_google > 0:
                            analysis_details.append(
                                f"→ {not_published_to_google} ne sont pas publiés sur le canal Google dans Shopify"
                            )
                        analysis_details.append(
                            "Vérifiez le statut dans Shopify > Google & YouTube > Produits"
                        )

                    self._update_step_status(
                        result,
                        "feed_sync",
                        AuditStepStatus.WARNING,
                        result_data={
                            "shopify": shopify_products,
                            "gmc": total_products,
                            "sync_rate": f"{sync_rate}%",
                            "eligible": eligible_products,
                            "ineligible": ineligible_products,
                            "analysis": {
                                "no_price": no_price,
                                "no_image": no_image,
                                "no_description": no_description,
                                "draft": draft_products,
                            },
                            "google_channel": {
                                "found": google_channel_found,
                                "published": published_to_google,
                                "not_published": not_published_to_google,
                            },
                        },
                    )

                    # Create detailed issue with both synced and unsynced analysis
                    description = f"""Synchronisation GMC: {total_products}/{shopify_products} produits ({sync_rate}%)

📊 Analyse des {shopify_products} produits Shopify publiés:
• {eligible_products} éligibles GMC (ont prix + image + description)
• {ineligible_products} non éligibles (données manquantes)

🔍 Détail des données manquantes:
• {no_price} produits sans prix (ou prix = 0)
• {no_image} produits sans image principale
• {no_description} produits sans description"""

                    # Add Google Shopping publication info
                    if google_channel_found:
                        description += f"""

📡 Statut publication Google Shopping (API Shopify):
• {published_to_google} produits publiés sur le canal Google
• {not_published_to_google} produits NON publiés sur le canal"""

                    if total_products < eligible_products:
                        gap = eligible_products - total_products
                        description += f"""

⚠️ ÉCART DÉTECTÉ: {gap} produits éligibles ne sont pas dans GMC!"""
                        if google_channel_found and not_published_to_google > 0:
                            description += f"""
→ {not_published_to_google} ne sont pas publiés sur le canal Google dans Shopify
→ Activez-les dans Shopify Admin > Google & YouTube > Produits"""
                        else:
                            description += """
→ Vérifiez dans Shopify Admin > Google & YouTube > Produits
→ Certains produits peuvent être exclus ou avoir des erreurs GMC"""

                    result.issues.append(
                        AuditIssue(
                            id="gmc_sync_incomplete",
                            audit_type=AuditType.MERCHANT_CENTER,
                            severity="warning",
                            title=f"{total_products} produits synchronisés sur {eligible_products} éligibles",
                            description=description,
                            details=(
                                analysis_details[:MAX_DETAILS_ITEMS] if analysis_details else None
                            ),
                        )
                    )
            else:
                self._update_step_status(
                    result,
                    "feed_sync",
                    AuditStepStatus.WARNING,
                    result_data={"shopify": shopify_products, "gmc": total_products},
                )

            # Step 4: Issues Check
            self._update_step_status(result, "issues_check", AuditStepStatus.RUNNING)

            # Get product issues from GMC
            issues_resp = requests.get(
                f"https://shoppingcontent.googleapis.com/content/v2.1/{merchant_id}/productstatuses",
                headers=headers,
                timeout=30,
            )

            issues_count = 0
            if issues_resp.status_code == 200:
                statuses = issues_resp.json().get("resources", [])
                for status in statuses:
                    item_issues = status.get("itemLevelIssues", [])
                    issues_count += len(
                        [i for i in item_issues if i.get("servability") == "disapproved"]
                    )

            if issues_count > 0:
                self._update_step_status(
                    result,
                    "issues_check",
                    AuditStepStatus.WARNING,
                    result_data={"issues_count": issues_count},
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
                "issues_count": len(result.issues),
                "google_channel": {
                    "found": google_pub_status.get("google_channel_found", False),
                    "published": google_pub_status.get("published_to_google", 0),
                    "not_published": google_pub_status.get("not_published_to_google", 0),
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

            if action_id.startswith("fix_event_"):
                event_name = action_id.replace("fix_event_", "")
                issue.action_status = ActionStatus.FAILED
                self._save_current_session()
                error_msg = (
                    f"Correction automatique de l'événement "
                    f"'{event_name}' non encore implémentée"
                )
                return {"success": False, "error": error_msg}

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
            "audits": {k: self._result_to_dict(v) for k, v in session.audits.items()},
        }

    def _result_to_dict(self, result: AuditResult) -> dict[str, Any]:
        """Convert audit result to dict."""
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
                }
                for i in result.issues
            ],
            "summary": result.summary,
            "raw_data": result.raw_data,
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
                )
            )

        return result
