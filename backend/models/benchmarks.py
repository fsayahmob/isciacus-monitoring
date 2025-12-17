"""Pydantic models for benchmarks configuration."""

from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class BenchmarkStatus(str, Enum):
    """Status of a metric based on benchmark thresholds."""

    BAD = "bad"
    OK = "ok"
    GOOD = "good"


class ThresholdRange(BaseModel):
    """Range definition for a threshold."""

    min: float | None = None
    max: float | None = None


class Threshold(BaseModel):
    """Threshold configuration for a metric."""

    label: str
    unit: str
    bad: ThresholdRange
    ok: ThresholdRange
    good: ThresholdRange
    description: str


class BenchmarkSource(BaseModel):
    """Source reference for benchmark data."""

    name: str
    url: str
    metric: str


class BenchmarkConfig(BaseModel):
    """Complete benchmark configuration."""

    industry: str
    version: str
    last_updated: str
    sources: list[BenchmarkSource]
    thresholds: dict[str, Threshold]


def evaluate_benchmark(value: float, threshold: Threshold) -> BenchmarkStatus:
    """Evaluate a value against benchmark thresholds."""
    # Check good first (usually highest)
    if threshold.good.min is not None and value >= threshold.good.min:
        return BenchmarkStatus.GOOD

    # Check bad (usually lowest)
    if threshold.bad.max is not None and value < threshold.bad.max:
        return BenchmarkStatus.BAD

    # Everything else is OK
    return BenchmarkStatus.OK


def get_status_color(status: BenchmarkStatus) -> dict[str, Any]:
    """Get color configuration for a status."""
    colors = {
        BenchmarkStatus.BAD: {"bg": "red", "icon": "circle-x", "label": "Insuffisant"},
        BenchmarkStatus.OK: {"bg": "yellow", "icon": "circle-alert", "label": "Acceptable"},
        BenchmarkStatus.GOOD: {"bg": "green", "icon": "circle-check", "label": "Bon"},
    }
    return colors.get(status, colors[BenchmarkStatus.OK])
