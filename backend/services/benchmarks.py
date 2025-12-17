"""Benchmarks service for loading and managing benchmark configurations."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from models.benchmarks import (
    BenchmarkConfig,
    Threshold,
    ThresholdRange,
    evaluate_benchmark,
    get_status_color,
)


class BenchmarksService:
    """Service for managing benchmark configurations."""

    def __init__(self, config_path: Path | None = None) -> None:
        """Initialize the benchmarks service."""
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config" / "benchmarks.json"
        self.config_path = config_path
        self.industries_path = Path(__file__).parent.parent / "config" / "industries.json"
        self._config: BenchmarkConfig | None = None
        self._industries: dict[str, Any] | None = None

    def _load_industries(self) -> dict[str, Any]:
        """Load industries configuration."""
        if self._industries is not None:
            return self._industries

        if not self.industries_path.exists():
            self._industries = {"industries": [], "sources": []}
            return self._industries

        with self.industries_path.open() as f:
            self._industries = json.load(f)
        return self._industries

    def get_available_industries(self) -> list[dict[str, str]]:
        """Get list of available industries."""
        data = self._load_industries()
        return [
            {"id": ind["id"], "name": ind["name"], "description": ind["description"]}
            for ind in data.get("industries", [])
        ]

    def load_config(self) -> BenchmarkConfig:
        """Load benchmark configuration from JSON file."""
        if self._config is not None:
            return self._config

        with self.config_path.open() as f:
            data = json.load(f)

        # Parse thresholds
        thresholds = {}
        for key, value in data.get("thresholds", {}).items():
            thresholds[key] = Threshold(
                label=value["label"],
                unit=value["unit"],
                bad=ThresholdRange(**value["bad"]),
                ok=ThresholdRange(**value["ok"]),
                good=ThresholdRange(**value["good"]),
                description=value["description"],
            )

        self._config = BenchmarkConfig(
            industry=data["industry"],
            version=data["version"],
            last_updated=data["last_updated"],
            sources=data["sources"],
            thresholds=thresholds,
        )
        return self._config

    def get_thresholds(self) -> dict[str, Threshold]:
        """Get all thresholds."""
        config = self.load_config()
        return config.thresholds

    def evaluate(self, metric_key: str, value: float) -> dict[str, Any]:
        """Evaluate a value against a specific benchmark."""
        config = self.load_config()

        # Map metric keys to config keys for compatibility
        key_mapping = {
            "cvr_luxury": "cvr_global",
            "cvr_global_fashion": "cvr_global",
        }
        lookup_key = key_mapping.get(metric_key, metric_key)
        threshold = config.thresholds.get(lookup_key)

        if threshold is None:
            return {
                "status": "unknown",
                "color": {"bg": "gray", "icon": "circle-help", "label": "Inconnu"},
            }

        status = evaluate_benchmark(value, threshold)
        return {
            "status": status.value,
            "color": get_status_color(status),
            "threshold": {
                "bad": threshold.bad.model_dump(),
                "ok": threshold.ok.model_dump(),
                "good": threshold.good.model_dump(),
            },
        }

    def set_industry(self, industry_id: str) -> BenchmarkConfig:
        """Change the current industry and update thresholds."""
        industries_data = self._load_industries()

        # Find the industry
        industry = None
        for ind in industries_data.get("industries", []):
            if ind["id"] == industry_id:
                industry = ind
                break

        if industry is None:
            msg = f"Industry '{industry_id}' not found"
            raise ValueError(msg)

        # Build new config
        new_config = {
            "industry": industry_id,
            "version": "2025.1",
            "last_updated": "2025-01-15",
            "sources": industries_data.get("sources", []),
            "thresholds": industry["thresholds"],
        }

        # Save to file
        with self.config_path.open("w") as f:
            json.dump(new_config, f, indent=2)

        # Invalidate cache
        self._config = None
        self._industries = None
        return self.load_config()

    def save_config(self, config_data: dict[str, Any]) -> BenchmarkConfig:
        """Save updated benchmark configuration."""
        with self.config_path.open("w") as f:
            json.dump(config_data, f, indent=2)

        # Invalidate cache
        self._config = None
        return self.load_config()

    def get_full_config(self) -> dict[str, Any]:
        """Get full configuration as dict for API response."""
        config = self.load_config()
        return {
            "industry": config.industry,
            "version": config.version,
            "last_updated": config.last_updated,
            "sources": [s.model_dump() for s in config.sources],
            "thresholds": {k: v.model_dump() for k, v in config.thresholds.items()},
        }


# Global instance
benchmarks_service = BenchmarksService()
