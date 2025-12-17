"""
Secure Configuration Store - Encrypted SQLite Storage
======================================================
Stores API keys and secrets securely using Fernet (AES-128) encryption.
"""

from __future__ import annotations

import json
import os
import sqlite3
from pathlib import Path
from typing import Any

from cryptography.fernet import Fernet


class SecureConfigStore:
    """Encrypted configuration storage using SQLite and Fernet."""

    def __init__(self, db_path: Path | None = None, key_path: Path | None = None) -> None:
        base_dir = Path(__file__).parent.parent
        self.db_path = db_path or base_dir / "data" / "config.db"
        self.key_path = key_path or base_dir / "data" / ".config_key"

        # Ensure data directory exists
        self.db_path.parent.mkdir(parents=True, exist_ok=True)

        # Initialize encryption
        self._fernet = self._get_or_create_fernet()

        # Initialize database
        self._init_db()

    def _get_or_create_fernet(self) -> Fernet:
        """Get existing key or create a new one."""
        if self.key_path.exists():
            with open(self.key_path, "rb") as f:
                key = f.read()
        else:
            key = Fernet.generate_key()
            with open(self.key_path, "wb") as f:
                f.write(key)
            # Restrict permissions (owner only)
            os.chmod(self.key_path, 0o600)

        return Fernet(key)

    def _init_db(self) -> None:
        """Initialize SQLite database with config table."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS config (
                    key TEXT PRIMARY KEY,
                    value_encrypted BLOB NOT NULL,
                    is_secret INTEGER DEFAULT 0,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.execute("""
                CREATE TABLE IF NOT EXISTS service_accounts (
                    name TEXT PRIMARY KEY,
                    content_encrypted BLOB NOT NULL,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
                )
            """)
            conn.commit()

    def _encrypt(self, value: str) -> bytes:
        """Encrypt a string value."""
        return self._fernet.encrypt(value.encode())

    def _decrypt(self, encrypted: bytes) -> str:
        """Decrypt an encrypted value."""
        return self._fernet.decrypt(encrypted).decode()

    def get(self, key: str) -> str | None:
        """Get a configuration value."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT value_encrypted FROM config WHERE key = ?",
                (key,)
            )
            row = cursor.fetchone()
            if row:
                return self._decrypt(row[0])
        return None

    def set(self, key: str, value: str, is_secret: bool = False) -> None:
        """Set a configuration value."""
        encrypted = self._encrypt(value)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO config (key, value_encrypted, is_secret, updated_at)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(key) DO UPDATE SET
                    value_encrypted = excluded.value_encrypted,
                    is_secret = excluded.is_secret,
                    updated_at = CURRENT_TIMESTAMP
            """, (key, encrypted, 1 if is_secret else 0))
            conn.commit()

    def delete(self, key: str) -> None:
        """Delete a configuration value."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("DELETE FROM config WHERE key = ?", (key,))
            conn.commit()

    def get_all(self) -> dict[str, str]:
        """Get all configuration values (decrypted)."""
        result = {}
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT key, value_encrypted FROM config")
            for key, encrypted in cursor.fetchall():
                result[key] = self._decrypt(encrypted)
        return result

    def get_secrets_mask(self) -> dict[str, bool]:
        """Get which keys are marked as secrets."""
        result = {}
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute("SELECT key, is_secret FROM config")
            for key, is_secret in cursor.fetchall():
                result[key] = bool(is_secret)
        return result

    def set_service_account(self, name: str, content: dict[str, Any]) -> None:
        """Store a service account JSON content."""
        json_str = json.dumps(content)
        encrypted = self._encrypt(json_str)
        with sqlite3.connect(self.db_path) as conn:
            conn.execute("""
                INSERT INTO service_accounts (name, content_encrypted, updated_at)
                VALUES (?, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(name) DO UPDATE SET
                    content_encrypted = excluded.content_encrypted,
                    updated_at = CURRENT_TIMESTAMP
            """, (name, encrypted))
            conn.commit()

    def get_service_account(self, name: str) -> dict[str, Any] | None:
        """Get a service account JSON content."""
        with sqlite3.connect(self.db_path) as conn:
            cursor = conn.execute(
                "SELECT content_encrypted FROM service_accounts WHERE name = ?",
                (name,)
            )
            row = cursor.fetchone()
            if row:
                json_str = self._decrypt(row[0])
                return json.loads(json_str)
        return None

    def get_service_account_temp_path(self, name: str) -> Path | None:
        """
        Get service account and write to a temp file for Google libraries.
        Returns the path to the temp file.
        """
        content = self.get_service_account(name)
        if not content:
            return None

        # Write to a temp file in data directory
        temp_path = self.db_path.parent / f".{name}_temp.json"
        with open(temp_path, "w") as f:
            json.dump(content, f)
        os.chmod(temp_path, 0o600)
        return temp_path

    def import_from_env_file(self, env_path: Path) -> dict[str, str]:
        """Import values from a .env file."""
        imported = {}
        if not env_path.exists():
            return imported

        # Define which keys are secrets
        secret_keys = {
            "SHOPIFY_API_KEY", "SHOPIFY_API_SECRET", "SHOPIFY_ACCESS_TOKEN",
            "META_ACCESS_TOKEN",
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN",
            "ANTHROPIC_API_KEY",
            "SERPAPI_KEY",
            "INNGEST_SIGNING_KEY", "INNGEST_EVENT_KEY",
        }

        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                key, value = line.split("=", 1)
                key = key.strip()
                value = value.strip().strip('"').strip("'")
                if value:
                    self.set(key, value, is_secret=key in secret_keys)
                    imported[key] = value

        return imported

    def import_service_account_file(self, name: str, json_path: Path) -> bool:
        """Import a service account JSON file."""
        if not json_path.exists():
            return False

        with open(json_path) as f:
            content = json.load(f)

        self.set_service_account(name, content)
        return True

    def export_to_env(self) -> dict[str, str]:
        """
        Export all config to environment variables (for runtime use).
        Also sets up temp files for service accounts.
        """
        config = self.get_all()

        # Set environment variables
        for key, value in config.items():
            os.environ[key] = value

        # Handle Google service account
        google_sa = self.get_service_account("google")
        if google_sa:
            temp_path = self.get_service_account_temp_path("google")
            if temp_path:
                os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(temp_path)
                os.environ["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"] = str(temp_path)
                config["GOOGLE_APPLICATION_CREDENTIALS"] = str(temp_path)
                config["GOOGLE_SERVICE_ACCOUNT_KEY_PATH"] = str(temp_path)

        return config


# Singleton instance
_store: SecureConfigStore | None = None


def get_secure_store() -> SecureConfigStore:
    """Get the singleton SecureConfigStore instance."""
    global _store
    if _store is None:
        _store = SecureConfigStore()
    return _store
