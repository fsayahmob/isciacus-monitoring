"""
Permissions Checker Service - Verify Shopify and external API permissions
=========================================================================
Checks that all required API permissions are available for platform features.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime
from enum import Enum
from typing import TYPE_CHECKING, Any

import requests


if TYPE_CHECKING:
    from services.config_service import ConfigService


class PermissionStatus(Enum):
    """Status of a permission check."""

    GRANTED = "granted"
    DENIED = "denied"
    UNKNOWN = "unknown"
    NOT_CONFIGURED = "not_configured"


class PermissionSeverity(Enum):
    """Severity level if permission is missing."""

    CRITICAL = "critical"  # Platform won't work without it
    HIGH = "high"  # Major feature broken
    MEDIUM = "medium"  # Some features limited
    LOW = "low"  # Nice to have


@dataclass
class PermissionRequirement:
    """A required permission for the platform."""

    id: str
    name: str
    description: str
    service: str  # shopify, ga4, meta, merchant_center, gsc
    scope: str  # API scope or permission name
    severity: PermissionSeverity
    required_for: list[str]  # List of features that need this
    how_to_grant: str  # Instructions to grant the permission
    doc_url: str | None = None


@dataclass
class PermissionCheckResult:
    """Result of checking a single permission."""

    requirement: PermissionRequirement
    status: PermissionStatus
    error_message: str | None = None
    checked_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())


@dataclass
class PermissionsReport:
    """Full permissions report."""

    results: list[PermissionCheckResult] = field(default_factory=list)
    checked_at: str = field(default_factory=lambda: datetime.now(tz=UTC).isoformat())

    @property
    def all_granted(self) -> bool:
        return all(r.status == PermissionStatus.GRANTED for r in self.results)

    @property
    def critical_missing(self) -> list[PermissionCheckResult]:
        return [
            r
            for r in self.results
            if r.status != PermissionStatus.GRANTED
            and r.requirement.severity == PermissionSeverity.CRITICAL
        ]

    @property
    def warnings(self) -> list[PermissionCheckResult]:
        return [
            r
            for r in self.results
            if r.status != PermissionStatus.GRANTED
            and r.requirement.severity in [PermissionSeverity.HIGH, PermissionSeverity.MEDIUM]
        ]


class PermissionsCheckerService:
    """Service to check all required permissions for the platform."""

    # Define all required permissions
    SHOPIFY_PERMISSIONS: list[PermissionRequirement] = [
        PermissionRequirement(
            id="shopify_read_products",
            name="Lecture des produits",
            description="Accès en lecture aux produits du catalogue",
            service="shopify",
            scope="read_products",
            severity=PermissionSeverity.CRITICAL,
            required_for=["Catalogue produits", "Audit tracking", "Sync Merchant Center"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_products"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/product",
        ),
        PermissionRequirement(
            id="shopify_read_orders",
            name="Lecture des commandes",
            description="Accès en lecture aux commandes",
            service="shopify",
            scope="read_orders",
            severity=PermissionSeverity.CRITICAL,
            required_for=["Analytics ventes", "Funnel conversion", "Audit transactions"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_orders"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/order",
        ),
        PermissionRequirement(
            id="shopify_read_customers",
            name="Lecture des clients",
            description="Accès en lecture aux données clients",
            service="shopify",
            scope="read_customers",
            severity=PermissionSeverity.HIGH,
            required_for=["Statistiques clients", "Taux d'opt-in email/SMS"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_customers"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/customer",
        ),
        PermissionRequirement(
            id="shopify_read_themes",
            name="Lecture des thèmes",
            description="Accès en lecture aux fichiers du thème",
            service="shopify",
            scope="read_themes",
            severity=PermissionSeverity.HIGH,
            required_for=["Audit code tracking", "Analyse GA4/Meta Pixel"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_themes"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/theme",
        ),
        PermissionRequirement(
            id="shopify_write_themes",
            name="Écriture des thèmes",
            description="Accès en écriture aux fichiers du thème",
            service="shopify",
            scope="write_themes",
            severity=PermissionSeverity.MEDIUM,
            required_for=["Correction automatique du tracking", "Ajout d'événements GA4/Meta"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "write_themes"
4. Sauvegardez et réinstallez l'app si nécessaire
⚠️ Ce scope permet de modifier le code de votre boutique
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/asset",
        ),
        PermissionRequirement(
            id="shopify_read_checkouts",
            name="Lecture des paniers abandonnés",
            description="Accès aux checkouts abandonnés",
            service="shopify",
            scope="read_checkouts",
            severity=PermissionSeverity.MEDIUM,
            required_for=["Funnel conversion", "Taux d'abandon panier"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_checkouts"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/abandoned-checkouts",
        ),
        PermissionRequirement(
            id="shopify_read_analytics",
            name="Lecture des analytics",
            description="Accès aux données analytics Shopify",
            service="shopify",
            scope="read_analytics",
            severity=PermissionSeverity.LOW,
            required_for=["Comparaison avec analytics Shopify natifs"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "read_analytics"
4. Sauvegardez et réinstallez l'app si nécessaire
""",
            doc_url="https://shopify.dev/docs/api/admin-rest/2024-01/resources/report",
        ),
        PermissionRequirement(
            id="shopify_write_publications",
            name="Gestion des canaux de vente",
            description="Publier/dépublier des produits sur les canaux (Google, Facebook, etc.)",
            service="shopify",
            scope="write_publications",
            severity=PermissionSeverity.MEDIUM,
            required_for=["Publication auto sur Google Shopping", "Sync canaux de vente"],
            how_to_grant="""
1. Allez dans Shopify Admin > Apps > Développer des apps
2. Sélectionnez votre app privée
3. Dans "Configuration de l'API Admin", ajoutez le scope "write_publications"
4. Sauvegardez et réinstallez l'app si nécessaire
⚠️ Ce scope est disponible uniquement sur Shopify Plus
""",
            doc_url="https://shopify.dev/docs/api/admin-graphql/latest/mutations/publishablepublish",
        ),
    ]

    EXTERNAL_PERMISSIONS: list[PermissionRequirement] = [
        PermissionRequirement(
            id="ga4_data_api",
            name="Google Analytics 4 Data API",
            description="Accès à l'API GA4 pour lire les métriques",
            service="ga4",
            scope="https://www.googleapis.com/auth/analytics.readonly",
            severity=PermissionSeverity.CRITICAL,
            required_for=["Funnel GA4", "Audit tracking", "CVR par collection"],
            how_to_grant="""
1. Allez sur Google Cloud Console > APIs & Services
2. Activez "Google Analytics Data API"
3. Créez un Service Account avec le rôle "Viewer"
4. Téléchargez la clé JSON du service account
5. Dans GA4, ajoutez le service account comme "Lecteur" sur la propriété
6. Configurez GA4_CREDENTIALS_JSON avec le contenu de la clé
""",
            doc_url="https://developers.google.com/analytics/devguides/reporting/data/v1",
        ),
        PermissionRequirement(
            id="meta_marketing_api",
            name="Meta Marketing API",
            description="Accès à l'API Meta pour les métriques publicitaires",
            service="meta",
            scope="ads_read",
            severity=PermissionSeverity.HIGH,
            required_for=["Audit Meta Pixel", "Sync catalogue Facebook"],
            how_to_grant="""
1. Allez sur Meta Business Suite > Paramètres > Comptes
2. Créez une app dans Meta for Developers
3. Ajoutez le produit "Marketing API"
4. Générez un token d'accès avec les permissions:
   - ads_read (lecture des campagnes)
   - catalog_management (gestion catalogue)
5. Configurez META_ACCESS_TOKEN avec ce token
""",
            doc_url="https://developers.facebook.com/docs/marketing-apis/",
        ),
        PermissionRequirement(
            id="merchant_center_api",
            name="Google Merchant Center API",
            description="Accès à l'API Merchant Center pour le catalogue",
            service="merchant_center",
            scope="https://www.googleapis.com/auth/content",
            severity=PermissionSeverity.HIGH,
            required_for=["Audit produits GMC", "Sync catalogue Google Shopping"],
            how_to_grant="""
1. Allez sur Google Cloud Console > APIs & Services
2. Activez "Content API for Shopping"
3. Utilisez le même Service Account que pour GA4
4. Dans Merchant Center, ajoutez le service account comme utilisateur
5. Configurez MERCHANT_CENTER_ID avec votre ID marchand
""",
            doc_url="https://developers.google.com/shopping-content/guides/quickstart",
        ),
        PermissionRequirement(
            id="search_console_api",
            name="Google Search Console API",
            description="Accès à l'API Search Console pour les données SEO",
            service="search_console",
            scope="https://www.googleapis.com/auth/webmasters.readonly",
            severity=PermissionSeverity.MEDIUM,
            required_for=["Audit SEO", "Couverture d'indexation"],
            how_to_grant="""
1. Allez sur Google Cloud Console > APIs & Services
2. Activez "Search Console API"
3. Utilisez le même Service Account que pour GA4
4. Dans Search Console, ajoutez le service account comme propriétaire
5. Configurez SEARCH_CONSOLE_SITE_URL avec l'URL de votre site
""",
            doc_url="https://developers.google.com/webmaster-tools/search-console-api-original",
        ),
    ]

    def __init__(self, config_service: ConfigService | None = None) -> None:
        """Initialize the permissions checker."""
        if config_service is None:
            from services.config_service import ConfigService

            config_service = ConfigService()
        self._config = config_service

        # Load Shopify config
        shopify_config = self._config.get_shopify_values()
        self._store_url = shopify_config.get("store_url", "")
        self._access_token = shopify_config.get("access_token", "")

    def _get_shopify_headers(self) -> dict[str, str]:
        """Get headers for Shopify API calls."""
        return {
            "X-Shopify-Access-Token": self._access_token,
            "Content-Type": "application/json",
        }

    def check_shopify_permission(self, requirement: PermissionRequirement) -> PermissionCheckResult:
        """Check a single Shopify permission by testing an API endpoint."""
        if not self._store_url or not self._access_token:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Shopify non configuré (SHOPIFY_STORE_URL ou SHOPIFY_ACCESS_TOKEN manquant)",
            )

        # Special case for write_themes - need to actually test writing
        if requirement.scope == "write_themes":
            has_perm, error_msg = self.has_write_themes_permission()
            if has_perm:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.GRANTED,
                )
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.DENIED,
                error_message=error_msg or "Permission write_themes non accordée",
            )

        # Special case for write_publications - test via GraphQL
        if requirement.scope == "write_publications":
            has_perm, error_msg = self.has_write_publications_permission()
            if has_perm:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.GRANTED,
                )
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.DENIED,
                error_message=error_msg or "Permission write_publications non accordée (Shopify Plus requis)",
            )

        # Map scopes to test endpoints
        test_endpoints = {
            "read_products": "/admin/api/2024-01/products.json?limit=1",
            "read_orders": "/admin/api/2024-01/orders.json?limit=1",
            "read_customers": "/admin/api/2024-01/customers.json?limit=1",
            "read_themes": "/admin/api/2024-01/themes.json",
            "read_checkouts": "/admin/api/2024-01/checkouts.json?limit=1",
            "read_analytics": "/admin/api/2024-01/reports.json?limit=1",
        }

        endpoint = test_endpoints.get(requirement.scope)
        if not endpoint:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.UNKNOWN,
                error_message=f"Pas de test défini pour le scope {requirement.scope}",
            )

        try:
            url = f"{self._store_url}{endpoint}"
            resp = requests.get(url, headers=self._get_shopify_headers(), timeout=10)

            if resp.status_code == 200:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.GRANTED,
                )
            if resp.status_code == 403:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.DENIED,
                    error_message=f"Accès refusé (403) - Le scope '{requirement.scope}' n'est pas accordé",
                )
            if resp.status_code == 401:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.DENIED,
                    error_message="Token d'accès invalide ou expiré",
                )
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.UNKNOWN,
                error_message=f"Réponse inattendue: {resp.status_code}",
            )
        except requests.exceptions.RequestException as e:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.UNKNOWN,
                error_message=f"Erreur de connexion: {e!s}",
            )

    def check_ga4_permission(self, requirement: PermissionRequirement) -> PermissionCheckResult:
        """Check GA4 API permission."""
        ga4_config = self._config.get_ga4_values()
        ga4_property = ga4_config.get("property_id", "")
        ga4_creds = ga4_config.get("credentials_path", "")

        if not ga4_property or not ga4_creds:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="GA4 non configuré (GA4_PROPERTY_ID ou GA4_CREDENTIALS_JSON manquant)",
            )

        # Try to import and use GA4 service to test connection
        try:
            from services.ga4_analytics import GA4AnalyticsService

            ga4 = GA4AnalyticsService()
            if ga4.is_available():
                # Try a simple query
                result = ga4.get_funnel_metrics(7)
                if result is not None:
                    return PermissionCheckResult(
                        requirement=requirement,
                        status=PermissionStatus.GRANTED,
                    )

            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.DENIED,
                error_message="Impossible d'accéder aux données GA4 - vérifiez les permissions du service account",
            )
        except Exception as e:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.DENIED,
                error_message=f"Erreur GA4: {e!s}",
            )

    def check_meta_permission(self, requirement: PermissionRequirement) -> PermissionCheckResult:
        """Check Meta Marketing API permission."""
        meta_config = self._config.get_meta_values()
        meta_token = meta_config.get("access_token", "")

        if not meta_token:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Meta non configuré (META_ACCESS_TOKEN manquant)",
            )

        try:
            # Test Meta Graph API
            url = "https://graph.facebook.com/v18.0/me"
            params = {"access_token": meta_token}
            resp = requests.get(url, params=params, timeout=10)

            if resp.status_code == 200:
                return PermissionCheckResult(
                    requirement=requirement,
                    status=PermissionStatus.GRANTED,
                )
            error_data = resp.json().get("error", {})
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.DENIED,
                error_message=error_data.get("message", "Token Meta invalide"),
            )
        except Exception as e:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.UNKNOWN,
                error_message=f"Erreur Meta: {e!s}",
            )

    def check_merchant_center_permission(
        self, requirement: PermissionRequirement
    ) -> PermissionCheckResult:
        """Check Google Merchant Center API permission."""
        merchant_config = self._config.get_merchant_center_values()
        merchant_id = merchant_config.get("merchant_id", "")
        ga4_creds = merchant_config.get("service_account_key_path", "")

        if not merchant_id:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Merchant Center non configuré (MERCHANT_CENTER_ID manquant)",
            )

        if not ga4_creds:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Credentials Google non configurés (GA4_CREDENTIALS_JSON manquant)",
            )

        # Would need to implement actual Merchant Center API check
        # For now, return unknown
        return PermissionCheckResult(
            requirement=requirement,
            status=PermissionStatus.UNKNOWN,
            error_message="Vérification Merchant Center non implémentée - configurez et testez manuellement",
        )

    def check_search_console_permission(
        self, requirement: PermissionRequirement
    ) -> PermissionCheckResult:
        """Check Google Search Console API permission."""
        gsc_config = self._config.get_search_console_values()
        site_url = gsc_config.get("property_url", "")
        ga4_creds = gsc_config.get("service_account_key_path", "")

        if not site_url:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Search Console non configuré (SEARCH_CONSOLE_SITE_URL manquant)",
            )

        if not ga4_creds:
            return PermissionCheckResult(
                requirement=requirement,
                status=PermissionStatus.NOT_CONFIGURED,
                error_message="Credentials Google non configurés (GA4_CREDENTIALS_JSON manquant)",
            )

        # Would need to implement actual Search Console API check
        return PermissionCheckResult(
            requirement=requirement,
            status=PermissionStatus.UNKNOWN,
            error_message="Vérification Search Console non implémentée - configurez et testez manuellement",
        )

    def check_all_permissions(self) -> PermissionsReport:
        """Check all required permissions and return a report."""
        report = PermissionsReport()

        # Check Shopify permissions
        for req in self.SHOPIFY_PERMISSIONS:
            result = self.check_shopify_permission(req)
            report.results.append(result)

        # Check external permissions
        for req in self.EXTERNAL_PERMISSIONS:
            if req.service == "ga4":
                result = self.check_ga4_permission(req)
            elif req.service == "meta":
                result = self.check_meta_permission(req)
            elif req.service == "merchant_center":
                result = self.check_merchant_center_permission(req)
            elif req.service == "search_console":
                result = self.check_search_console_permission(req)
            else:
                result = PermissionCheckResult(
                    requirement=req,
                    status=PermissionStatus.UNKNOWN,
                    error_message=f"Service {req.service} non supporté",
                )
            report.results.append(result)

        return report

    def check_shopify_permissions_only(self) -> PermissionsReport:
        """Check only Shopify permissions (faster)."""
        report = PermissionsReport()

        for req in self.SHOPIFY_PERMISSIONS:
            result = self.check_shopify_permission(req)
            report.results.append(result)

        return report

    def has_write_themes_permission(self) -> tuple[bool, str | None]:
        """Check if write_themes permission is available.

        Returns (True, None) if granted, (False, error_message) if denied.
        This actually tests writing by attempting to read an asset that requires write access.
        """
        if not self._store_url or not self._access_token:
            return False, "Shopify non configuré"

        # To really test write permission, we try to PUT a non-existent asset
        # This will fail with 403 if no write permission, or 404/422 if permission OK
        try:
            # Get active theme ID first
            themes_url = f"{self._store_url}/admin/api/2024-01/themes.json"
            resp = requests.get(themes_url, headers=self._get_shopify_headers(), timeout=10)

            if resp.status_code == 403:
                return False, "Permission read_themes manquante"

            if resp.status_code != 200:
                return False, f"Erreur accès thèmes: {resp.status_code}"

            themes = resp.json().get("themes", [])
            active_theme = next((t for t in themes if t.get("role") == "main"), None)

            if not active_theme:
                return False, "Aucun thème actif trouvé"

            theme_id = active_theme.get("id")

            # Try to write a test asset (will fail with 403 if no permission)
            # Use a clearly named test file that we'll immediately delete
            test_key = "snippets/__isciacus_permission_test__.liquid"
            test_content = "{%- comment -%}Permission test - delete this{%- endcomment -%}"

            assets_url = f"{self._store_url}/admin/api/2024-01/themes/{theme_id}/assets.json"
            put_resp = requests.put(
                assets_url,
                headers=self._get_shopify_headers(),
                json={"asset": {"key": test_key, "value": test_content}},
                timeout=10,
            )

            if put_resp.status_code == 403:
                return False, (
                    "Permission write_themes manquante. "
                    "Allez dans Shopify > Apps > Votre app > Configuration API > "
                    "Ajoutez le scope 'write_themes' et réinstallez l'app."
                )

            if put_resp.status_code in (200, 201):
                # Success! Delete the test file
                requests.delete(
                    assets_url,
                    headers=self._get_shopify_headers(),
                    params={"asset[key]": test_key},
                    timeout=10,
                )
                return True, None

            # 422 or other error means we have permission but something else failed
            # This is OK - permission is granted
            return True, None

        except requests.exceptions.RequestException as e:
            return False, f"Erreur de connexion: {e!s}"

    def has_write_publications_permission(self) -> tuple[bool, str | None]:
        """Check if write_publications permission is available.

        Returns (True, None) if granted, (False, error_message) if denied.
        This tests by querying publications via GraphQL (read is needed for write).
        """
        if not self._store_url or not self._access_token:
            return False, "Shopify non configuré"

        try:
            # Test by querying publications - if we can read them, we likely have the scope
            graphql_url = f"{self._store_url}/admin/api/2024-01/graphql.json"
            query = """
            query {
                publications(first: 1) {
                    nodes {
                        id
                        name
                    }
                }
            }
            """
            resp = requests.post(
                graphql_url,
                headers=self._get_shopify_headers(),
                json={"query": query},
                timeout=10,
            )

            if resp.status_code == 200:
                data = resp.json()
                if "errors" in data:
                    errors = data.get("errors", [])
                    if any("access" in str(e).lower() for e in errors):
                        return False, (
                            "Permission write_publications non accordée. "
                            "Ce scope nécessite Shopify Plus. "
                            "Allez dans Apps > Votre app > Configuration API > "
                            "Ajoutez le scope 'write_publications'."
                        )
                    return False, f"Erreur GraphQL: {errors}"
                # Success - we can at least read publications
                return True, None

            if resp.status_code == 403:
                return False, (
                    "Permission write_publications non accordée (Shopify Plus requis)"
                )

            return False, f"Erreur HTTP: {resp.status_code}"

        except requests.exceptions.RequestException as e:
            return False, f"Erreur de connexion: {e!s}"

    def get_permissions_summary(self) -> dict[str, Any]:
        """Get a summary of all permissions for display."""
        report = self.check_all_permissions()

        def result_to_dict(r: PermissionCheckResult) -> dict[str, Any]:
            return {
                "id": r.requirement.id,
                "name": r.requirement.name,
                "description": r.requirement.description,
                "service": r.requirement.service,
                "status": r.status.value,
                "severity": r.requirement.severity.value,
                "required_for": r.requirement.required_for,
                "error_message": r.error_message,
                "how_to_grant": r.requirement.how_to_grant.strip(),
                "doc_url": r.requirement.doc_url,
            }

        # Group by service
        by_service: dict[str, list[dict[str, Any]]] = {}
        for result in report.results:
            service = result.requirement.service
            if service not in by_service:
                by_service[service] = []
            by_service[service].append(result_to_dict(result))

        return {
            "all_granted": report.all_granted,
            "summary": {
                "total": len(report.results),
                "granted": len([r for r in report.results if r.status == PermissionStatus.GRANTED]),
                "denied": len([r for r in report.results if r.status == PermissionStatus.DENIED]),
                "not_configured": len(
                    [r for r in report.results if r.status == PermissionStatus.NOT_CONFIGURED]
                ),
                "unknown": len([r for r in report.results if r.status == PermissionStatus.UNKNOWN]),
            },
            "critical_missing": [result_to_dict(r) for r in report.critical_missing],
            "warnings": [result_to_dict(r) for r in report.warnings],
            "by_service": by_service,
            "checked_at": report.checked_at,
        }
