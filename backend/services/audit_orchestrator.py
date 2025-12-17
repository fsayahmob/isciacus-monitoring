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

    def get_available_audits(self) -> list[dict[str, Any]]:
        """Get list of available audit types with their status."""
        latest = self.get_latest_session()

        # Check if GA4 is configured in Settings
        ga4_measurement_id = self._get_ga4_measurement_id()
        ga4_configured = bool(ga4_measurement_id)

        # Determine availability and descriptions based on GA4 config
        if ga4_configured:
            ga4_description = (
                "Vérifie la couverture du tracking GA4 "
                "(événements, collections, produits)"
            )
            theme_description = (
                "Analyse le code du thème Shopify "
                "pour détecter les erreurs de tracking"
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
                "description": "Vérifie la configuration du Meta Pixel et le catalogue Facebook",
                "icon": "facebook",
                "available": False,  # TODO: Implement
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.MERCHANT_CENTER.value,
                "name": "Google Merchant Center",
                "description": "Vérifie les produits dans Google Shopping et leur synchronisation",
                "icon": "shopping-cart",
                "available": False,  # TODO: Implement
                "last_run": None,
                "last_status": None,
                "issues_count": 0,
            },
            {
                "type": AuditType.SEARCH_CONSOLE.value,
                "name": "Google Search Console",
                "description": "Vérifie l'indexation et la couverture SEO des pages",
                "icon": "search",
                "available": False,  # TODO: Implement
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
                "GA4 non configuré. Allez dans Settings > GA4 pour configurer votre ID de mesure (G-XXXXXXXX)."
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
            result.issues.append(AuditIssue(
                id="audit_error",
                audit_type=AuditType.GA4_TRACKING,
                severity="critical",
                title="Erreur d'audit",
                description=str(e),
            ))

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
            result.issues.append(AuditIssue(
                id="ga4_not_connected",
                audit_type=AuditType.GA4_TRACKING,
                severity="critical",
                title="GA4 non connecté",
                description="Impossible de se connecter à l'API GA4",
                action_available=False,
            ))
            for step in result.steps[1:]:
                step.status = AuditStepStatus.SKIPPED
            result.status = AuditStepStatus.ERROR
            self._save_current_session()
            return False
        return True

    def _process_collections_coverage(
        self, result: AuditResult, coll: dict[str, Any]
    ) -> None:
        """Process collections coverage step."""
        self._update_step_status(result, "collections_coverage", AuditStepStatus.RUNNING)
        coll_status = self._rate_to_status(coll.get("rate", 0))
        self._update_step_status(
            result, "collections_coverage", coll_status, result_data=coll
        )

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

            result.issues.append(AuditIssue(
                id="missing_collections",
                audit_type=AuditType.GA4_TRACKING,
                severity=severity,
                title=f"{missing_count} collections sans visite",
                description=description,
                details=coll["missing"][:MAX_DETAILS_ITEMS],
                action_available=False,
            ))

    def _process_products_coverage(
        self, result: AuditResult, prod: dict[str, Any]
    ) -> None:
        """Process products coverage step."""
        self._update_step_status(result, "products_coverage", AuditStepStatus.RUNNING)
        prod_status = self._rate_to_status(prod.get("rate", 0))
        self._update_step_status(
            result, "products_coverage", prod_status, result_data=prod
        )

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

            result.issues.append(AuditIssue(
                id="missing_products",
                audit_type=AuditType.GA4_TRACKING,
                severity=severity,
                title=f"{missing_count} produits sans vue récente",
                description=description,
                details=prod["missing"][:MAX_DETAILS_ITEMS],
                action_available=False,
            ))

    def _process_events_coverage(
        self, result: AuditResult, events: dict[str, Any]
    ) -> None:
        """Process events coverage step."""
        self._update_step_status(result, "events_coverage", AuditStepStatus.RUNNING)
        events_status = self._rate_to_status(events.get("rate", 0))
        self._update_step_status(
            result, "events_coverage", events_status, result_data=events
        )

        critical_events = ["purchase", "add_to_cart"]
        for missing_event in events.get("missing", []):
            is_critical = missing_event in critical_events
            result.issues.append(AuditIssue(
                id=f"missing_event_{missing_event}",
                audit_type=AuditType.GA4_TRACKING,
                severity="critical" if is_critical else "high",
                title=f"Événement '{missing_event}' manquant",
                description=f"L'événement GA4 {missing_event} n'est pas détecté",
                action_available=True,
                action_id=f"fix_event_{missing_event}",
                action_label="Ajouter au thème",
                action_status=ActionStatus.AVAILABLE,
            ))

    def _process_transactions_match(
        self, result: AuditResult, trans: dict[str, Any]
    ) -> None:
        """Process transactions match step."""
        self._update_step_status(result, "transactions_match", AuditStepStatus.RUNNING)
        match_rate = trans.get("match_rate", 0) * 100
        trans_status = self._rate_to_status(match_rate)
        self._update_step_status(
            result, "transactions_match", trans_status, result_data=trans
        )

        if match_rate < COVERAGE_RATE_HIGH:
            ga4_trans = trans.get("ga4_transactions", 0)
            shopify_orders = trans.get("shopify_orders", 0)
            is_critical = match_rate < COVERAGE_RATE_MEDIUM
            result.issues.append(AuditIssue(
                id="transactions_mismatch",
                audit_type=AuditType.GA4_TRACKING,
                severity="critical" if is_critical else "high",
                title=f"Écart transactions: {match_rate:.0f}%",
                description=f"{ga4_trans} GA4 vs {shopify_orders} Shopify",
                action_available=False,
            ))

    def run_theme_audit(self) -> AuditResult:
        """Run the theme code audit with step-by-step progress."""
        result = self.start_audit(AuditType.THEME_CODE)

        # Check GA4 is configured in Settings first
        ga4_measurement_id = self._get_ga4_measurement_id()
        if not ga4_measurement_id:
            self._mark_audit_unconfigured(
                result,
                "GA4 non configuré. Allez dans Settings > GA4 pour configurer votre ID de mesure (G-XXXXXXXX)."
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
                result.issues.append(AuditIssue(
                    id="theme_access_error",
                    audit_type=AuditType.THEME_CODE,
                    severity="critical",
                    title="Accès thème impossible",
                    description="Impossible d'accéder aux fichiers du thème Shopify",
                    action_available=False,
                ))
                for step in result.steps[1:]:
                    step.status = AuditStepStatus.SKIPPED
                result.status = AuditStepStatus.ERROR
                self._save_current_session()
                return result

            self._update_step_status(
                result, "theme_access", AuditStepStatus.SUCCESS,
                result_data={"files_count": len(analysis.files_analyzed)},
            )

            # Step 2: GA4 Code
            self._update_step_status(result, "ga4_code", AuditStepStatus.RUNNING)
            ga4_ok = analysis.ga4_configured
            ga4_status = AuditStepStatus.SUCCESS if ga4_ok else AuditStepStatus.WARNING
            self._update_step_status(
                result, "ga4_code", ga4_status,
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

                result.issues.append(AuditIssue(
                    id="ga4_not_in_theme",
                    audit_type=AuditType.THEME_CODE,
                    severity="critical",
                    title="GA4 non configuré",
                    description=description,
                    action_available=action_available,
                    action_id="add_ga4_base" if action_available else None,
                    action_label="Ajouter via snippet" if action_available else None,
                    action_status=ActionStatus.AVAILABLE if action_available else ActionStatus.NOT_AVAILABLE,
                ))
            elif analysis.ga4_via_shopify_native and not analysis.ga4_events_found:
                # GA4 is configured via Shopify native - inform user it's OK
                result.issues.append(AuditIssue(
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
                ))

            # Step 3: Meta Code
            self._update_step_status(result, "meta_code", AuditStepStatus.RUNNING)
            meta_ok = analysis.meta_pixel_configured
            meta_status = AuditStepStatus.SUCCESS if meta_ok else AuditStepStatus.WARNING
            self._update_step_status(
                result, "meta_code", meta_status,
                result_data={
                    "configured": analysis.meta_pixel_configured,
                    "pixel_id": analysis.meta_pixel_id,
                    "events_found": analysis.meta_events_found,
                },
            )

            # Step 4: GTM Code
            self._update_step_status(result, "gtm_code", AuditStepStatus.RUNNING)
            self._update_step_status(
                result, "gtm_code", AuditStepStatus.SUCCESS,
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
                result.issues.append(AuditIssue(
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
                ))

            has_issues = len(analysis.issues) > 0
            issues_status = AuditStepStatus.WARNING if has_issues else AuditStepStatus.SUCCESS
            self._update_step_status(
                result, "issues_detection", issues_status,
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
            result.issues.append(AuditIssue(
                id="theme_audit_error",
                audit_type=AuditType.THEME_CODE,
                severity="critical",
                title="Erreur d'audit thème",
                description=str(e),
            ))

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

    def _validate_action_request(
        self, audit_type: str, action_id: str
    ) -> dict[str, Any]:
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

        if issue.action_status != ActionStatus.AVAILABLE:
            return {
                "success": False,
                "error": f"Action non disponible (status: {issue.action_status.value})",
            }

        return {"issue": issue, "session": session}

    def _execute_action_impl(
        self, issue: AuditIssue, action_id: str
    ) -> dict[str, Any]:
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

    def _execute_theme_fix(
        self, issue: AuditIssue, action_id: str
    ) -> dict[str, Any]:
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
        error: str | None = None,
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
                step.error_message = error
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
            "audits": {
                k: self._result_to_dict(v)
                for k, v in session.audits.items()
            },
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
            result.steps.append(AuditStep(
                id=step_data.get("id", ""),
                name=step_data.get("name", ""),
                description=step_data.get("description", ""),
                status=AuditStepStatus(step_data.get("status", "pending")),
                started_at=step_data.get("started_at"),
                completed_at=step_data.get("completed_at"),
                duration_ms=step_data.get("duration_ms"),
                result=step_data.get("result"),
                error_message=step_data.get("error_message"),
            ))

        for issue_data in data.get("issues", []):
            result.issues.append(AuditIssue(
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
            ))

        return result
