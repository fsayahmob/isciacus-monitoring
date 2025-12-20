"""
Meta Conversion API Client.

Wrapper pour envoyer des événements server-side vers Meta.
Utilisé par les workflows Inngest.
"""

from __future__ import annotations

import hashlib
import time
from typing import Any

import requests

from services.config_service import ConfigService


class MetaCAPIClient:
    """Client pour Meta Conversion API."""

    GRAPH_API_VERSION = "v19.0"
    BASE_URL = "https://graph.facebook.com"

    def __init__(self, config_service: ConfigService | None = None) -> None:
        """Initialize avec ConfigService."""
        config = config_service or ConfigService()
        meta_config = config.get_meta_values()
        self.pixel_id = meta_config.get("pixel_id", "")
        self.access_token = meta_config.get("access_token", "")

    def is_configured(self) -> bool:
        """Vérifie si CAPI est configuré."""
        return bool(self.pixel_id and self.access_token)

    @staticmethod
    def hash_value(value: str) -> str:
        """Hash SHA256 pour user matching."""
        if not value:
            return ""
        return hashlib.sha256(value.lower().strip().encode()).hexdigest()

    def send_event(
        self,
        event_name: str,
        event_id: str,
        event_source_url: str,
        user_data: dict[str, Any],
        custom_data: dict[str, Any] | None = None,
        test_event_code: str | None = None,
    ) -> dict[str, Any]:
        """Envoie un événement à Meta CAPI."""
        if not self.is_configured():
            return {"success": False, "error": "CAPI not configured"}

        event = {
            "event_name": event_name,
            "event_time": int(time.time()),
            "event_id": event_id,
            "event_source_url": event_source_url,
            "action_source": "website",
            "user_data": user_data,
        }

        if custom_data:
            event["custom_data"] = custom_data

        payload: dict[str, Any] = {
            "data": [event],
            "access_token": self.access_token,
        }

        if test_event_code:
            payload["test_event_code"] = test_event_code

        try:
            url = f"{self.BASE_URL}/{self.GRAPH_API_VERSION}/{self.pixel_id}/events"
            response = requests.post(url, json=payload, timeout=10)

            if response.status_code == 200:
                return {"success": True, "response": response.json()}
            return {
                "success": False,
                "error": response.json().get("error", {}).get("message", "Unknown"),
                "status_code": response.status_code,
            }
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}

    def get_pixel_info(self) -> dict[str, Any]:
        """Récupère les infos du pixel."""
        if not self.is_configured():
            return {"success": False, "error": "CAPI not configured"}

        try:
            url = f"{self.BASE_URL}/{self.GRAPH_API_VERSION}/{self.pixel_id}"
            params = {
                "access_token": self.access_token,
                "fields": "name,last_fired_time,is_unavailable",
            }
            response = requests.get(url, params=params, timeout=10)

            if response.status_code == 200:
                return {"success": True, "data": response.json()}
            return {"success": False, "error": response.json()}
        except requests.RequestException as e:
            return {"success": False, "error": str(e)}
