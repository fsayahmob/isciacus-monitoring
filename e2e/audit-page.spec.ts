import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

/**
 * E2E Tests - Audit Page
 * ======================
 * Tests for audit page functionality.
 */

const POCKETBASE_URL = "http://localhost:8090";
const BACKEND_URL = "http://localhost:8000";

// ============================================================================
// HELPER TYPES & INTERFACES
// ============================================================================

interface PocketBaseRecord {
  id: string;
  session_id: string;
  audit_type: string;
  status: "pending" | "running" | "completed" | "failed";
  started_at: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}

interface OrchestratorSession {
  id: string;
  session_id: string;
  planned_audits: string[];
  status: "running" | "completed";
  started_at: string;
  completed_at: string | null;
}

// ============================================================================
// POCKETBASE HELPER FUNCTIONS
// ============================================================================

async function isPocketBaseAvailable(
  request: APIRequestContext,
): Promise<boolean> {
  try {
    const health = await request.get(`${POCKETBASE_URL}/api/health`);
    if (!health.ok()) return false;

    const auditRuns = await request.get(
      `${POCKETBASE_URL}/api/collections/audit_runs/records?perPage=1`,
    );
    if (!auditRuns.ok()) {
      console.error("audit_runs collection not accessible");
      return false;
    }

    const orchSessions = await request.get(
      `${POCKETBASE_URL}/api/collections/orchestrator_sessions/records?perPage=1`,
    );
    if (!orchSessions.ok()) {
      console.error("orchestrator_sessions collection not accessible");
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

async function getPocketBaseAuditRuns(
  request: APIRequestContext,
  sessionId: string,
): Promise<PocketBaseRecord[]> {
  const response = await request.get(
    `${POCKETBASE_URL}/api/collections/audit_runs/records?filter=session_id="${sessionId}"&sort=-started_at`,
  );
  if (!response.ok()) return [];
  const data = await response.json();
  return data.items ?? [];
}

async function getPocketBaseOrchestratorSession(
  request: APIRequestContext,
  sessionId: string,
): Promise<OrchestratorSession | null> {
  const response = await request.get(
    `${POCKETBASE_URL}/api/collections/orchestrator_sessions/records?filter=session_id="${sessionId}"`,
  );
  if (!response.ok()) return null;
  const data = await response.json();
  return data.items?.[0] ?? null;
}

async function deletePocketBaseRecord(
  request: APIRequestContext,
  collection: string,
  recordId: string,
): Promise<void> {
  await request.delete(
    `${POCKETBASE_URL}/api/collections/${collection}/records/${recordId}`,
  );
}

async function cleanupPocketBase(request: APIRequestContext): Promise<void> {
  // Delete all audit_runs
  const runsRes = await request.get(
    `${POCKETBASE_URL}/api/collections/audit_runs/records`,
  );
  if (runsRes.ok()) {
    const runsData = (await runsRes.json()) as { items: Array<{ id: string }> };
    for (const run of runsData.items) {
      await deletePocketBaseRecord(request, "audit_runs", run.id);
    }
  }

  // Delete all orchestrator_sessions
  const sessionsRes = await request.get(
    `${POCKETBASE_URL}/api/collections/orchestrator_sessions/records`,
  );
  if (sessionsRes.ok()) {
    const sessionsData = (await sessionsRes.json()) as {
      items: Array<{ id: string }>;
    };
    for (const session of sessionsData.items) {
      await deletePocketBaseRecord(request, "orchestrator_sessions", session.id);
    }
  }
}

// ============================================================================
// NAVIGATION HELPERS
// ============================================================================

async function navigateToAuditPage(page: Page): Promise<void> {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await page.locator('nav button:has-text("Audit")').first().click();
  await page.waitForTimeout(1000);
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe("Audit Page", () => {
  // Tests will be added here based on user specifications
});
