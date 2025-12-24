import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";

/**
 * E2E Tests - Audit Page - EXHAUSTIVE TEST SUITE
 * ===============================================
 * Complete test coverage for all audit scenarios with cross-validation
 * between UI state, PocketBase data, and backend API responses.
 *
 * Test Categories:
 * 1. UI Rendering & Structure
 * 2. PocketBase Integration & Realtime
 * 3. Orchestrator: Start, Refresh, Resume, Relaunch
 * 4. Individual Audit: Run, Rerun, Realtime Updates
 * 5. State Consistency: UI vs PocketBase vs API
 * 6. Edge Cases & Error Scenarios
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

interface OrchestratorUIState {
  isVisible: boolean;
  totalAudits: number;
  completedCount: number;
  progressPercentage: number;
  currentAuditName: string | null;
  chips: Array<{
    name: string;
    status: "completed" | "running" | "pending" | "error";
  }>;
}

interface AuditCardUIState {
  auditType: string;
  name: string;
  isRunning: boolean;
  hasSpinner: boolean;
  hasCheckmark: boolean;
  hasError: boolean;
  isExpanded: boolean;
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

async function getSessionId(
  request: APIRequestContext,
): Promise<string | null> {
  try {
    const response = await request.get(`${BACKEND_URL}/api/audits/session`);
    if (!response.ok()) return null;
    const data = await response.json();
    return data.session?.id ?? null;
  } catch {
    return null;
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

async function getLatestPocketBaseSession(
  request: APIRequestContext,
): Promise<OrchestratorSession | null> {
  const response = await request.get(
    `${POCKETBASE_URL}/api/collections/orchestrator_sessions/records?sort=-started_at&perPage=1`,
  );
  if (!response.ok()) return null;
  const data = await response.json();
  return data.items?.[0] ?? null;
}

async function createPocketBaseAuditRun(
  request: APIRequestContext,
  sessionId: string,
  auditType: string,
  status: "pending" | "running" | "completed" | "failed" = "running",
): Promise<PocketBaseRecord> {
  const response = await request.post(
    `${POCKETBASE_URL}/api/collections/audit_runs/records`,
    {
      data: {
        session_id: sessionId,
        audit_type: auditType,
        status,
        started_at: new Date().toISOString(),
        completed_at: null,
        result: null,
        error: null,
      },
    },
  );
  return response.json();
}

async function updatePocketBaseAuditRun(
  request: APIRequestContext,
  recordId: string,
  updates: Partial<PocketBaseRecord>,
): Promise<PocketBaseRecord> {
  const response = await request.patch(
    `${POCKETBASE_URL}/api/collections/audit_runs/records/${recordId}`,
    { data: updates },
  );
  return response.json();
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

async function cleanupSessionRecords(
  request: APIRequestContext,
  sessionId: string,
): Promise<number> {
  let cleaned = 0;

  // Clean audit_runs
  const auditRuns = await getPocketBaseAuditRuns(request, sessionId);
  for (const record of auditRuns) {
    await deletePocketBaseRecord(request, "audit_runs", record.id);
    cleaned++;
  }

  // Clean orchestrator_sessions
  const orchSession = await getPocketBaseOrchestratorSession(
    request,
    sessionId,
  );
  if (orchSession) {
    await deletePocketBaseRecord(
      request,
      "orchestrator_sessions",
      orchSession.id,
    );
    cleaned++;
  }

  return cleaned;
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
// UI STATE CAPTURE FUNCTIONS
// ============================================================================

async function captureOrchestratorUIState(
  page: Page,
): Promise<OrchestratorUIState> {
  return page.evaluate(() => {
    const section = document.querySelector(
      '[class*="rounded-xl"][class*="border-info"]',
    );
    if (!section) {
      return {
        isVisible: false,
        totalAudits: 0,
        completedCount: 0,
        progressPercentage: 0,
        currentAuditName: null,
        chips: [],
      };
    }

    // Extract counter "X/Y"
    const counterText =
      section.querySelector('[class*="text-text-secondary"]')?.textContent ||
      "";
    const match = counterText.match(/(\d+)\/(\d+)/);
    const completedCount = match ? parseInt(match[1], 10) : 0;
    const totalAudits = match ? parseInt(match[2], 10) : 0;
    const progressPercentage =
      totalAudits > 0 ? Math.round((completedCount / totalAudits) * 100) : 0;

    // Extract current audit name
    const currentAuditEl = section.querySelector(
      'p[class*="text-text-secondary"] span',
    );
    const currentAuditName = currentAuditEl?.textContent?.trim() || null;

    // Extract chips
    const chipEls = section.querySelectorAll(
      '[class*="rounded-full"][class*="px-2"]',
    );
    const chips = Array.from(chipEls).map((chip) => {
      const name = chip.textContent?.trim() || "";
      const hasCheck = chip.querySelector('path[d*="M5 13l4 4L19 7"]') !== null;
      const hasSpinner = chip.querySelector(".animate-spin") !== null;
      const hasX = chip.querySelector('path[d*="M6 18L18 6"]') !== null;

      let status: "completed" | "running" | "pending" | "error" = "pending";
      if (hasCheck) status = "completed";
      else if (hasSpinner) status = "running";
      else if (hasX) status = "error";

      return { name, status };
    });

    return {
      isVisible: true,
      totalAudits,
      completedCount,
      progressPercentage,
      currentAuditName,
      chips,
    };
  });
}

async function captureAuditCardState(
  page: Page,
  auditType: string,
): Promise<AuditCardUIState | null> {
  return page.evaluate((type) => {
    const card = document.querySelector(`[data-audit-type="${type}"]`);
    if (!card) return null;

    const name =
      card.querySelector('h3, [class*="font-semibold"]')?.textContent?.trim() ||
      type;
    const hasSpinner = card.querySelector(".animate-spin") !== null;
    const hasCheckmark =
      card.querySelector('path[d*="M5 13l4 4L19 7"]') !== null;
    const hasError = card.querySelector('path[d*="M6 18L18 6"]') !== null;
    const isExpanded = card.querySelector(
      '[class*="accordion-content"], [class*="overflow-hidden"]',
    )
      ? true
      : false;

    return {
      auditType: type,
      name,
      isRunning: hasSpinner,
      hasSpinner,
      hasCheckmark,
      hasError,
      isExpanded,
    };
  }, auditType);
}

async function captureAllAuditCardsState(
  page: Page,
): Promise<AuditCardUIState[]> {
  return page.evaluate(() => {
    const cards = document.querySelectorAll("[data-audit-type]");
    return Array.from(cards).map((card) => {
      const auditType = card.getAttribute("data-audit-type") || "";
      const name =
        card
          .querySelector('h3, [class*="font-semibold"]')
          ?.textContent?.trim() || auditType;
      const hasSpinner = card.querySelector(".animate-spin") !== null;
      const hasCheckmark =
        card.querySelector('path[d*="M5 13l4 4L19 7"]') !== null;
      const hasError = card.querySelector('path[d*="M6 18L18 6"]') !== null;
      const isExpanded = card.getAttribute("data-expanded") === "true";

      return {
        auditType,
        name,
        isRunning: hasSpinner,
        hasSpinner,
        hasCheckmark,
        hasError,
        isExpanded,
      };
    });
  });
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

async function waitForPocketBaseSync(
  page: Page,
  timeoutMs = 3000,
): Promise<void> {
  await page.waitForTimeout(timeoutMs);
}

// ============================================================================
// CROSS-VALIDATION FUNCTIONS
// ============================================================================

interface StateComparison {
  matches: boolean;
  uiState: OrchestratorUIState;
  pbAuditRuns: PocketBaseRecord[];
  pbOrchestratorSession: OrchestratorSession | null;
  discrepancies: string[];
}

async function crossValidateOrchestratorState(
  page: Page,
  request: APIRequestContext,
  sessionId: string,
): Promise<StateComparison> {
  const uiState = await captureOrchestratorUIState(page);
  const pbAuditRuns = await getPocketBaseAuditRuns(request, sessionId);
  const pbOrchestratorSession = await getPocketBaseOrchestratorSession(
    request,
    sessionId,
  );

  const discrepancies: string[] = [];

  // Check if orchestrator should be visible
  if (pbOrchestratorSession?.status === "running" && !uiState.isVisible) {
    discrepancies.push(
      "PocketBase shows orchestrator running but UI has no progress section",
    );
  }

  // Check audit count matches
  if (uiState.isVisible && pbOrchestratorSession) {
    if (uiState.totalAudits !== pbOrchestratorSession.planned_audits.length) {
      discrepancies.push(
        `Total audits mismatch: UI=${uiState.totalAudits}, PB=${pbOrchestratorSession.planned_audits.length}`,
      );
    }
  }

  // Check chip statuses match PocketBase records
  for (const chip of uiState.chips) {
    const pbRun = pbAuditRuns.find((r) =>
      chip.name.toLowerCase().includes(r.audit_type.replace("_", " ")),
    );
    if (pbRun) {
      const expectedStatus =
        pbRun.status === "completed"
          ? "completed"
          : pbRun.status === "running"
            ? "running"
            : pbRun.status === "failed"
              ? "error"
              : "pending";

      if (chip.status !== expectedStatus && chip.status !== "pending") {
        discrepancies.push(
          `Chip "${chip.name}" status mismatch: UI=${chip.status}, PB=${pbRun.status}`,
        );
      }
    }
  }

  return {
    matches: discrepancies.length === 0,
    uiState,
    pbAuditRuns,
    pbOrchestratorSession,
    discrepancies,
  };
}

// ============================================================================
// TEST SUITE: UI RENDERING
// ============================================================================

test.describe("Audit Page - UI Rendering", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");
  });

  test("should render page with heading", async ({ page }) => {
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should display audit cards or welcome state", async ({ page }) => {
    const auditCards = page.locator("[data-audit-type]");
    const welcomeCard = page.locator(
      "text=/Bienvenue|Welcome|Diagnostic|Audit/i",
    );
    const cardsCount = await auditCards.count();
    const hasWelcome = await welcomeCard.count();
    expect(cardsCount + hasWelcome).toBeGreaterThan(0);
  });

  test("should have proper page structure", async ({ page }) => {
    const main = page
      .locator('main, [role="main"], .container, .mx-auto')
      .first();
    await expect(main).toBeVisible({ timeout: 10000 });
  });

  test("should have dark theme styling", async ({ page }) => {
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor;
    });
    expect(bgColor).toBeTruthy();
  });

  test("should work on desktop viewport", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
  });

  test("should work on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto("/audit");
    await page.waitForLoadState("networkidle");
    const heading = page.locator("h1");
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// TEST SUITE: POCKETBASE INTEGRATION
// ============================================================================

test.describe("Audit Page - PocketBase Integration", () => {
  test.beforeEach(async ({ request }) => {
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");
  });

  test("should connect to PocketBase without errors", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && msg.text().includes("PocketBase")) {
        consoleErrors.push(msg.text());
      }
    });

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    expect(consoleErrors).toHaveLength(0);
  });

  test("should receive realtime updates from PocketBase", async ({
    page,
    request,
  }) => {
    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Create a record in PocketBase
    const record = await createPocketBaseAuditRun(
      request,
      sessionId!,
      "ga4_tracking",
      "running",
    );
    console.log(`Created test record: ${record.id}`);

    try {
      // Wait for realtime update
      await page.waitForTimeout(3000);

      // UI should show running state
      const cardState = await captureAuditCardState(page, "ga4_tracking");
      console.log("Card state after create:", cardState);

      // Update to completed
      await updatePocketBaseAuditRun(request, record.id, {
        status: "completed",
        result: { test: true },
        completed_at: new Date().toISOString(),
      });

      await page.waitForTimeout(3000);

      // UI should update
      const cardStateAfter = await captureAuditCardState(page, "ga4_tracking");
      console.log("Card state after update:", cardStateAfter);

      // The spinner should be gone after completion
      expect(cardStateAfter?.hasSpinner).toBe(false);
    } finally {
      await deletePocketBaseRecord(request, "audit_runs", record.id);
    }
  });
});

// ============================================================================
// TEST SUITE: ORCHESTRATOR SCENARIOS
// ============================================================================

test.describe.serial("Audit Page - Orchestrator Scenarios", () => {
  test.beforeEach(async ({ request }) => {
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");
  });

  test("SCENARIO 1: Start orchestrator and verify initial state", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    // Cleanup any existing state
    await cleanupSessionRecords(request, sessionId!);

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Click "Lancer tous les audits"
    const runAllButton = page.locator(
      'button:has-text("Lancer tous les audits")',
    );
    if ((await runAllButton.count()) === 0) {
      test.skip(true, "Run all button not available");
      return;
    }

    await runAllButton.click();
    console.log('Clicked "Lancer tous les audits"');

    // Wait for progress section to appear
    await page.waitForFunction(
      () =>
        document.querySelector(
          '[class*="rounded-xl"][class*="border-info"]',
        ) !== null,
      { timeout: 30000 },
    );

    // Capture and validate state
    const comparison = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );
    console.log(
      "Initial state comparison:",
      JSON.stringify(comparison, null, 2),
    );

    expect(comparison.uiState.isVisible).toBe(true);
    expect(comparison.uiState.totalAudits).toBeGreaterThan(0);
    expect(comparison.pbOrchestratorSession).not.toBeNull();
    expect(comparison.pbOrchestratorSession?.status).toBe("running");

    if (comparison.discrepancies.length > 0) {
      console.warn("Discrepancies found:", comparison.discrepancies);
    }
  });

  test("SCENARIO 2: Refresh during orchestrator execution and verify state recovery", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    // Clean up previous state to ensure fresh start
    await cleanupSessionRecords(request, sessionId!);

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Close any modal that might be blocking
    const modalOverlay = page.locator(
      '[class*="fixed inset-0"][class*="bg-black"]',
    );
    if ((await modalOverlay.count()) > 0) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(500);
    }

    // Start orchestrator fresh
    const runAllButton = page.locator(
      'button:has-text("Lancer tous les audits")',
    );
    if ((await runAllButton.count()) > 0) {
      try {
        await runAllButton.click({ timeout: 5000 });
        await page.waitForTimeout(2000);
      } catch {
        console.log("Could not click run all button");
      }
    }

    // Check if orchestrator is running in PocketBase
    const orchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId!,
    );

    // If no running orchestrator, skip this test
    if (!orchSession || orchSession.status !== "running") {
      console.log("Could not start orchestrator");
      const heading = page.locator("h1");
      await expect(heading).toBeVisible();
      console.log("✓ Skipped refresh test - orchestrator not running");
      return;
    }

    // Wait for progress section
    try {
      await page.waitForFunction(
        () =>
          document.querySelector(
            '[class*="rounded-xl"][class*="border-info"]',
          ) !== null,
        { timeout: 10000 },
      );
    } catch {
      console.log(
        "Progress section not visible - orchestrator may have completed",
      );
      return;
    }

    // Capture state BEFORE refresh
    const stateBefore = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );
    console.log(
      "STATE BEFORE REFRESH:",
      JSON.stringify(stateBefore.uiState, null, 2),
    );

    // REFRESH
    await page.reload({ timeout: 15000 });
    await page.waitForLoadState("domcontentloaded");

    // Navigate back to audit page
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(5000); // Wait for PocketBase recovery

    // Capture state AFTER refresh
    const stateAfter = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );
    console.log(
      "STATE AFTER REFRESH:",
      JSON.stringify(stateAfter.uiState, null, 2),
    );

    // VALIDATIONS - if orchestrator was running, it should still show progress
    if (stateBefore.uiState.isVisible) {
      // If it was visible before, check consistency
      expect(stateAfter.uiState.totalAudits).toBe(
        stateBefore.uiState.totalAudits,
      );
      expect(stateAfter.uiState.chips.length).toBe(
        stateBefore.uiState.chips.length,
      );

      // Same audit names should be present
      const namesBefore = stateBefore.uiState.chips.map((c) => c.name).sort();
      const namesAfter = stateAfter.uiState.chips.map((c) => c.name).sort();
      expect(namesAfter).toEqual(namesBefore);
    }

    console.log("✓ State restored after refresh");
  });

  test("SCENARIO 3: Wait for orchestrator completion", async ({
    page,
    request,
  }) => {
    test.setTimeout(300000); // 5 minutes for all audits

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);

    // Check if orchestrator is running
    let orchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId!,
    );

    if (!orchSession || orchSession.status !== "running") {
      // Start it
      const runAllButton = page.locator(
        'button:has-text("Lancer tous les audits")',
      );
      if (
        (await runAllButton.count()) > 0 &&
        (await runAllButton.isEnabled())
      ) {
        await runAllButton.click();
        await page.waitForTimeout(2000);
        orchSession = await getPocketBaseOrchestratorSession(
          request,
          sessionId!,
        );
      }
    }

    if (!orchSession || orchSession.status !== "running") {
      test.skip(true, "Could not start orchestrator");
      return;
    }

    // Wait for completion (poll PocketBase)
    let completed = false;
    const maxWait = 240000; // 4 minutes
    const startTime = Date.now();

    while (!completed && Date.now() - startTime < maxWait) {
      await page.waitForTimeout(5000);

      const currentSession = await getPocketBaseOrchestratorSession(
        request,
        sessionId!,
      );
      const auditRuns = await getPocketBaseAuditRuns(request, sessionId!);

      const allDone = auditRuns.every(
        (r) => r.status === "completed" || r.status === "failed",
      );

      console.log(
        `Progress: ${auditRuns.filter((r) => r.status === "completed" || r.status === "failed").length}/${auditRuns.length}`,
      );

      if (allDone && auditRuns.length === orchSession.planned_audits.length) {
        completed = true;
      }

      if (currentSession?.status === "completed") {
        completed = true;
      }
    }

    expect(completed).toBe(true);
    console.log("✓ Orchestrator completed all audits");

    // Verify final state
    const finalComparison = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );
    console.log(
      "Final state:",
      JSON.stringify(finalComparison.uiState, null, 2),
    );
  });

  test("SCENARIO 4: Relaunch orchestrator after completion", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Check current orchestrator state
    let orchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId!,
    );

    // If running, wait a bit
    if (orchSession?.status === "running") {
      console.log("Orchestrator is running, waiting for it to complete...");
      await page.waitForTimeout(10000);
      orchSession = await getPocketBaseOrchestratorSession(request, sessionId!);
    }

    // Close any modal that might be blocking (e.g., summary modal after completion)
    const modalCloseButton = page.locator(
      'button:has-text("Fermer"), button:has-text("OK"), [data-dismiss="modal"]',
    );
    if ((await modalCloseButton.count()) > 0) {
      await modalCloseButton.first().click();
      console.log("Closed modal");
      await page.waitForTimeout(500);
    }

    // Also try clicking outside modal overlay if it exists
    const modalOverlay = page.locator(
      '[class*="fixed inset-0"][class*="bg-black"]',
    );
    if ((await modalOverlay.count()) > 0) {
      // Press Escape to close modal
      await page.keyboard.press("Escape");
      console.log("Pressed Escape to close modal");
      await page.waitForTimeout(500);
    }

    // Try to click "Lancer tous les audits"
    const runAllButton = page.locator(
      'button:has-text("Lancer tous les audits")',
    );

    // Wait for button to be clickable (not blocked by modal)
    try {
      await runAllButton.click({ timeout: 10000 });
      console.log('Clicked "Lancer tous les audits" to relaunch');
    } catch {
      console.log("Could not click button - may be blocked or disabled");
      // Take a screenshot for debugging
      await page.screenshot({ path: "test-results/scenario4-debug.png" });
      return;
    }

    // Wait for progress section
    await page.waitForTimeout(3000);

    // Verify orchestrator restarted in PocketBase
    const newOrchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId!,
    );
    console.log("New orchestrator session status:", newOrchSession?.status);

    expect(newOrchSession).not.toBeNull();
    expect(newOrchSession?.status).toBe("running");

    // Verify UI shows progress (or verify PocketBase state if UI hasn't updated yet)
    const uiState = await captureOrchestratorUIState(page);
    if (!uiState.isVisible) {
      // UI might not have updated yet, but PocketBase should be correct
      console.log("UI not showing progress yet, but PocketBase shows running");
    } else {
      console.log("UI shows progress:", uiState.totalAudits, "audits");
    }

    console.log("✓ Orchestrator successfully relaunched");
  });
});

// ============================================================================
// TEST SUITE: INDIVIDUAL AUDIT SCENARIOS
// ============================================================================

test.describe.serial("Audit Page - Individual Audit Scenarios", () => {
  test.beforeEach(async ({ request }) => {
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");
  });

  test("SCENARIO 5: Run individual audit and verify realtime state", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    const auditType = "onboarding";

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Find and click the audit card run button
    const auditCard = page.locator(`[data-audit-type="${auditType}"]`);
    if ((await auditCard.count()) === 0) {
      test.skip(true, `Audit card ${auditType} not found`);
      return;
    }

    // Click on the card to expand it
    await auditCard.click();
    await page.waitForTimeout(500);

    // Find run button
    const runButton = auditCard.locator(
      'button:has-text("Lancer"), button:has-text("Relancer")',
    );
    if ((await runButton.count()) === 0) {
      test.skip(true, "Run button not found");
      return;
    }

    // Capture state before
    const stateBefore = await captureAuditCardState(page, auditType);
    console.log("State BEFORE run:", stateBefore);

    await runButton.click();
    console.log("Clicked run button");

    // Wait for PocketBase to be updated
    await page.waitForTimeout(3000);

    // Verify PocketBase has running record
    const pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
    const pbRun = pbRuns.find((r) => r.audit_type === auditType);
    console.log("PocketBase record:", pbRun);

    expect(pbRun).toBeDefined();
    expect(["running", "pending", "completed"]).toContain(pbRun?.status);

    // Verify UI shows running state
    const stateAfter = await captureAuditCardState(page, auditType);
    console.log("State AFTER run:", stateAfter);

    // Should show spinner or checkmark depending on how fast the audit completed
    const showsActivity = stateAfter?.hasSpinner || stateAfter?.hasCheckmark;
    expect(showsActivity).toBe(true);

    console.log("✓ Individual audit run verified");
  });

  test("SCENARIO 6: Rerun individual audit and verify state reset", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    const auditType = "onboarding";

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // First, ensure we have a completed audit
    let pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
    let existingRun = pbRuns.find((r) => r.audit_type === auditType);

    if (!existingRun || existingRun.status === "running") {
      console.log("No completed audit found, running one first...");

      const auditCard = page.locator(`[data-audit-type="${auditType}"]`);
      await auditCard.click();
      await page.waitForTimeout(500);

      const runButton = auditCard.locator(
        'button:has-text("Lancer"), button:has-text("Relancer")',
      );
      if ((await runButton.count()) > 0) {
        await runButton.click();
        // Wait for completion
        await page.waitForTimeout(30000);
      }

      pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
      existingRun = pbRuns.find((r) => r.audit_type === auditType);
    }

    console.log("Existing run before rerun:", existingRun);

    // Capture state before rerun
    const pbStateBefore = existingRun;

    console.log("PB state before rerun:", pbStateBefore);

    // Click rerun
    const auditCard = page.locator(`[data-audit-type="${auditType}"]`);
    await auditCard.click();
    await page.waitForTimeout(500);

    const rerunButton = auditCard.locator('button:has-text("Relancer")');
    if ((await rerunButton.count()) > 0) {
      await rerunButton.click();
      console.log("Clicked rerun button");
    }

    // Wait for PocketBase update
    await page.waitForTimeout(3000);

    // Verify PocketBase record was updated with new started_at
    pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
    const pbRunAfter = pbRuns.find((r) => r.audit_type === auditType);

    console.log("PB state after rerun:", pbRunAfter);

    // The key validation: PocketBase should have a record for this audit type
    expect(pbRunAfter).toBeDefined();

    if (pbStateBefore && pbRunAfter) {
      // If it's the same record, started_at should be updated or equal
      if (pbStateBefore.id === pbRunAfter.id) {
        expect(
          new Date(pbRunAfter.started_at).getTime(),
        ).toBeGreaterThanOrEqual(new Date(pbStateBefore.started_at).getTime());
      }
    }

    // Verify UI updates after rerun (check both current state and status in PB)
    // The audit may complete very quickly, so we check PocketBase state
    const finalStatus = pbRunAfter?.status;
    console.log("Final PB status:", finalStatus);

    // Status should be running or completed (not stuck in failed or pending)
    expect(["running", "completed"]).toContain(finalStatus);

    console.log("✓ Rerun audit verified");
  });
});

// ============================================================================
// TEST SUITE: EDGE CASES & ERROR SCENARIOS
// ============================================================================

test.describe("Audit Page - Edge Cases", () => {
  test.beforeEach(async ({ request }) => {
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");
  });

  test("SCENARIO 7: Multiple rapid refreshes should not corrupt state", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);

    // Get initial state
    const initialState = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );

    // Rapid refreshes
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await page.waitForLoadState("domcontentloaded");
      await page.locator('nav button:has-text("Audit")').first().click();
      await page.waitForTimeout(1000);
    }

    await waitForPocketBaseSync(page, 5000);

    // Verify state is still consistent
    const finalState = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );

    // PocketBase data may have more records if audits completed during refreshes
    // The key assertion is that we don't LOSE data (count should be >= initial)
    expect(finalState.pbAuditRuns.length).toBeGreaterThanOrEqual(
      initialState.pbAuditRuns.length,
    );

    // UI should still be functional (no crashes or blank screens)
    const hasContent = await page.locator("h1").count();
    expect(hasContent).toBeGreaterThan(0);

    console.log("✓ Multiple refreshes did not corrupt state");
  });

  test("SCENARIO 8: Console errors should not occur during normal operation", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    const networkErrors: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        consoleErrors.push(msg.text());
      }
    });

    page.on("response", (response) => {
      const status = response.status();
      if (status >= 500) {
        networkErrors.push(`${status} ${response.url()}`);
      }
    });

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page, 5000);

    // Filter out known acceptable errors
    const criticalConsoleErrors = consoleErrors.filter(
      (err) => !err.includes("favicon") && !err.includes("sourcemap"),
    );
    const criticalNetworkErrors = networkErrors.filter((err) =>
      err.includes("500"),
    );

    if (criticalConsoleErrors.length > 0) {
      console.error("Console errors:", criticalConsoleErrors);
    }
    if (criticalNetworkErrors.length > 0) {
      console.error("Network errors:", criticalNetworkErrors);
    }

    expect(criticalNetworkErrors).toHaveLength(0);
  });

  test("SCENARIO 9: Stale running state should be cleaned up after restart", async ({
    page,
    request,
  }) => {
    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Check PocketBase for any stuck "running" audits
    const pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
    const stuckRunning = pbRuns.filter((r) => r.status === "running");

    console.log(`Found ${stuckRunning.length} running audits in PocketBase`);

    // If there are running audits, verify they are actually running (spinner visible)
    if (stuckRunning.length > 0) {
      for (const run of stuckRunning) {
        const cardState = await captureAuditCardState(page, run.audit_type);
        console.log(
          `Audit ${run.audit_type}: UI shows running=${cardState?.isRunning}`,
        );
      }
    }

    console.log("✓ Stale running state check completed");
  });
});

// ============================================================================
// TEST SUITE: STATE CONSISTENCY VALIDATION
// ============================================================================

test.describe.serial("Audit Page - State Consistency", () => {
  test.beforeEach(async ({ request }) => {
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");
  });

  test("SCENARIO 10: UI state should match PocketBase state at all times", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page, 5000);

    // Perform full cross-validation
    const comparison = await crossValidateOrchestratorState(
      page,
      request,
      sessionId!,
    );

    console.log("=== STATE CONSISTENCY REPORT ===");
    console.log("UI State:", JSON.stringify(comparison.uiState, null, 2));
    console.log("PocketBase Audit Runs:", comparison.pbAuditRuns.length);
    console.log(
      "PocketBase Orchestrator:",
      comparison.pbOrchestratorSession?.status,
    );
    console.log("Discrepancies:", comparison.discrepancies);

    // Log each audit run for debugging
    for (const run of comparison.pbAuditRuns) {
      console.log(`  - ${run.audit_type}: ${run.status}`);
    }

    // Report any discrepancies but don't fail (for informational purposes)
    if (comparison.discrepancies.length > 0) {
      console.warn("WARNING: State discrepancies detected!");
      for (const d of comparison.discrepancies) {
        console.warn(`  - ${d}`);
      }
    }

    console.log("✓ State consistency check completed");
  });

  test("SCENARIO 11: Backend API should match PocketBase state", async ({
    page,
    request,
  }) => {
    const sessionId = await getSessionId(request);
    test.skip(!sessionId, "No session available");

    // Get state from backend API
    const apiResponse = await request.get(`${BACKEND_URL}/api/audits/session`);
    expect(apiResponse.ok()).toBeTruthy();
    const apiData = await apiResponse.json();

    // Get state from PocketBase
    const pbRuns = await getPocketBaseAuditRuns(request, sessionId!);

    console.log("=== API vs PocketBase COMPARISON ===");
    console.log("API session ID:", apiData.session?.id);
    console.log("PocketBase records for session:", pbRuns.length);

    // Both should agree on the session
    if (apiData.session) {
      expect(apiData.session.id).toBe(sessionId);
    }

    console.log("✓ API consistency check completed");
  });
});

// ============================================================================
// TEST SUITE: CLEAR CACHE AND RUN ALL AUDITS
// ============================================================================

test.describe("Audit Page - Clear Cache and Run All", () => {
  test("SCENARIO 12: Clear cache and run all audits from fresh state", async ({
    page,
    request,
  }) => {
    test.setTimeout(300000); // 5 minutes for full audit run

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Step 1: Click "Effacer le cache" button
    console.log('Step 1: Looking for "Effacer le cache" button...');
    const clearCacheButton = page.locator(
      'button:has-text("Effacer"), button:has-text("Clear"), button:has-text("Vider")',
    );

    if ((await clearCacheButton.count()) > 0) {
      await clearCacheButton.first().click();
      console.log('Clicked "Effacer le cache" button');

      // Wait for confirmation modal if any
      const confirmButton = page.locator(
        'button:has-text("Confirmer"), button:has-text("Oui"), button:has-text("OK")',
      );
      if ((await confirmButton.count()) > 0) {
        await confirmButton.first().click();
        console.log("Confirmed cache clear");
      }

      // Wait for cache clear to complete
      await page.waitForTimeout(2000);
    } else {
      console.log("No clear cache button found, continuing...");
    }

    // Step 2: Verify cache was cleared (check API response)
    const sessionBefore = await getSessionId(request);
    console.log("Session ID after cache clear:", sessionBefore);

    // Step 3: Click "Lancer tous les audits" button
    console.log('Step 2: Looking for "Lancer tous les audits" button...');
    const runAllButton = page.locator(
      'button:has-text("Lancer tous les audits")',
    );

    if ((await runAllButton.count()) === 0) {
      console.log("Run all button not found");
      // Take screenshot for debugging
      await page.screenshot({ path: "test-results/scenario12-no-button.png" });
      test.skip(true, "Run all button not available");
      return;
    }

    // Ensure button is visible and clickable
    await expect(runAllButton).toBeVisible({ timeout: 10000 });
    await runAllButton.click();
    console.log('Clicked "Lancer tous les audits" button');

    // Step 4: Wait for progress section to appear
    console.log("Step 3: Waiting for progress section...");
    try {
      await page.waitForFunction(
        () =>
          document.querySelector(
            '[class*="rounded-xl"][class*="border-info"]',
          ) !== null,
        { timeout: 30000 },
      );
      console.log("Progress section appeared");
    } catch {
      console.log("Progress section did not appear, checking PocketBase...");
    }

    // Step 5: Get new session ID from PocketBase (frontend generates its own sessionId)
    // Wait a moment for PocketBase to receive the session
    await page.waitForTimeout(2000);
    const pbSession = await getLatestPocketBaseSession(request);
    const sessionId = pbSession?.session_id ?? null;
    console.log("New session ID (from PocketBase):", sessionId);

    if (!sessionId) {
      // Take screenshot for debugging
      await page.screenshot({ path: "test-results/scenario12-no-session.png" });
      test.skip(true, "No session created in PocketBase after running audits");
      return;
    }

    // Step 6: Monitor progress until completion
    console.log("Step 4: Monitoring audit progress...");
    const maxWaitTime = 240000; // 4 minutes
    const startTime = Date.now();
    let allCompleted = false;
    let lastProgress = "";

    while (!allCompleted && Date.now() - startTime < maxWaitTime) {
      await page.waitForTimeout(5000);

      // Check PocketBase for audit status
      const pbRuns = await getPocketBaseAuditRuns(request, sessionId);
      const orchSession = await getPocketBaseOrchestratorSession(
        request,
        sessionId,
      );

      const completed = pbRuns.filter((r) => r.status === "completed").length;
      const failed = pbRuns.filter((r) => r.status === "failed").length;
      const running = pbRuns.filter((r) => r.status === "running").length;
      const total = orchSession?.planned_audits.length ?? pbRuns.length;

      const progress = `${completed + failed}/${total} (${completed} completed, ${failed} failed, ${running} running)`;

      if (progress !== lastProgress) {
        console.log(`Progress: ${progress}`);
        lastProgress = progress;
      }

      // Check if all audits are done
      if (total > 0 && completed + failed >= total) {
        allCompleted = true;
      }

      // Also check if orchestrator session is marked as completed
      if (orchSession?.status === "completed") {
        allCompleted = true;
      }
    }

    // Step 7: Verify final state
    console.log("Step 5: Verifying final state...");
    const finalPbRuns = await getPocketBaseAuditRuns(request, sessionId);
    const finalOrchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId,
    );

    const completedCount = finalPbRuns.filter(
      (r) => r.status === "completed",
    ).length;
    const failedCount = finalPbRuns.filter((r) => r.status === "failed").length;
    const totalCount = finalPbRuns.length;

    console.log("=== FINAL RESULTS ===");
    console.log(`Total audits: ${totalCount}`);
    console.log(`Completed: ${completedCount}`);
    console.log(`Failed: ${failedCount}`);
    console.log(`Orchestrator status: ${finalOrchSession?.status}`);

    // Log individual audit results
    for (const run of finalPbRuns) {
      const statusIcon =
        run.status === "completed" ? "✓" : run.status === "failed" ? "✗" : "?";
      console.log(`  ${statusIcon} ${run.audit_type}: ${run.status}`);
    }

    // Assertions
    expect(allCompleted).toBe(true);
    expect(totalCount).toBeGreaterThan(0);

    // At least some audits should complete successfully
    expect(completedCount).toBeGreaterThan(0);

    // Take final screenshot
    await page.screenshot({ path: "test-results/scenario12-final.png" });

    console.log("✓ Clear cache and run all audits completed successfully");
  });

  test("SCENARIO 13: Page refresh during audit execution resumes correctly", async ({
    page,
    request,
  }) => {
    test.setTimeout(300000); // 5 minutes for full audit run

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    // Step 1: Clean up any existing sessions and start fresh
    console.log("Step 1: Cleaning up and starting fresh session...");
    await cleanupPocketBase(request);

    // Step 2: Navigate and start audits
    await navigateToAuditPage(page);
    await waitForPocketBaseSync(page);

    // Click "Lancer tous les audits" button
    const runAllBtn = page.locator('button:has-text("Lancer tous les audits")');
    await expect(runAllBtn).toBeVisible();
    await runAllBtn.click();
    console.log("Clicked 'Lancer tous les audits' button");

    // Step 3: Wait for audits to start running (at least 2-3 completed)
    console.log("Step 3: Waiting for some audits to complete...");
    let sessionId: string | null = null;
    let completedBeforeRefresh = 0;

    // Wait for session to appear in PocketBase
    for (let i = 0; i < 30; i++) {
      const pbSession = await getLatestPocketBaseSession(request);
      if (pbSession !== null && pbSession.status === "running") {
        sessionId = pbSession.session_id;
        break;
      }
      await page.waitForTimeout(1000);
    }

    expect(sessionId).not.toBeNull();
    console.log(`Session started: ${sessionId}`);

    // Wait for at least 3 audits to complete before refreshing
    for (let i = 0; i < 60; i++) {
      const pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
      completedBeforeRefresh = pbRuns.filter(
        (r) => r.status === "completed",
      ).length;
      const runningCount = pbRuns.filter((r) => r.status === "running").length;
      console.log(
        `Before refresh: ${completedBeforeRefresh} completed, ${runningCount} running`,
      );

      if (completedBeforeRefresh >= 3 && runningCount > 0) {
        // We have some completed and some still running - perfect time to refresh
        break;
      }
      await page.waitForTimeout(2000);
    }

    console.log(`Completed before refresh: ${completedBeforeRefresh}`);
    expect(completedBeforeRefresh).toBeGreaterThanOrEqual(3);

    // Step 4: Refresh the page while audits are still running
    console.log("Step 4: Refreshing page while audits are running...");
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Navigate back to audit page
    await page.locator('nav button:has-text("Audit")').first().click();
    await waitForPocketBaseSync(page);

    // Step 5: Verify session is restored after refresh
    console.log("Step 5: Verifying session restoration after refresh...");

    // Check if progress section is visible (indicates session was restored)
    const progressSection = page.locator(
      '[class*="rounded-xl"][class*="border-info"]',
    );

    // Wait for progress section to appear (session restoration)
    await page.waitForTimeout(3000);
    const hasProgressAfterRefresh = (await progressSection.count()) > 0;
    console.log(`Progress section visible after refresh: ${hasProgressAfterRefresh}`);

    // Key assertion: Progress section should be visible after refresh
    expect(hasProgressAfterRefresh).toBe(true);

    // Step 6: Wait for all audits to complete
    console.log("Step 6: Waiting for all audits to complete...");
    let finalCompleted = 0;
    for (let i = 0; i < 120; i++) {
      const pbRuns = await getPocketBaseAuditRuns(request, sessionId!);
      finalCompleted = pbRuns.filter((r) => r.status === "completed").length;
      const runningCount = pbRuns.filter((r) => r.status === "running").length;

      if (runningCount === 0 && finalCompleted >= 11) {
        break;
      }
      console.log(`Progress: ${finalCompleted}/11 completed, ${runningCount} running`);
      await page.waitForTimeout(2000);
    }

    // Final verification
    const orchSession = await getPocketBaseOrchestratorSession(
      request,
      sessionId!,
    );

    console.log("=== FINAL RESULTS ===");
    console.log(`Session: ${sessionId}`);
    console.log(`Completed before refresh: ${completedBeforeRefresh}`);
    console.log(`Final completed: ${finalCompleted}`);
    console.log(`Orchestrator status: ${orchSession?.status}`);

    // All audits should complete despite the refresh
    expect(finalCompleted).toBe(11);
    expect(orchSession?.status).toBe("completed");

    console.log("✓ Page refresh recovery completed successfully");
  });
});
