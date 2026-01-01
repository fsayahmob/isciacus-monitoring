"""
Path utilities for ISCIACUS backend.
====================================
Centralizes data directory path resolution for Cloud Run compatibility.
Uses DATA_DIR environment variable when set, otherwise falls back to local data/.
"""

from __future__ import annotations

import os
from pathlib import Path


def get_data_dir() -> Path:
    """
    Get the data directory path.

    Uses DATA_DIR env var if set (for Cloud Run with GCS volume),
    otherwise defaults to backend/data/.

    Returns:
        Path to the data directory
    """
    env_data_dir = os.environ.get("DATA_DIR")
    if env_data_dir:
        return Path(env_data_dir)
    return Path(__file__).parent.parent / "data"


def ensure_data_dir() -> Path:
    """
    Get and create the data directory if needed.

    Returns:
        Path to the data directory (created if it didn't exist)
    """
    data_dir = get_data_dir()
    data_dir.mkdir(parents=True, exist_ok=True)
    return data_dir
