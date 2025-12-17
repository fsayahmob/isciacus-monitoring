"""
Configuration Service - Manage Environment Variables
=====================================================
Provides configuration management with validation and connection testing.
Uses encrypted SQLite storage for secure credential management.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import requests

from .secure_store import get_secure_store


@dataclass
class ConfigVariable:
    """Single configuration variable."""

    key: str
    label: str
    description: str
    how_to_get: str
    value: str | None
    is_set: bool
    is_secret: bool = False
    required: bool = True


@dataclass
class ConfigSection:
    """Section of configuration variables."""

    id: str
    name: str
    description: str
    icon: str
    variables: list[ConfigVariable] = field(default_factory=list)
    is_configured: bool = False


class ConfigService:
    """Service for managing application configuration."""

    def __init__(self) -> None:
        self.env_path = Path(__file__).parent.parent / ".env"
        self._store = get_secure_store()
        self._initialized = False

    def _ensure_initialized(self) -> None:
        """Initialize store and export to environment for runtime use."""
        if self._initialized:
            return

        # Export stored config to environment for runtime use
        self._store.export_to_env()
        self._initialized = True

    def _get_value(self, key: str) -> str:
        """Get a config value from secure store or environment."""
        self._ensure_initialized()
        # First check secure store
        value = self._store.get(key)
        if value:
            return value
        # Fallback to environment
        return os.getenv(key, "")

    def get_shopify_values(self) -> dict[str, str]:
        """Get Shopify configuration values for use by other services."""
        return {
            "store_url": self._get_value("SHOPIFY_STORE_URL"),
            "api_key": self._get_value("SHOPIFY_API_KEY"),
            "api_secret": self._get_value("SHOPIFY_API_SECRET"),
            "access_token": self._get_value("SHOPIFY_ACCESS_TOKEN"),
        }

    def get_ga4_values(self) -> dict[str, str]:
        """Get GA4 configuration values for use by other services."""
        return {
            "property_id": self._get_value("GA4_PROPERTY_ID"),
            "measurement_id": self._get_value("GA4_MEASUREMENT_ID"),
            "credentials_path": self._get_value("GOOGLE_APPLICATION_CREDENTIALS"),
        }

    def get_meta_values(self) -> dict[str, str]:
        """Get Meta (Facebook) configuration values for use by other services."""
        return {
            "pixel_id": self._get_value("META_PIXEL_ID"),
            "access_token": self._get_value("META_ACCESS_TOKEN"),
            "ad_account_id": self._get_value("META_AD_ACCOUNT_ID"),
            "business_id": self._get_value("META_BUSINESS_ID"),
        }

    def get_search_console_values(self) -> dict[str, str]:
        """Get Search Console configuration values for use by other services."""
        return {
            "property_url": self._get_value("GOOGLE_SEARCH_CONSOLE_PROPERTY"),
            "service_account_email": self._get_value("GOOGLE_SERVICE_ACCOUNT_EMAIL"),
            "service_account_key_path": self._get_value("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
        }

    def get_merchant_center_values(self) -> dict[str, str]:
        """Get Merchant Center configuration values for use by other services."""
        return {
            "merchant_id": self._get_value("GOOGLE_MERCHANT_ID"),
            "service_account_key_path": self._get_value("GOOGLE_SERVICE_ACCOUNT_KEY_PATH"),
        }

    def get_all_config(self) -> dict[str, Any]:
        """Get all configuration sections with current values."""
        sections = [
            self._get_shopify_config(),
            self._get_ga4_config(),
            self._get_meta_config(),
            self._get_search_console_config(),
            self._get_google_ads_config(),
            self._get_merchant_center_config(),
            self._get_twilio_config(),
            self._get_anthropic_config(),
            self._get_serpapi_config(),
            self._get_inngest_config(),
        ]

        return {
            "sections": [self._section_to_dict(s) for s in sections],
            "env_file_exists": self.env_path.exists(),
        }

    def _section_to_dict(self, section: ConfigSection) -> dict[str, Any]:
        """Convert section to dictionary."""
        return {
            "id": section.id,
            "name": section.name,
            "description": section.description,
            "icon": section.icon,
            "is_configured": section.is_configured,
            "variables": [
                {
                    "key": v.key,
                    "label": v.label,
                    "description": v.description,
                    "how_to_get": v.how_to_get,
                    "value": self._mask_value(v.value) if v.is_secret and v.value else v.value,
                    "is_set": v.is_set,
                    "is_secret": v.is_secret,
                    "required": v.required,
                }
                for v in section.variables
            ],
        }

    def _mask_value(self, value: str) -> str:
        """Mask secret values for display."""
        if not value:
            return ""
        if len(value) <= 8:
            return "*" * len(value)
        return value[:4] + "*" * (len(value) - 8) + value[-4:]

    def _has_google_service_account(self) -> bool:
        """Check if Google service account is stored in secure store."""
        return self._store.get_service_account("google") is not None

    def _get_shopify_config(self) -> ConfigSection:
        """Get Shopify configuration."""
        store_url = self._get_value("SHOPIFY_STORE_URL")
        api_key = self._get_value("SHOPIFY_API_KEY")
        api_secret = self._get_value("SHOPIFY_API_SECRET")
        access_token = self._get_value("SHOPIFY_ACCESS_TOKEN")

        variables = [
            ConfigVariable(
                key="SHOPIFY_STORE_URL",
                label="URL de la boutique",
                description="L'URL de votre boutique Shopify au format myshopify.com",
                how_to_get="""1. Connectez-vous à votre admin Shopify
2. L'URL est dans la barre d'adresse: https://votre-boutique.myshopify.com
3. Copiez l'URL complète avec https://""",
                value=store_url or None,
                is_set=bool(store_url),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="SHOPIFY_API_KEY",
                label="Clé API (optionnel)",
                description="Clé API de votre application Shopify - uniquement pour OAuth",
                how_to_get="""1. Allez dans Admin Shopify > Settings > Apps and sales channels
2. Cliquez sur "Develop apps" puis sélectionnez votre app
3. Allez dans "API credentials"
4. Copiez la "API key"

Note: Optionnel si vous avez déjà le Access Token.""",
                value=api_key or None,
                is_set=bool(api_key),
                is_secret=True,
                required=False,
            ),
            ConfigVariable(
                key="SHOPIFY_API_SECRET",
                label="Secret API (optionnel)",
                description="Secret API de votre application Shopify - uniquement pour OAuth",
                how_to_get="""1. Allez dans Admin Shopify > Settings > Apps and sales channels
2. Cliquez sur "Develop apps" puis sélectionnez votre app
3. Allez dans "API credentials"
4. Copiez la "API secret key"

Note: Optionnel si vous avez déjà le Access Token.""",
                value=api_secret or None,
                is_set=bool(api_secret),
                is_secret=True,
                required=False,
            ),
            ConfigVariable(
                key="SHOPIFY_ACCESS_TOKEN",
                label="Token d'accès Admin API",
                description="Token pour accéder à l'API Admin de Shopify",
                how_to_get="""1. Allez dans Admin Shopify > Settings > Apps and sales channels
2. Cliquez sur "Develop apps" puis "Create an app"
3. Configurez les scopes API nécessaires:
   - read_products, read_orders, read_customers, read_analytics
4. Installez l'app et copiez le "Admin API access token"

Note: Le token commence par "shpat_" """,
                value=access_token or None,
                is_set=bool(access_token),
                is_secret=True,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="shopify",
            name="Shopify",
            description="Connexion API pour récupérer produits, commandes et données e-commerce",
            icon="shopify",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_ga4_config(self) -> ConfigSection:
        """Get Google Analytics 4 configuration."""
        property_id = self._get_value("GA4_PROPERTY_ID")
        measurement_id = self._get_value("GA4_MEASUREMENT_ID")
        credentials_path = self._get_value("GOOGLE_APPLICATION_CREDENTIALS")

        variables = [
            ConfigVariable(
                key="GA4_PROPERTY_ID",
                label="ID de propriété GA4",
                description="L'identifiant numérique de votre propriété Google Analytics 4",
                how_to_get="""1. Connectez-vous à Google Analytics (analytics.google.com)
2. Allez dans Admin (roue dentée en bas à gauche)
3. Dans la colonne "Property", cliquez sur "Property Settings"
4. L'ID est affiché en haut: "PROPERTY ID" (ex: 123456789)

Note: C'est un nombre, pas le nom de la propriété""",
                value=property_id or None,
                is_set=bool(property_id),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="GA4_MEASUREMENT_ID",
                label="ID de mesure GA4",
                description="L'identifiant de mesure pour le tracking web (G-XXXXXXXXXX)",
                how_to_get="""1. Connectez-vous à Google Analytics (analytics.google.com)
2. Allez dans Admin > Data Streams
3. Sélectionnez votre flux de données web
4. L'ID de mesure est affiché (ex: G-ABC123DEF4)

Note: Commence toujours par "G-" suivi de caractères alphanumériques""",
                value=measurement_id or None,
                is_set=bool(measurement_id),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="GOOGLE_APPLICATION_CREDENTIALS",
                label="Fichier credentials Service Account",
                description="Chemin vers le fichier JSON du Service Account Google",
                how_to_get="""1. Allez sur Google Cloud Console (console.cloud.google.com)
2. Créez un projet ou sélectionnez-en un existant
3. Allez dans "IAM & Admin" > "Service Accounts"
4. Créez un nouveau Service Account avec le rôle "Analytics Viewer"
5. Créez une clé JSON et téléchargez-la
6. Placez le fichier dans le dossier backend (ex: ./credentials/ga4-service-account.json)
7. Dans Google Analytics, ajoutez l'email du Service Account en lecture

Important: N'exposez jamais ce fichier publiquement!""",
                value=credentials_path or None,
                is_set=bool(credentials_path) and self._has_google_service_account(),
                is_secret=False,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="ga4",
            name="Google Analytics 4",
            description="Données de trafic, conversions et comportement utilisateur",
            icon="ga4",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_meta_config(self) -> ConfigSection:
        """Get Meta (Facebook/Instagram) configuration."""
        pixel_id = self._get_value("META_PIXEL_ID")
        access_token = self._get_value("META_ACCESS_TOKEN")
        ad_account_id = self._get_value("META_AD_ACCOUNT_ID")
        business_id = self._get_value("META_BUSINESS_ID")

        variables = [
            ConfigVariable(
                key="META_PIXEL_ID",
                label="Meta Pixel ID",
                description="Identifiant du pixel Meta pour le tracking",
                how_to_get="""1. Allez sur Meta Business Suite (business.facebook.com)
2. Allez dans Events Manager > Data Sources
3. Sélectionnez votre Pixel ou créez-en un
4. L'ID du Pixel est affiché (ex: 754490778217007)

Note: Le Pixel doit être installé sur votre site Shopify""",
                value=pixel_id or None,
                is_set=bool(pixel_id),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="META_ACCESS_TOKEN",
                label="Token d'accès Meta API",
                description="Token pour accéder à l'API Conversions Meta",
                how_to_get="""1. Allez sur Meta Business Suite > Events Manager
2. Sélectionnez votre Pixel > Settings
3. Cliquez sur "Generate access token"
4. Copiez le token généré

Important: Ce token a une durée de validité limitée.
Pour un token permanent, utilisez une System User dans Business Settings.""",
                value=access_token or None,
                is_set=bool(access_token),
                is_secret=True,
                required=True,
            ),
            ConfigVariable(
                key="META_AD_ACCOUNT_ID",
                label="ID du compte publicitaire",
                description="Identifiant du compte publicitaire Meta",
                how_to_get="""1. Allez sur Meta Business Suite > Settings > Business Settings
2. Cliquez sur "Ad Accounts" dans le menu
3. Sélectionnez votre compte publicitaire
4. L'ID est affiché (ex: 304354973)

Note: Ne pas inclure le préfixe "act_" """,
                value=ad_account_id or None,
                is_set=bool(ad_account_id),
                is_secret=False,
                required=False,
            ),
            ConfigVariable(
                key="META_BUSINESS_ID",
                label="ID Business Meta",
                description="Identifiant de votre Business Manager Meta",
                how_to_get="""1. Allez sur Meta Business Suite > Settings > Business Settings
2. Dans "Business Info", l'ID est affiché
3. Ou regardez l'URL: business.facebook.com/settings/?business_id=XXXXXX

L'ID ressemble à: 61584823689208""",
                value=business_id or None,
                is_set=bool(business_id),
                is_secret=False,
                required=False,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="meta",
            name="Meta (Facebook/Instagram)",
            description="API Conversions et données publicitaires Meta",
            icon="meta",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_search_console_config(self) -> ConfigSection:
        """Get Google Search Console configuration."""
        property_url = self._get_value("GOOGLE_SEARCH_CONSOLE_PROPERTY")
        service_account_email = self._get_value("GOOGLE_SERVICE_ACCOUNT_EMAIL")
        service_account_key = self._get_value("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")

        variables = [
            ConfigVariable(
                key="GOOGLE_SEARCH_CONSOLE_PROPERTY",
                label="Propriété Search Console",
                description="URL de la propriété Google Search Console",
                how_to_get="""1. Allez sur Google Search Console (search.google.com/search-console)
2. Sélectionnez votre propriété ou ajoutez-en une
3. Pour un domaine: sc-domain:votredomaine.com
4. Pour un préfixe URL: https://www.votredomaine.com/

Exemples:
- sc-domain:isciacusstore.com (domaine entier)
- https://www.isciacusstore.com/ (préfixe URL)""",
                value=property_url or None,
                is_set=bool(property_url),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="GOOGLE_SERVICE_ACCOUNT_EMAIL",
                label="Email du Service Account",
                description="Email du compte de service Google pour l'authentification",
                how_to_get="""1. Utilisez le même Service Account que pour GA4
2. L'email ressemble à: nom@projet.iam.gserviceaccount.com
3. Ajoutez cet email comme utilisateur dans Search Console:
   - Allez dans Settings > Users and permissions
   - Cliquez sur "Add user"
   - Entrez l'email et donnez les droits "Full" ou "Restricted"

Note: Le même Service Account peut être utilisé pour GA4 et Search Console""",
                value=service_account_email or None,
                is_set=bool(service_account_email),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="GOOGLE_SERVICE_ACCOUNT_KEY_PATH",
                label="Fichier clé Service Account",
                description="Chemin vers le fichier JSON de la clé du Service Account",
                how_to_get="""1. C'est le même fichier JSON utilisé pour GA4
2. Placez-le dans le dossier backend
3. Indiquez le chemin relatif ou absolu

Exemple: merchant-center-1709227937606-64ee8fa5e1b0.json

Note: Ce fichier contient la clé privée, ne le partagez jamais!""",
                value=service_account_key or None,
                is_set=bool(service_account_key) and self._has_google_service_account(),
                is_secret=False,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="search_console",
            name="Google Search Console",
            description="Données SEO, impressions et clics depuis la recherche Google",
            icon="search_console",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_google_ads_config(self) -> ConfigSection:
        """Get Google Ads configuration."""
        customer_id = self._get_value("GOOGLE_ADS_CUSTOMER_ID")
        developer_token = self._get_value("GOOGLE_ADS_DEVELOPER_TOKEN")

        variables = [
            ConfigVariable(
                key="GOOGLE_ADS_CUSTOMER_ID",
                label="ID Client Google Ads",
                description="Identifiant de votre compte Google Ads (sans tirets)",
                how_to_get="""1. Connectez-vous à Google Ads (ads.google.com)
2. L'ID client est visible en haut à droite de l'interface
3. C'est un nombre à 10 chiffres (ex: 1234567890)

Note: Retirez les tirets si présents (123-456-7890 → 1234567890)""",
                value=customer_id or None,
                is_set=bool(customer_id),
                is_secret=False,
                required=True,
            ),
            ConfigVariable(
                key="GOOGLE_ADS_DEVELOPER_TOKEN",
                label="Developer Token",
                description="Token développeur pour l'API Google Ads",
                how_to_get="""1. Connectez-vous à Google Ads
2. Allez dans Tools & Settings > API Center
3. Demandez un accès développeur si nécessaire
4. Copiez le Developer Token

Note: Le token de test ne fonctionne qu'avec les comptes de test.
Pour la production, un accès Standard ou Basic est requis.""",
                value=developer_token or None,
                is_set=bool(developer_token),
                is_secret=True,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="google_ads",
            name="Google Ads",
            description="Données publicitaires et performances des campagnes Google",
            icon="google_ads",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_merchant_center_config(self) -> ConfigSection:
        """Get Google Merchant Center configuration."""
        merchant_id = self._get_value("GOOGLE_MERCHANT_ID")

        variables = [
            ConfigVariable(
                key="GOOGLE_MERCHANT_ID",
                label="ID Merchant Center",
                description="Identifiant de votre compte Google Merchant Center",
                how_to_get="""1. Connectez-vous à Google Merchant Center (merchants.google.com)
2. L'ID est visible en haut à gauche de l'interface
3. C'est un nombre (ex: 123456789)

Note: Assurez-vous que le Service Account Google a accès à ce compte.""",
                value=merchant_id or None,
                is_set=bool(merchant_id),
                is_secret=False,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="merchant_center",
            name="Google Merchant Center",
            description="Gestion du catalogue produits et données Shopping",
            icon="merchant_center",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_twilio_config(self) -> ConfigSection:
        """Get Twilio configuration."""
        account_sid = self._get_value("TWILIO_ACCOUNT_SID")
        auth_token = self._get_value("TWILIO_AUTH_TOKEN")
        phone_number = self._get_value("TWILIO_PHONE_NUMBER")

        variables = [
            ConfigVariable(
                key="TWILIO_ACCOUNT_SID",
                label="Account SID",
                description="Identifiant de votre compte Twilio",
                how_to_get="""1. Connectez-vous à Twilio Console (console.twilio.com)
2. Sur le Dashboard, trouvez "Account SID"
3. Copiez la valeur (commence par "AC")

Note: Ne partagez jamais ce SID publiquement.""",
                value=account_sid or None,
                is_set=bool(account_sid),
                is_secret=True,
                required=True,
            ),
            ConfigVariable(
                key="TWILIO_AUTH_TOKEN",
                label="Auth Token",
                description="Token d'authentification Twilio",
                how_to_get="""1. Connectez-vous à Twilio Console
2. Sur le Dashboard, trouvez "Auth Token"
3. Cliquez pour révéler et copiez la valeur

Important: Ce token doit rester secret!""",
                value=auth_token or None,
                is_set=bool(auth_token),
                is_secret=True,
                required=True,
            ),
            ConfigVariable(
                key="TWILIO_PHONE_NUMBER",
                label="Numéro de téléphone",
                description="Numéro Twilio pour envoyer les SMS/WhatsApp",
                how_to_get="""1. Allez dans Phone Numbers > Manage > Active numbers
2. Sélectionnez ou achetez un numéro
3. Copiez le numéro au format international (ex: +33612345678)

Note: Le numéro doit avoir les capabilities SMS/WhatsApp activées.""",
                value=phone_number or None,
                is_set=bool(phone_number),
                is_secret=False,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="twilio",
            name="Twilio",
            description="Notifications SMS et WhatsApp pour les alertes",
            icon="twilio",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_anthropic_config(self) -> ConfigSection:
        """Get Anthropic (Claude AI) configuration."""
        api_key = self._get_value("ANTHROPIC_API_KEY")

        variables = [
            ConfigVariable(
                key="ANTHROPIC_API_KEY",
                label="Clé API Anthropic",
                description="Clé API pour utiliser Claude (IA)",
                how_to_get="""1. Créez un compte sur console.anthropic.com
2. Allez dans "API Keys"
3. Créez une nouvelle clé et copiez-la immédiatement

Note: La clé commence par "sk-ant-api03-"
Important: Conservez cette clé en sécurité, elle ne peut être vue qu'une fois!""",
                value=api_key or None,
                is_set=bool(api_key),
                is_secret=True,
                required=True,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="anthropic",
            name="Anthropic (Claude AI)",
            description="Intelligence artificielle pour l'analyse et les recommandations",
            icon="anthropic",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_serpapi_config(self) -> ConfigSection:
        """Get SerpAPI configuration."""
        api_key = self._get_value("SERPAPI_KEY")

        variables = [
            ConfigVariable(
                key="SERPAPI_KEY",
                label="Clé API SerpAPI",
                description="Clé API pour les recherches Google (SEO, images, etc.)",
                how_to_get="""1. Créez un compte sur serpapi.com
2. Allez dans "API Key" depuis le Dashboard
3. Copiez votre clé API

Note: Le plan gratuit inclut 100 recherches/mois.
Pour plus de volume, souscrivez à un plan payant.""",
                value=api_key or None,
                is_set=bool(api_key),
                is_secret=True,
                required=False,
            ),
        ]

        is_configured = all(v.is_set for v in variables if v.required)

        return ConfigSection(
            id="serpapi",
            name="SerpAPI",
            description="Recherches Google pour l'analyse SEO et la veille concurrentielle",
            icon="serpapi",
            variables=variables,
            is_configured=is_configured,
        )

    def _get_inngest_config(self) -> ConfigSection:
        """Get Inngest configuration."""
        is_dev = (
            self._get_value("INNGEST_DEV").lower() == "true"
            if self._get_value("INNGEST_DEV")
            else True
        )
        signing_key = self._get_value("INNGEST_SIGNING_KEY")
        event_key = self._get_value("INNGEST_EVENT_KEY")

        variables = [
            ConfigVariable(
                key="INNGEST_DEV",
                label="Mode développement",
                description="Active le mode développement local (pas besoin de clés API)",
                how_to_get="""Pour le développement local:
- Définissez sur "true" (valeur par défaut)
- Lancez le serveur Inngest dev: npx inngest-cli@latest dev
- Dashboard disponible sur http://localhost:8288

Pour la production:
- Définissez sur "false"
- Configurez les clés SIGNING_KEY et EVENT_KEY""",
                value="true" if is_dev else "false",
                is_set=True,
                is_secret=False,
                required=False,
            ),
            ConfigVariable(
                key="INNGEST_SIGNING_KEY",
                label="Signing Key (Production)",
                description="Clé de signature pour sécuriser les webhooks en production",
                how_to_get="""1. Créez un compte sur inngest.com
2. Créez une nouvelle app
3. Allez dans Settings > Signing Key
4. Copiez la clé (commence par "signkey-...")

Note: Requis uniquement en mode production (INNGEST_DEV=false)""",
                value=signing_key or None,
                is_set=bool(signing_key),
                is_secret=True,
                required=False,
            ),
            ConfigVariable(
                key="INNGEST_EVENT_KEY",
                label="Event Key (Production)",
                description="Clé pour envoyer des événements en production",
                how_to_get="""1. Connectez-vous à inngest.com
2. Allez dans votre app > Settings > Event Keys
3. Créez une nouvelle clé ou copiez une existante

Note: Requis uniquement en mode production (INNGEST_DEV=false)""",
                value=event_key or None,
                is_set=bool(event_key),
                is_secret=True,
                required=False,
            ),
        ]

        # In dev mode, it's always configured
        is_configured = is_dev or (bool(signing_key) and bool(event_key))

        return ConfigSection(
            id="inngest",
            name="Inngest (Background Jobs)",
            description="File d'attente pour les tâches asynchrones et audits planifiés",
            icon="inngest",
            variables=variables,
            is_configured=is_configured,
        )

    def test_shopify_connection(self) -> dict[str, Any]:
        """Test Shopify API connection."""
        store_url = self._get_value("SHOPIFY_STORE_URL")
        access_token = self._get_value("SHOPIFY_ACCESS_TOKEN")

        if not store_url or not access_token:
            return {
                "success": False,
                "message": "Variables SHOPIFY_STORE_URL et SHOPIFY_ACCESS_TOKEN requises",
                "details": None,
            }

        try:
            # Test with shop info endpoint
            url = f"{store_url}/admin/api/2024-01/shop.json"
            headers = {"X-Shopify-Access-Token": access_token}
            response = requests.get(url, headers=headers, timeout=10)

            if response.status_code == 200:
                shop_data = response.json().get("shop", {})
                return {
                    "success": True,
                    "message": "Connexion Shopify réussie",
                    "details": {
                        "shop_name": shop_data.get("name", "N/A"),
                        "shop_email": shop_data.get("email", "N/A"),
                        "plan": shop_data.get("plan_name", "N/A"),
                        "currency": shop_data.get("currency", "N/A"),
                    },
                }
            if response.status_code == 401:
                return {
                    "success": False,
                    "message": "Token d'accès invalide ou expiré",
                    "details": None,
                }
            if response.status_code == 404:
                return {
                    "success": False,
                    "message": "URL de boutique invalide",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur HTTP {response.status_code}",
                "details": None,
            }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "message": "Timeout - la connexion a pris trop de temps",
                "details": None,
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "message": "Impossible de se connecter au serveur Shopify",
                "details": None,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Erreur: {e!s}",
                "details": None,
            }

    def test_ga4_connection(self) -> dict[str, Any]:
        """Test Google Analytics 4 connection."""
        ga4_config = self.get_ga4_values()
        property_id = ga4_config.get("property_id", "")
        credentials_path = ga4_config.get("credentials_path", "")

        if not property_id:
            return {
                "success": False,
                "message": "Variable GA4_PROPERTY_ID requise",
                "details": None,
            }

        if not credentials_path:
            return {
                "success": False,
                "message": "Variable GOOGLE_APPLICATION_CREDENTIALS requise",
                "details": None,
            }

        if not Path(credentials_path).exists():
            return {
                "success": False,
                "message": f"Fichier credentials non trouvé: {credentials_path}",
                "details": None,
            }

        try:
            from google.analytics.data_v1beta import BetaAnalyticsDataClient
            from google.analytics.data_v1beta.types import (
                DateRange,
                Dimension,
                Metric,
                RunReportRequest,
            )

            client = BetaAnalyticsDataClient()

            # Simple test request
            request = RunReportRequest(
                property=f"properties/{property_id}",
                dimensions=[Dimension(name="date")],
                metrics=[Metric(name="sessions")],
                date_ranges=[DateRange(start_date="7daysAgo", end_date="today")],
                limit=1,
            )

            response = client.run_report(request)

            return {
                "success": True,
                "message": "Connexion GA4 réussie",
                "details": {
                    "property_id": property_id,
                    "rows_returned": len(response.rows) if response.rows else 0,
                },
            }
        except ImportError:
            return {
                "success": False,
                "message": "Module google-analytics-data non installé",
                "details": None,
            }
        except Exception as e:
            error_msg = str(e)
            if "PERMISSION_DENIED" in error_msg:
                return {
                    "success": False,
                    "message": "Accès refusé - vérifiez les permissions du Service Account",
                    "details": None,
                }
            if "NOT_FOUND" in error_msg:
                return {
                    "success": False,
                    "message": "Propriété GA4 non trouvée - vérifiez l'ID",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur GA4: {error_msg[:100]}",
                "details": None,
            }

    def test_meta_connection(self) -> dict[str, Any]:
        """Test Meta (Facebook) API connection."""
        pixel_id = self._get_value("META_PIXEL_ID")
        access_token = self._get_value("META_ACCESS_TOKEN")

        if not pixel_id or not access_token:
            return {
                "success": False,
                "message": "Variables META_PIXEL_ID et META_ACCESS_TOKEN requises",
                "details": None,
            }

        try:
            # Test with Graph API debug token endpoint
            url = f"https://graph.facebook.com/v18.0/{pixel_id}"
            params = {"access_token": access_token, "fields": "name,is_unavailable"}
            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "message": "Connexion Meta Pixel réussie",
                    "details": {
                        "pixel_id": pixel_id,
                        "pixel_name": data.get("name", "N/A"),
                        "is_unavailable": data.get("is_unavailable", False),
                    },
                }
            if response.status_code == 400:
                error_data = response.json().get("error", {})
                return {
                    "success": False,
                    "message": f"Erreur API: {error_data.get('message', 'Erreur inconnue')}",
                    "details": None,
                }
            if response.status_code == 401:
                return {
                    "success": False,
                    "message": "Token d'accès invalide ou expiré",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur HTTP {response.status_code}",
                "details": None,
            }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "message": "Timeout - la connexion a pris trop de temps",
                "details": None,
            }
        except requests.exceptions.ConnectionError:
            return {
                "success": False,
                "message": "Impossible de se connecter à l'API Meta",
                "details": None,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Erreur: {e!s}",
                "details": None,
            }

    def test_search_console_connection(self) -> dict[str, Any]:
        """Test Google Search Console connection."""
        property_url = self._get_value("GOOGLE_SEARCH_CONSOLE_PROPERTY")
        service_account_key = self._get_value("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")

        if not property_url:
            return {
                "success": False,
                "message": "Variable GOOGLE_SEARCH_CONSOLE_PROPERTY requise",
                "details": None,
            }

        if not service_account_key:
            return {
                "success": False,
                "message": "Variable GOOGLE_SERVICE_ACCOUNT_KEY_PATH requise",
                "details": None,
            }

        if not Path(service_account_key).exists():
            return {
                "success": False,
                "message": f"Fichier credentials non trouvé: {service_account_key}",
                "details": None,
            }

        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            credentials = service_account.Credentials.from_service_account_file(
                service_account_key,
                scopes=["https://www.googleapis.com/auth/webmasters.readonly"],
            )

            service = build("searchconsole", "v1", credentials=credentials)

            # Test by listing sites
            sites = service.sites().list().execute()
            site_list = sites.get("siteEntry", [])

            # Check if property exists
            property_found = any(site.get("siteUrl") == property_url for site in site_list)

            if property_found:
                return {
                    "success": True,
                    "message": "Connexion Search Console réussie",
                    "details": {
                        "property": property_url,
                        "total_sites": len(site_list),
                    },
                }
            return {
                "success": False,
                "message": f"Propriété '{property_url}' non trouvée. Vérifiez les permissions.",
                "details": {"available_sites": [s.get("siteUrl") for s in site_list[:5]]},
            }
        except ImportError:
            return {
                "success": False,
                "message": "Module google-api-python-client non installé",
                "details": None,
            }
        except Exception as e:
            error_msg = str(e)
            if "PERMISSION_DENIED" in error_msg:
                return {
                    "success": False,
                    "message": "Accès refusé - vérifiez les permissions du Service Account",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur Search Console: {error_msg[:100]}",
                "details": None,
            }

    def test_inngest_connection(self) -> dict[str, Any]:
        """Test Inngest connection."""
        inngest_dev = self._get_value("INNGEST_DEV")
        is_dev = inngest_dev.lower() == "true" if inngest_dev else True

        if is_dev:
            # Test local dev server
            try:
                response = requests.get("http://localhost:8288/v0/health", timeout=5)
                if response.status_code == 200:
                    return {
                        "success": True,
                        "message": "Serveur Inngest local connecté",
                        "details": {"mode": "development", "url": "http://localhost:8288"},
                    }
                return {
                    "success": False,
                    "message": "Serveur Inngest local non disponible",
                    "details": None,
                }
            except Exception:
                # Try Docker internal network
                try:
                    response = requests.get("http://inngest:8288/v0/health", timeout=5)
                    if response.status_code == 200:
                        return {
                            "success": True,
                            "message": "Serveur Inngest Docker connecté",
                            "details": {"mode": "development", "url": "http://inngest:8288"},
                        }
                except Exception:
                    pass

                return {
                    "success": False,
                    "message": "Serveur Inngest non démarré. Lancez 'docker compose up' ou 'npx inngest-cli dev'",
                    "details": None,
                }
        else:
            # Production mode - check if keys are set
            signing_key = self._get_value("INNGEST_SIGNING_KEY")
            event_key = self._get_value("INNGEST_EVENT_KEY")

            if not signing_key or not event_key:
                return {
                    "success": False,
                    "message": "Clés Inngest requises en mode production",
                    "details": None,
                }

            return {
                "success": True,
                "message": "Configuration Inngest production valide",
                "details": {"mode": "production"},
            }

    def test_serpapi_connection(self) -> dict[str, Any]:
        """Test SerpAPI connection."""
        self._ensure_initialized()
        api_key = self._get_value("SERPAPI_KEY")

        if not api_key:
            return {
                "success": False,
                "message": "Variable SERPAPI_KEY requise",
                "details": None,
            }

        try:
            # Test with a simple search
            url = "https://serpapi.com/search.json"
            params = {
                "api_key": api_key,
                "engine": "google",
                "q": "test",
                "num": 1,
            }
            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                data = response.json()
                return {
                    "success": True,
                    "message": "Connexion SerpAPI réussie",
                    "details": {
                        "search_engine": data.get("search_metadata", {}).get("google_url", "N/A")[
                            :50
                        ],
                        "total_results": data.get("search_information", {}).get(
                            "total_results", "N/A"
                        ),
                    },
                }
            if response.status_code == 401:
                return {
                    "success": False,
                    "message": "Clé API invalide",
                    "details": None,
                }
            if response.status_code == 429:
                return {
                    "success": False,
                    "message": "Limite de requêtes atteinte (quota épuisé)",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur HTTP {response.status_code}",
                "details": None,
            }
        except requests.exceptions.Timeout:
            return {
                "success": False,
                "message": "Timeout - la connexion a pris trop de temps",
                "details": None,
            }
        except Exception as e:
            return {
                "success": False,
                "message": f"Erreur: {e!s}",
                "details": None,
            }

    def test_merchant_center_connection(self) -> dict[str, Any]:
        """Test Google Merchant Center connection."""
        self._ensure_initialized()
        merchant_id = self._get_value("GOOGLE_MERCHANT_ID")
        service_account_key = self._get_value("GOOGLE_SERVICE_ACCOUNT_KEY_PATH")

        if not merchant_id:
            return {
                "success": False,
                "message": "Variable GOOGLE_MERCHANT_ID requise",
                "details": None,
            }

        if not service_account_key:
            return {
                "success": False,
                "message": "Variable GOOGLE_SERVICE_ACCOUNT_KEY_PATH requise",
                "details": None,
            }

        if not Path(service_account_key).exists():
            return {
                "success": False,
                "message": f"Fichier credentials non trouvé: {service_account_key}",
                "details": None,
            }

        try:
            from google.oauth2 import service_account
            from googleapiclient.discovery import build

            credentials = service_account.Credentials.from_service_account_file(
                service_account_key,
                scopes=["https://www.googleapis.com/auth/content"],
            )

            service = build("content", "v2.1", credentials=credentials)

            # Test by getting account info
            account = (
                service.accounts().get(merchantId=merchant_id, accountId=merchant_id).execute()
            )

            return {
                "success": True,
                "message": "Connexion Merchant Center réussie",
                "details": {
                    "merchant_id": merchant_id,
                    "name": account.get("name", "N/A"),
                    "website_url": account.get("websiteUrl", "N/A"),
                },
            }
        except ImportError:
            return {
                "success": False,
                "message": "Module google-api-python-client non installé",
                "details": None,
            }
        except Exception as e:
            error_msg = str(e)
            if "PERMISSION_DENIED" in error_msg or "403" in error_msg:
                return {
                    "success": False,
                    "message": "Accès refusé - vérifiez les permissions du Service Account sur Merchant Center",
                    "details": None,
                }
            if "404" in error_msg:
                return {
                    "success": False,
                    "message": f"Merchant ID '{merchant_id}' non trouvé",
                    "details": None,
                }
            return {
                "success": False,
                "message": f"Erreur Merchant Center: {error_msg[:100]}",
                "details": None,
            }

    def update_config(self, updates: dict[str, str]) -> dict[str, Any]:
        """Update configuration in secure store."""
        # Define which keys are secrets
        secret_keys = {
            "SHOPIFY_API_KEY",
            "SHOPIFY_API_SECRET",
            "SHOPIFY_ACCESS_TOKEN",
            "META_ACCESS_TOKEN",
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "ANTHROPIC_API_KEY",
            "SERPAPI_KEY",
            "INNGEST_SIGNING_KEY",
            "INNGEST_EVENT_KEY",
        }

        try:
            for key, value in updates.items():
                if value:  # Only update non-empty values
                    self._store.set(key, value, is_secret=key in secret_keys)
                    os.environ[key] = value  # Also update runtime environment

            return {"success": True, "message": "Configuration sauvegardée"}
        except Exception as e:
            return {"success": False, "message": f"Erreur: {e!s}"}
