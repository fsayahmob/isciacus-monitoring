# SPECIFICATION TECHNIQUE - Stratégie Ads (Version Corrigée)

**Date** : 2025-12-19
**Conformité** : Architecture isciacus-monitoring validée
**Pattern** : Inngest Workflows + Audit Sessions

---

## ⚠️ DIFFÉRENCES AVEC LA SPEC INITIALE

Cette version corrigée **respecte l'architecture existante** :

| Aspect | ❌ Spec initiale | ✅ Spec corrigée |
|--------|-----------------|-----------------|
| **Stockage résultats** | Nouveau `ResultsStoreService` + JSON séparés | Réutilise `AuditOrchestrator` + sessions |
| **Pattern Inngest** | `step: inngest.Step` (incorrect) | `ctx: inngest.Context` + `ctx.step.run()` |
| **Enregistrement workflows** | Import direct | `create_*_function()` wrapper |
| **Endpoints** | `GET` avec `stale/computing` | `POST` trigger + polling session |
| **Client Inngest** | Nouveau fichier `inngest_client.py` | Réutilise `audit_workflow.py` |

---

## 🎯 OBJECTIFS

Implémenter 4 fonctionnalités pour optimiser les campagnes publicitaires :

1. **Meta Conversion API (CAPI)** - Server-side tracking (+15-46% précision)
2. **Analyse RFM/LTV** - Segmentation clients et valeur vie
3. **Paniers Abandonnés** - Calcul potentiel de récupération
4. **Optimisation Budget Ads** - Kelly Criterion pour budget optimal

---

## 📐 ARCHITECTURE CONFORME

### Pattern Standard pour Nouvelles Features

```
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
│  - Clique "Analyze Customers"                                │
│  - POST /api/audits/run/customer_rfm                         │
└────────────────────────┬─────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                BACKEND GATEWAY (monitoring_app.py)           │
│  @app.post("/api/audits/run/customer_rfm")                  │
│      await trigger_customer_rfm_audit()                      │
│      return {"status": "triggered", "run_id": "..."}         │
└────────────────────────┬─────────────────────────────────────┘
                         │ Event: "audit/customer_rfm.requested"
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                 INNGEST SERVER (Orchestrateur)               │
│  - Reçoit event                                              │
│  - Trouve workflow matching                                  │
│  - Exécute async                                             │
└────────────────────────┬─────────────────────────────────────┘
                         │ Callback
                         ▼
┌─────────────────────────────────────────────────────────────┐
│          WORKFLOW (jobs/workflows/customer_rfm.py)           │
│  async def customer_rfm_audit(ctx):                          │
│      result = _init_result(ctx.run_id)                       │
│      step1 = await ctx.step.run("fetch_orders", ...)         │
│      _save_progress(result, "customer_rfm")  ← Session       │
│      step2 = await ctx.step.run("calculate_rfm", ...)        │
│      _save_progress(result, "customer_rfm")                  │
│      return result                                           │
└────────────────────────┬─────────────────────────────────────┘
                         │ Sauvegarde
                         ▼
┌─────────────────────────────────────────────────────────────┐
│           PERSISTENCE (data/audits/latest_session.json)      │
│  {                                                           │
│    "audits": {                                               │
│      "customer_rfm": {                                       │
│        "id": "run_xyz",                                      │
│        "status": "success",                                  │
│        "steps": [...],                                       │
│        "summary": { "total_customers": 1234, ... }           │
│      }                                                       │
│    }                                                         │
│  }                                                           │
└────────────────────────┬─────────────────────────────────────┘
                         │ Polling
                         ▼
┌─────────────────────────────────────────────────────────────┐
│                    FRONTEND (React)                          │
│  useQuery('/api/audits/session', { refetchInterval: 1000 }) │
│  → Affiche résultats en temps réel                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📋 STORY 1 : Meta Conversion API (CAPI)

### Objectif
Implémenter l'envoi d'événements server-side vers Meta pour améliorer le tracking.

---

### 1.1 Créer le Service CAPI (Helper API)

**Fichier** : `backend/services/meta_capi.py`

```python
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
```

---

### 1.2 Créer le Workflow CAPI Audit

**Fichier** : `backend/jobs/workflows/capi_audit.py`

```python
"""
CAPI Audit Workflow.

Audit de la configuration Meta Conversion API.
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client, INNGEST_ENABLED
from services.meta_capi import MetaCAPIClient
from services.config_service import ConfigService


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result structure."""
    return {
        "id": run_id,
        "audit_type": "capi",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _save_progress(result: dict[str, Any]) -> None:
    """Save progress to audit session."""
    from pathlib import Path
    import json

    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)
    latest_file = storage_dir / "latest_session.json"

    # Load existing session
    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": f"session_{result['id'][:8]}",
            "created_at": datetime.now(tz=UTC).isoformat(),
            "audits": {},
        }

    # Update this audit's result
    session["audits"]["capi"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    # Save
    with latest_file.open("w") as f:
        json.dump(session, f, indent=2, default=str)


def _check_credentials() -> dict[str, Any]:
    """Step 1: Check credentials."""
    client = MetaCAPIClient()

    if not client.is_configured():
        return {
            "id": "check_credentials",
            "name": "Vérification credentials",
            "status": "error",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 0,
            "result": {
                "configured": False,
                "pixel_id": None,
                "access_token": None,
            },
            "error_message": "META_PIXEL_ID ou META_ACCESS_TOKEN manquant",
        }

    return {
        "id": "check_credentials",
        "name": "Vérification credentials",
        "status": "success",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 10,
        "result": {
            "configured": True,
            "pixel_id": client.pixel_id,
            "access_token": "***" + client.access_token[-4:] if client.access_token else None,
        },
        "error_message": None,
    }


def _test_connection() -> dict[str, Any]:
    """Step 2: Test CAPI connection."""
    client = MetaCAPIClient()

    # Test avec événement PageView
    result = client.send_event(
        event_name="PageView",
        event_id=f"test_{int(time.time())}",
        event_source_url="https://isciacusstore.com",
        user_data={"client_ip_address": "127.0.0.1"},
        test_event_code="TEST_EVENT_CODE",
    )

    status = "success" if result.get("success") else "error"

    return {
        "id": "test_connection",
        "name": "Test connexion CAPI",
        "status": status,
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 500,
        "result": result,
        "error_message": result.get("error") if not result.get("success") else None,
    }


def _get_pixel_info() -> dict[str, Any]:
    """Step 3: Get pixel info."""
    client = MetaCAPIClient()
    result = client.get_pixel_info()

    status = "success" if result.get("success") else "warning"

    return {
        "id": "pixel_info",
        "name": "Informations Pixel",
        "status": status,
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 300,
        "result": result.get("data") if result.get("success") else {},
        "error_message": result.get("error") if not result.get("success") else None,
    }


def create_capi_audit_function() -> inngest.Function | None:
    """Create CAPI audit workflow."""
    if not INNGEST_ENABLED:
        return None

    @inngest_client.create_function(
        fn_id="capi-audit",
        trigger=inngest.TriggerEvent(event="audit/capi.requested"),
        retries=2,
    )
    async def capi_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Audit de la configuration CAPI."""
        result = _init_result(ctx.run_id)

        # Step 1: Check credentials
        step1 = await ctx.step.run("check_credentials", _check_credentials)
        result["steps"].append(step1)
        _save_progress(result)

        if step1["status"] == "error":
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        # Step 2: Test connection
        step2 = await ctx.step.run("test_connection", _test_connection)
        result["steps"].append(step2)
        _save_progress(result)

        # Step 3: Get pixel info
        step3 = await ctx.step.run("pixel_info", _get_pixel_info)
        result["steps"].append(step3)
        _save_progress(result)

        # Summary
        result["status"] = "success" if all(s["status"] == "success" for s in result["steps"]) else "warning"
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            "configured": step1["result"].get("configured", False),
            "connection_ok": step2["status"] == "success",
            "pixel_name": step3["result"].get("name") if step3["status"] == "success" else None,
        }

        _save_progress(result)
        return result

    return capi_audit
```

---

### 1.3 Enregistrer le Workflow

**Fichier** : `backend/jobs/inngest_setup.py` (ajouter)

```python
from jobs.workflows.capi_audit import create_capi_audit_function

# Dans get_inngest_functions()
if fn := create_capi_audit_function():
    functions.append(fn)

# Ajouter trigger function
async def trigger_capi_audit() -> dict[str, str]:
    """Trigger CAPI audit."""
    if not INNGEST_ENABLED:
        return {"status": "disabled", "message": "Inngest not enabled"}

    try:
        run_id = str(uuid.uuid4())
        await inngest_client.send(
            inngest.Event(
                name="audit/capi.requested",
                data={"run_id": run_id}
            )
        )
        return {"status": "triggered", "run_id": run_id}
    except Exception as e:
        logger.error("Failed to trigger CAPI audit", exc_info=True)
        return {"status": "error", "message": str(e)}
```

---

### 1.4 Ajouter l'Endpoint Gateway

**Fichier** : `backend/monitoring_app.py` (ajouter)

```python
@app.post("/api/audits/run/capi")
async def run_capi_audit() -> dict[str, Any]:
    """Trigger CAPI audit."""
    from jobs.inngest_setup import trigger_capi_audit

    result = await trigger_capi_audit()

    if result["status"] == "error":
        raise HTTPException(status_code=503, detail=result.get("message"))

    return {
        "async": True,
        "run_id": result["run_id"],
        "message": "CAPI audit triggered. Poll /api/audits/session for results.",
    }
```

---

### 1.5 Ajouter AuditType

**Fichier** : `backend/services/audit_orchestrator.py` (modifier)

```python
class AuditType(Enum):
    # ... existants ...
    CAPI = "capi"  # NOUVEAU
```

---

### 1.6 Test Story 1

```bash
# 1. Déclencher l'audit
curl -X POST http://localhost:8080/api/audits/run/capi

# 2. Polling résultats
curl http://localhost:8080/api/audits/session | jq '.session.audits.capi'
```

**Story 1 terminée quand** : L'audit CAPI retourne `{"status": "success"}` ou `{"status": "warning"}`.

---

## 📋 STORY 2 : Analyse RFM/LTV

### Objectif
Calculer les scores RFM et LTV des clients pour le ciblage publicitaire.

---

### 2.1 Créer le Workflow Customer RFM

**Fichier** : `backend/jobs/workflows/customer_rfm.py`

```python
"""
Customer RFM/LTV Analysis Workflow.

Calcule les scores RFM (Recency, Frequency, Monetary) et LTV.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import UTC, datetime
from typing import Any

import inngest

from jobs.audit_workflow import inngest_client, INNGEST_ENABLED
from services.shopify_analytics import ShopifyAnalyticsService


def _init_result(run_id: str) -> dict[str, Any]:
    """Initialize audit result."""
    return {
        "id": run_id,
        "audit_type": "customer_rfm",
        "status": "running",
        "execution_mode": "inngest",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "steps": [],
        "issues": [],
        "summary": {},
    }


def _save_progress(result: dict[str, Any]) -> None:
    """Save progress to session."""
    from pathlib import Path
    import json

    storage_dir = Path(__file__).parent.parent.parent / "data" / "audits"
    storage_dir.mkdir(parents=True, exist_ok=True)
    latest_file = storage_dir / "latest_session.json"

    if latest_file.exists():
        with latest_file.open() as f:
            session = json.load(f)
    else:
        session = {
            "id": f"session_{result['id'][:8]}",
            "created_at": datetime.now(tz=UTC).isoformat(),
            "audits": {},
        }

    session["audits"]["customer_rfm"] = result
    session["updated_at"] = datetime.now(tz=UTC).isoformat()

    with latest_file.open("w") as f:
        json.dump(session, f, indent=2, default=str)


def _fetch_orders(days: int) -> dict[str, Any]:
    """Step 1: Fetch orders from Shopify."""
    shopify = ShopifyAnalyticsService()

    try:
        # Utilise la méthode existante
        orders = shopify._fetch_orders(days, ecommerce_only=False)

        return {
            "id": "fetch_orders",
            "name": "Récupération commandes Shopify",
            "status": "success",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 2000,
            "result": {"total_orders": len(orders), "period_days": days},
            "error_message": None,
            "_data": orders,  # Pour utilisation dans les steps suivants
        }
    except Exception as e:
        return {
            "id": "fetch_orders",
            "name": "Récupération commandes Shopify",
            "status": "error",
            "started_at": datetime.now(tz=UTC).isoformat(),
            "completed_at": datetime.now(tz=UTC).isoformat(),
            "duration_ms": 100,
            "result": {},
            "error_message": str(e),
            "_data": [],
        }


def _calculate_rfm(orders_step: dict[str, Any]) -> dict[str, Any]:
    """Step 2: Calculate RFM scores."""
    orders = orders_step.get("_data", [])

    if not orders:
        return {
            "id": "calculate_rfm",
            "name": "Calcul scores RFM",
            "status": "warning",
            "result": {"total_customers": 0},
            "_data": [],
        }

    # Agrégation par client
    customer_data: dict[str, dict] = defaultdict(
        lambda: {"orders": [], "total_spent": 0, "order_count": 0, "email": None}
    )

    for order in orders:
        customer = order.get("customer")
        if not customer or not customer.get("id"):
            continue

        cid = customer["id"]
        order_date = datetime.fromisoformat(order["createdAt"].replace("Z", "+00:00"))
        amount = float(order.get("totalPriceSet", {}).get("shopMoney", {}).get("amount", 0))

        customer_data[cid]["orders"].append(order_date)
        customer_data[cid]["total_spent"] += amount
        customer_data[cid]["order_count"] += 1
        customer_data[cid]["email"] = customer.get("email")

    # Calcul RFM
    now = datetime.now(UTC)
    rfm_customers = []

    for cid, data in customer_data.items():
        if data["orders"]:
            last_order = max(data["orders"])
            recency = (now - last_order).days
            rfm_customers.append({
                "customer_id": cid.split("/")[-1] if "/" in cid else cid,
                "email": data["email"],
                "recency_days": recency,
                "frequency": data["order_count"],
                "monetary": round(data["total_spent"], 2),
            })

    return {
        "id": "calculate_rfm",
        "name": "Calcul scores RFM",
        "status": "success",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 500,
        "result": {"total_customers": len(rfm_customers)},
        "error_message": None,
        "_data": rfm_customers,
    }


def _calculate_ltv(rfm_step: dict[str, Any]) -> dict[str, Any]:
    """Step 3: Calculate LTV."""
    customers = rfm_step.get("_data", [])

    if not customers:
        return {
            "id": "calculate_ltv",
            "name": "Calcul LTV",
            "status": "warning",
            "result": {"avg_ltv": 0},
        }

    total_value = sum(c["monetary"] for c in customers)
    total_orders = sum(c["frequency"] for c in customers)
    total_customers = len(customers)

    avg_order_value = total_value / total_orders if total_orders else 0
    avg_frequency = total_orders / total_customers if total_customers else 0

    # Churn: inactifs > 180 jours
    churned = len([c for c in customers if c["recency_days"] > 180])
    churn_rate = churned / total_customers if total_customers else 0

    customer_lifespan = 1 / churn_rate if churn_rate > 0 else 3
    avg_ltv = avg_order_value * avg_frequency * customer_lifespan

    return {
        "id": "calculate_ltv",
        "name": "Calcul LTV",
        "status": "success",
        "started_at": datetime.now(tz=UTC).isoformat(),
        "completed_at": datetime.now(tz=UTC).isoformat(),
        "duration_ms": 100,
        "result": {
            "avg_order_value": round(avg_order_value, 2),
            "avg_frequency": round(avg_frequency, 2),
            "churn_rate": round(churn_rate * 100, 1),
            "avg_ltv": round(avg_ltv, 2),
            "total_customers": total_customers,
        },
        "error_message": None,
    }


def create_customer_rfm_function() -> inngest.Function | None:
    """Create Customer RFM workflow."""
    if not INNGEST_ENABLED:
        return None

    @inngest_client.create_function(
        fn_id="customer-rfm-audit",
        trigger=inngest.TriggerEvent(event="audit/customer_rfm.requested"),
        retries=2,
    )
    async def customer_rfm_audit(ctx: inngest.Context) -> dict[str, Any]:
        """Analyse RFM/LTV des clients."""
        result = _init_result(ctx.run_id)
        days = ctx.event.data.get("days", 365)

        # Step 1: Fetch orders
        step1 = await ctx.step.run("fetch_orders", lambda: _fetch_orders(days))
        # Remove _data before saving
        step1_clean = {k: v for k, v in step1.items() if k != "_data"}
        result["steps"].append(step1_clean)
        _save_progress(result)

        if step1["status"] == "error":
            result["status"] = "error"
            result["completed_at"] = datetime.now(tz=UTC).isoformat()
            _save_progress(result)
            return result

        # Step 2: Calculate RFM
        step2 = await ctx.step.run("calculate_rfm", lambda: _calculate_rfm(step1))
        step2_clean = {k: v for k, v in step2.items() if k != "_data"}
        result["steps"].append(step2_clean)
        _save_progress(result)

        # Step 3: Calculate LTV
        step3 = await ctx.step.run("calculate_ltv", lambda: _calculate_ltv(step2))
        result["steps"].append(step3)
        _save_progress(result)

        # Summary
        result["status"] = "success"
        result["completed_at"] = datetime.now(tz=UTC).isoformat()
        result["summary"] = {
            **step2["result"],
            **step3["result"],
        }

        _save_progress(result)
        return result

    return customer_rfm_audit
```

---

### 2.2 Enregistrer et Endpoint

```python
# inngest_setup.py
from jobs.workflows.customer_rfm import create_customer_rfm_function

async def trigger_customer_rfm_audit(days: int = 365) -> dict[str, str]:
    # ... même pattern que CAPI

# monitoring_app.py
@app.post("/api/audits/run/customer_rfm")
async def run_customer_rfm_audit(days: int = Query(365)):
    # ... même pattern que CAPI
```

---

### 2.3 Ajouter AuditType

```python
class AuditType(Enum):
    # ... existants ...
    CUSTOMER_RFM = "customer_rfm"
```

---

### 2.4 Test Story 2

```bash
curl -X POST "http://localhost:8080/api/audits/run/customer_rfm?days=365"
curl http://localhost:8080/api/audits/session | jq '.session.audits.customer_rfm.summary'
```

---

## 📋 STORIES 3 & 4

Les stories suivantes suivent le **même pattern exact** :

- **Story 3** : Paniers Abandonnés → `cart_recovery` audit
- **Story 4** : Optimisation Budget → `ads_optimization` audit

Même structure :
1. Workflow dans `jobs/workflows/`
2. Trigger dans `inngest_setup.py`
3. Endpoint dans `monitoring_app.py`
4. AuditType dans `audit_orchestrator.py`

---

## 📊 RÉSUMÉ DES CHANGEMENTS

### Fichiers à créer

| Fichier | Lignes | Description |
|---------|--------|-------------|
| `services/meta_capi.py` | ~150 | Client Meta CAPI |
| `jobs/workflows/capi_audit.py` | ~200 | Workflow audit CAPI |
| `jobs/workflows/customer_rfm.py` | ~250 | Workflow RFM/LTV |
| `jobs/workflows/cart_recovery.py` | ~200 | Workflow paniers abandonnés |
| `jobs/workflows/ads_optimization.py` | ~180 | Workflow budget optimal |

### Fichiers à modifier

| Fichier | Modification |
|---------|--------------|
| `jobs/inngest_setup.py` | +4 imports, +4 triggers |
| `monitoring_app.py` | +4 endpoints POST |
| `services/audit_orchestrator.py` | +4 enum values |

---

## ✅ AVANTAGES DE CETTE ARCHITECTURE

| Aspect | Bénéfice |
|--------|----------|
| **Réutilise l'existant** | Pas de nouveau système de stockage |
| **Pattern unifié** | Même workflow que GA4, GMC, etc. |
| **Frontend ready** | `useAuditSession` hook existant |
| **Persistance** | Session JSON déjà en place |
| **Polling** | Frontend poll déjà configuré |
| **Testable** | Même pattern de tests E2E |

---

**Prochaine étape** : Implémenter Story 1 (CAPI) ?
