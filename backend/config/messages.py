"""
Centralized message strings for audit workflows.

This module contains all user-facing messages used in audit results.
Modify these strings to update messages without changing code logic.
"""

# =============================================================================
# GSC AUDIT MESSAGES
# =============================================================================

GSC_ROBOTS_DISALLOW_ALL = {
    "title": "⛔ Indexation bloquée par robots.txt",
    "description": (
        "La règle 'Disallow: /' empêche tous les moteurs de recherche " "d'indexer vos pages."
    ),
    "recommendation": (
        "Retirez la règle 'Disallow: /' de votre robots.txt " "pour permettre l'indexation."
    ),
}

GSC_ROBOTS_NO_SITEMAP = {
    "title": "⚠️ Sitemap non déclaré dans robots.txt",
    "description": (
        "Votre robots.txt ne référence pas de sitemap. "
        "Déclarer le sitemap aide les moteurs de recherche à découvrir vos pages."
    ),
    "recommendation": "Ajoutez 'Sitemap: https://votre-site.com/sitemap.xml' à votre robots.txt.",
}

GSC_ROBOTS_NOT_FOUND = {
    "title": "⚠️ Fichier robots.txt absent",
    "description": (
        "Aucun fichier robots.txt n'a été trouvé. "
        "Ce fichier aide les moteurs de recherche à explorer votre site efficacement."
    ),
    "recommendation": (
        "Shopify génère un robots.txt automatiquement. " "Vérifiez qu'il est accessible."
    ),
}

GSC_SITEMAP_FEW_URLS = {
    "title_template": "📊 Sitemap contient seulement {url_count} URLs",
    "description": (
        "Peu d'URLs dans votre sitemap. " "C'est normal pour un petit site ou un site récent."
    ),
}

GSC_META_TITLE_MISSING = {
    "title": "⛔ Balise title manquante",
    "description": "La balise title est manquante sur la page d'accueil.",
    "recommendation": (
        "Ajoutez un titre unique et descriptif de 50 à 60 caractères "
        "dans les paramètres SEO de Shopify."
    ),
}

GSC_META_TITLE_SHORT = {
    "title_template": "⚠️ Balise title trop courte ({length} caractères)",
    "description": "Un titre court peut réduire votre visibilité dans les résultats de recherche.",
    "recommendation": "Visez un titre de 50 à 60 caractères pour un affichage optimal.",
}

GSC_META_DESC_MISSING = {
    "title": "⚠️ Meta description manquante",
    "description": "Ajoutez une meta description pour améliorer votre taux de clic dans les SERPs.",
    "recommendation": (
        "Rédigez une description attrayante de 150 à 160 caractères "
        "qui résume le contenu de votre page."
    ),
}

GSC_META_DESC_SHORT = {
    "title_template": "📊 Meta description courte ({length} caractères)",
    "description": "Une description courte peut ne pas être assez informative pour les visiteurs.",
    "recommendation": "Visez une description de 150 à 160 caractères.",
}


# =============================================================================
# BOT ACCESS AUDIT MESSAGES
# =============================================================================

BOT_PROTECTION_OK = "✓ Aucune protection bloquante détectée"
BOT_PROTECTION_BLOCKING = "{count} protection(s) bloquante(s) détectée(s)"

BOT_FB_CLOUDFLARE_CHALLENGE = {
    "title": "⚠️ Meta/Facebook reçoit un challenge Cloudflare",
    "description": (
        "Cloudflare whitelist automatiquement les vraies IPs de Meta. "
        "Vérifiez avec le Debugger de Partage Facebook que le crawl fonctionne."
    ),
}

BOT_FB_BLOCKED = {
    "title": "⛔ Meta ne peut pas crawler votre site",
    "description": (
        "Les Dynamic Product Ads et le catalogue Meta "
        "ne fonctionneront pas correctement sans accès crawler."
    ),
    "recommendation": "Whitelistez les User-Agents Meta/Facebook dans votre protection anti-bot.",
}


# =============================================================================
# HELPER FUNCTIONS
# =============================================================================


def format_message(template: str, **kwargs: object) -> str:
    """Format a message template with provided values."""
    return template.format(**kwargs)
