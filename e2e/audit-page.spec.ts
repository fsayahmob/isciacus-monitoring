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
      await deletePocketBaseRecord(
        request,
        "orchestrator_sessions",
        session.id,
      );
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
  // Wait for audit cards to load (any audit card with data-audit-type attribute)
  await page.waitForSelector("[data-audit-type]", { timeout: 15000 });
  await page.waitForTimeout(500);
}

// ============================================================================
// AUDIT STATE HELPERS
// ============================================================================

/**
 * Wait for audit to start running after clicking "Lancer".
 * Handles the intermediate "Démarrage..." (pending) state before "En cours..." (running).
 */
async function waitForAuditToStartRunning(
  auditCard: ReturnType<Page["locator"]>,
  timeout: number = 15000,
): Promise<void> {
  const pendingIndicator = auditCard.locator(
    '[data-testid="audit-pending-indicator"]',
  );
  const runningIndicator = auditCard.locator(
    '[data-testid="audit-running-indicator"]',
  );

  // Wait for either pending or running state to appear
  await expect(pendingIndicator.or(runningIndicator)).toBeVisible({ timeout });

  // If we got the pending state, wait for it to transition to running
  const isPending = await pendingIndicator.isVisible().catch(() => false);
  if (isPending) {
    // Wait for running indicator to appear (pending will disappear)
    await expect(runningIndicator).toBeVisible({ timeout: 10000 });
  }

  // Verify we're now in running state
  await expect(runningIndicator).toContainText("En cours");
}

// ============================================================================
// REPORT CLEARING VERIFICATION HELPER
// ============================================================================

/**
 * Verifies that if a report/badge exists before launch, it is cleared when the audit starts.
 * Returns true if there was a previous report, false otherwise.
 */
async function verifyReportClearingOnRun(
  auditCard: ReturnType<Page["locator"]>,
  _pipelinePanel: ReturnType<Page["locator"]>,
): Promise<{ hadPreviousReport: boolean }> {
  const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
  const hadPreviousReport = await statusBadge.isVisible().catch(() => false);

  return { hadPreviousReport };
}

/**
 * After clicking "Lancer", verify that previous report is cleared.
 * Badge should disappear when audit starts running.
 */
async function verifyReportClearedAfterStart(
  auditCard: ReturnType<Page["locator"]>,
  hadPreviousReport: boolean,
): Promise<void> {
  if (hadPreviousReport) {
    // Badge should be hidden when audit is running
    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    // Wait a bit for the UI to update
    await expect(statusBadge).not.toBeVisible({ timeout: 15000 });
    console.log("   ✓ Previous report badge cleared on audit start");
  }
}

// ============================================================================
// ERROR TRACKING HELPERS
// ============================================================================

interface ConsoleError {
  type: string;
  text: string;
  location?: string;
}

interface BackendError {
  level: string;
  message: string;
  timestamp: string;
}

/**
 * Setup console error tracking on a page.
 * Captures console.error and console.warn messages.
 */
function setupConsoleTracking(page: Page): ConsoleError[] {
  const errors: ConsoleError[] = [];

  page.on("console", (msg) => {
    const type = msg.type();
    if (type === "error" || type === "warning") {
      errors.push({
        type,
        text: msg.text(),
        location: msg.location().url,
      });
    }
  });

  page.on("pageerror", (error) => {
    errors.push({
      type: "pageerror",
      text: error.message,
    });
  });

  return errors;
}

/**
 * Fetch backend logs from the backend API.
 * Returns errors only if backend is unreachable or returns 5xx.
 */
async function getBackendErrors(
  request: APIRequestContext,
): Promise<BackendError[]> {
  try {
    // Try to fetch backend status via root or any endpoint
    const response = await request.get(`${BACKEND_URL}/api/audits/available`);
    // 5xx indicates a backend problem
    if (response.status() >= 500) {
      return [
        {
          level: "error",
          message: `Backend error: ${response.status()}`,
          timestamp: new Date().toISOString(),
        },
      ];
    }
    return [];
  } catch (error) {
    return [
      {
        level: "error",
        message: `Backend unreachable: ${String(error)}`,
        timestamp: new Date().toISOString(),
      },
    ];
  }
}

/**
 * Check if console errors contain critical failures.
 * Ignores known benign warnings.
 */
function hasCriticalConsoleErrors(errors: ConsoleError[]): boolean {
  const ignoredPatterns = [
    /Download the React DevTools/,
    /Warning: ReactDOM.render is no longer supported/,
    /Failed to load resource.*favicon/,
    /ResizeObserver loop/,
  ];

  return errors.some((error) => {
    if (error.type !== "error" && error.type !== "pageerror") {
      return false;
    }
    // Check if error matches any ignored pattern
    return !ignoredPatterns.some((pattern) => pattern.test(error.text));
  });
}

/**
 * Format errors for test output.
 */
function formatErrors(
  consoleErrors: ConsoleError[],
  backendErrors: BackendError[],
): string {
  const lines: string[] = [];

  if (consoleErrors.length > 0) {
    lines.push("\n📺 CONSOLE ERRORS:");
    for (const err of consoleErrors) {
      lines.push(`  [${err.type}] ${err.text}`);
      if (err.location) {
        lines.push(`    at ${err.location}`);
      }
    }
  }

  if (backendErrors.length > 0) {
    lines.push("\n🖥️ BACKEND ERRORS:");
    for (const err of backendErrors) {
      lines.push(`  [${err.level}] ${err.message}`);
    }
  }

  return lines.join("\n");
}

// ============================================================================
// TEST SUITE
// ============================================================================

test.describe("Audit Page", () => {
  test.beforeEach(async ({ request }) => {
    // Cleanup PocketBase before each test
    await cleanupPocketBase(request);
  });

  /**
   * TEST 1: Diagnostic Initial (Onboarding)
   * ========================================
   * Vérifie le flux complet du diagnostic initial :
   * 1. Affichage de la carte avec titre, description et bouton "Lancer"
   * 2. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 3. Attente fin de l'audit → bouton "Relancer" revient + badge de statut
   * 4. Clic sur le chevron → déploie et affiche pipeline + issues/succès
   */
  test("TEST 1: Diagnostic Initial - run and verify results", async ({
    page,
    request,
  }) => {
    // Increase timeout for this test (includes audit run + refresh)
    test.setTimeout(60000);

    // Skip if PocketBase is not available
    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    // ─────────────────────────────────────────────────────────────────────────
    // SETUP: Tracking des erreurs console et backend
    // ─────────────────────────────────────────────────────────────────────────
    const consoleErrors = setupConsoleTracking(page);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Navigation vers la page Audit
    // ─────────────────────────────────────────────────────────────────────────
    await navigateToAuditPage(page);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Vérification de l'affichage de la carte "Diagnostic Initial"
    // ─────────────────────────────────────────────────────────────────────────
    const onboardingCard = page.locator('[data-audit-type="onboarding"]');
    await expect(onboardingCard).toBeVisible({ timeout: 10000 });

    // Vérifie le titre "Diagnostic Initial"
    await expect(onboardingCard.locator("text=Diagnostic Initial")).toBeVisible(
      { timeout: 10000 },
    );

    // Vérifie la description
    await expect(
      onboardingCard.locator(
        "text=Vérifiez que tous vos services Ads et SEO sont correctement configurés",
      ),
    ).toBeVisible({ timeout: 10000 });

    // Vérifie le bouton "Lancer" ou "Relancer" via data-testid
    const launchButton = onboardingCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2.5: Vérifier s'il y avait un rapport précédent
    // ─────────────────────────────────────────────────────────────────────────
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      onboardingCard,
      pipelinePanel,
    );

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Clic sur "Lancer" → l'audit démarre (ne déploie pas le détail)
    // ─────────────────────────────────────────────────────────────────────────
    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(onboardingCard);
    const runningIndicator = onboardingCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(onboardingCard, hadPreviousReport);

    // Le pipeline NE doit PAS être visible (pas de déploiement automatique)
    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Attente de la fin de l'audit (max 30 secondes)
    // On sait que c'est terminé quand le bouton "Lancer" ou "Relancer" revient
    // ─────────────────────────────────────────────────────────────────────────
    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });

    // Le bouton doit revenir avec le texte "Relancer"
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Vérification du badge de statut après complétion
    // Le badge affiche "OK" (success) ou "X pb" (warning/error)
    // ─────────────────────────────────────────────────────────────────────────
    const statusBadge = onboardingCard.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    // Le badge doit contenir soit "OK" soit "X pb" (où X est un nombre)
    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Clic sur la carte (chevron) pour déployer les détails
    // ─────────────────────────────────────────────────────────────────────────
    await onboardingCard.click();
    await page.waitForTimeout(500);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Vérification de l'affichage du pipeline d'audit
    // ─────────────────────────────────────────────────────────────────────────
    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });

    // Vérifie que le titre "Pipeline d'audit" est affiché
    await expect(pipelinePanel.locator("text=Pipeline d'audit")).toBeVisible({
      timeout: 10000,
    });

    // Vérifie qu'au moins une étape est affichée
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Vérification des issues OU du panneau de succès
    // - Si problèmes détectés → data-testid="audit-issues-panel"
    // - Si aucun problème → data-testid="audit-success-panel"
    // ─────────────────────────────────────────────────────────────────────────
    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');

    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);

    // L'un des deux doit être visible
    expect(hasIssues || hasSuccess).toBe(true);

    if (hasIssues) {
      // Vérifie le titre "Problèmes détectés (X)"
      await expect(issuesPanel.locator("text=Problèmes détectés")).toBeVisible({
        timeout: 10000,
      });
    } else {
      // Vérifie le message de succès
      await expect(
        successPanel.locator("text=Aucun problème détecté"),
      ).toBeVisible({ timeout: 10000 });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Refresh de la page et vérification de la persistance des données
    // ─────────────────────────────────────────────────────────────────────────
    await page.reload();
    await page.waitForLoadState("domcontentloaded");

    // Revenir sur la page Audit après refresh
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000); // Wait for PocketBase data to load

    // La carte doit toujours afficher le badge de statut (données persistées)
    const onboardingCardAfterRefresh = page.locator(
      '[data-audit-type="onboarding"]',
    );
    await expect(onboardingCardAfterRefresh).toBeVisible({ timeout: 10000 });

    const statusBadgeAfterRefresh = onboardingCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    // Le badge doit toujours contenir "OK" ou "X pb"
    const badgeTextAfterRefresh = await statusBadgeAfterRefresh.textContent();
    const isValidBadgeAfterRefresh =
      badgeTextAfterRefresh === "OK" ||
      (badgeTextAfterRefresh !== null &&
        /^\d+ pb$/.test(badgeTextAfterRefresh));
    expect(isValidBadgeAfterRefresh).toBe(true);

    // Clic sur la carte pour vérifier que le pipeline est toujours accessible
    await onboardingCardAfterRefresh.click();
    await page.waitForTimeout(500);

    const pipelinePanelAfterRefresh = page.locator(
      '[data-testid="audit-pipeline-panel"]',
    );
    await expect(pipelinePanelAfterRefresh).toBeVisible({ timeout: 15000 });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Vérification finale des erreurs (console + backend)
    // ─────────────────────────────────────────────────────────────────────────
    const backendErrors = await getBackendErrors(request);
    const hasConsoleErrors = hasCriticalConsoleErrors(consoleErrors);
    const hasBackendErrors = backendErrors.length > 0;

    // Log all errors for debugging
    if (consoleErrors.length > 0 || backendErrors.length > 0) {
      console.log(formatErrors(consoleErrors, backendErrors));
    }

    // Fail the test if critical errors were detected
    if (hasConsoleErrors) {
      const criticalErrors = consoleErrors.filter(
        (e) => e.type === "error" || e.type === "pageerror",
      );
      throw new Error(
        `❌ TEST FAILED: ${String(criticalErrors.length)} console error(s) detected:\n` +
          criticalErrors.map((e) => `  - ${e.text}`).join("\n"),
      );
    }

    if (hasBackendErrors) {
      throw new Error(
        `❌ TEST FAILED: Backend error(s) detected:\n` +
          backendErrors.map((e) => `  - [${e.level}] ${e.message}`).join("\n"),
      );
    }

    console.log("✅ TEST 1 PASSED: Diagnostic Initial completed successfully");
    console.log(`   📺 Console warnings: ${String(consoleErrors.length)}`);
    console.log(`   🖥️ Backend status: OK`);
    console.log(`   🔄 Data persistence after refresh: OK`);
  });

  /**
   * TEST 2: Code Tracking Thème (theme_code)
   * =========================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 2: Code Tracking Thème - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    // STEP 2: Vérification de la carte
    const auditCard = page.locator('[data-audit-type="theme_code"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=Code Tracking Thème")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    // STEP 3: Clic sur "Lancer"
    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    // STEP 4: Attente fin de l'audit
    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    // Note: AuditCard always shows "Lancer", OnboardingCard shows "Relancer" after a run
    await expect(launchButton).toHaveText(/Lancer|Relancer/, {
      timeout: 10000,
    });

    // STEP 5: Vérification du badge
    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 10000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    // STEP 6: Clic sur la carte pour déployer
    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 10000 });
    await expect(pipelinePanel.locator("text=Pipeline d'audit")).toBeVisible({
      timeout: 10000,
    });

    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    // STEP 7: Refresh et persistance
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="theme_code"]',
    );
    await expect(auditCardAfterRefresh).toBeVisible({ timeout: 10000 });

    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 10000 });

    // STEP 8: Vérification finale des erreurs
    const backendErrors = await getBackendErrors(request);
    const hasConsoleErrors = hasCriticalConsoleErrors(consoleErrors);
    const hasBackendErrors = backendErrors.length > 0;

    if (consoleErrors.length > 0 || backendErrors.length > 0) {
      console.log(formatErrors(consoleErrors, backendErrors));
    }

    if (hasConsoleErrors) {
      const criticalErrors = consoleErrors.filter(
        (e) => e.type === "error" || e.type === "pageerror",
      );
      throw new Error(
        `❌ TEST FAILED: ${String(criticalErrors.length)} console error(s) detected:\n` +
          criticalErrors.map((e) => `  - ${e.text}`).join("\n"),
      );
    }

    if (hasBackendErrors) {
      throw new Error(
        `❌ TEST FAILED: Backend error(s) detected:\n` +
          backendErrors.map((e) => `  - [${e.level}] ${e.message}`).join("\n"),
      );
    }

    console.log("✅ TEST 2 PASSED: Code Tracking Thème completed successfully");
  });

  /**
   * TEST 3: GA4 Tracking (ga4_tracking)
   * ====================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   *
   * NOTE: Timeout étendu à 90s (audit plus long avec appels API GA4)
   */
  test("TEST 3: GA4 Tracking - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000); // Extended timeout for GA4 API calls

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="ga4_tracking"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=GA4 Tracking")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 60000 }); // Extended wait
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="ga4_tracking"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      const criticalErrors = consoleErrors.filter(
        (e) => e.type === "error" || e.type === "pageerror",
      );
      throw new Error(
        `❌ TEST FAILED: ${String(criticalErrors.length)} console error(s)`,
      );
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 3 PASSED: GA4 Tracking completed successfully");
  });

  /**
   * TEST 4: Meta Pixel (meta_pixel)
   * ================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 4: Meta Pixel - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="meta_pixel"]');
    await expect(auditCard).toBeVisible({ timeout: 15000 });
    // Use first() to avoid strict mode violation (title and description both contain "Meta Pixel")
    await expect(auditCard.locator("text=Meta Pixel").first()).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="meta_pixel"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 4 PASSED: Meta Pixel completed successfully");
  });

  /**
   * TEST 5: Meta CAPI (capi)
   * ==============================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 5: Meta CAPI - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="capi"]');
    await expect(auditCard).toBeVisible({ timeout: 15000 });
    // Use first() to avoid strict mode violation (title and description both contain "Meta")
    await expect(auditCard.locator("text=Meta CAPI").first()).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator('[data-audit-type="capi"]');
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 5 PASSED: Meta CAPI completed successfully");
  });

  /**
   * TEST 6: Données Clients (customer_data)
   * ========================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 6: Données Clients - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="customer_data"]');
    await expect(auditCard).toBeVisible({ timeout: 15000 });
    // Use first() to avoid strict mode violation (title and description both contain "clients")
    await expect(auditCard.locator("text=Données Clients").first()).toBeVisible(
      { timeout: 10000 },
    );

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="customer_data"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 6 PASSED: Données Clients completed successfully");
  });

  /**
   * TEST 7: Récupération Panier (cart_recovery)
   * ============================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 7: Récupération Panier - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="cart_recovery"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=Récupération Panier")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="cart_recovery"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 7 PASSED: Récupération Panier completed successfully");
  });

  /**
   * TEST 8: Prêt pour Ads (ads_readiness)
   * ======================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   *
   * NOTE: Timeout étendu à 90s (agrège résultats d'autres audits)
   */
  test("TEST 8: Prêt pour Ads - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000); // Extended timeout - aggregates other audits

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="ads_readiness"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=Prêt pour Ads")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 60000 }); // Extended wait
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="ads_readiness"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 8 PASSED: Prêt pour Ads completed successfully");
  });

  /**
   * TEST 9: Google Merchant Center (merchant_center)
   * =================================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   *
   * NOTE: Timeout étendu à 120s (audit le plus long, appels API GMC)
   */
  test("TEST 9: Google Merchant Center - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000); // Extended timeout - GMC API calls are slow

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="merchant_center"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=Google Merchant Center")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 90000 }); // Extended wait
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="merchant_center"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log(
      "✅ TEST 9 PASSED: Google Merchant Center completed successfully",
    );
  });

  /**
   * TEST 10: SEO & Search Console (search_console)
   * ===============================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   *
   * NOTE: Timeout étendu à 90s (dual mode GSC/Basic SEO)
   */
  test("TEST 10: SEO & Search Console - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(90000); // Extended timeout - dual mode GSC/Basic SEO

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="search_console"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=SEO & Search Console")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 60000 }); // Extended wait
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="search_console"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log(
      "✅ TEST 10 PASSED: SEO & Search Console completed successfully",
    );
  });

  /**
   * TEST 11: Accès Crawlers Ads (bot_access)
   * =========================================
   * Scénarios (identiques au TEST 1) :
   * 1. Navigation vers la page Audit
   * 2. Vérification de la carte avec titre, description et bouton "Lancer"
   * 3. Clic sur "Lancer" → état "En cours..." (ne déploie PAS le détail)
   * 4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   * 5. Clic sur la carte → déploie pipeline + issues/succès
   * 6. Refresh de la page → données persistées
   * 7. Vérification finale des erreurs console/backend
   */
  test("TEST 11: Accès Crawlers Ads - run and verify results", async ({
    page,
    request,
  }) => {
    test.setTimeout(60000);

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);
    await navigateToAuditPage(page);

    const auditCard = page.locator('[data-audit-type="bot_access"]');
    await expect(auditCard).toBeVisible({ timeout: 10000 });
    await expect(auditCard.locator("text=Accès Crawlers Ads")).toBeVisible({
      timeout: 10000,
    });

    const launchButton = auditCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérifier s'il y avait un rapport précédent
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    const { hadPreviousReport } = await verifyReportClearingOnRun(
      auditCard,
      pipelinePanel,
    );

    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(auditCard);
    const runningIndicator = auditCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Vérifier que le rapport précédent a été effacé au démarrage
    await verifyReportClearedAfterStart(auditCard, hadPreviousReport);

    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    const statusBadge = auditCard.locator('[data-testid="audit-status-badge"]');
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    await auditCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssues = await issuesPanel.isVisible().catch(() => false);
    const hasSuccess = await successPanel.isVisible().catch(() => false);
    expect(hasIssues || hasSuccess).toBe(true);

    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await page.locator('nav button:has-text("Audit")').first().click();
    await page.waitForTimeout(2000);

    const auditCardAfterRefresh = page.locator(
      '[data-audit-type="bot_access"]',
    );
    const statusBadgeAfterRefresh = auditCardAfterRefresh.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadgeAfterRefresh).toBeVisible({ timeout: 15000 });

    const backendErrors = await getBackendErrors(request);
    if (hasCriticalConsoleErrors(consoleErrors)) {
      throw new Error(`❌ TEST FAILED: Console error(s) detected`);
    }
    if (backendErrors.length > 0) {
      throw new Error(`❌ TEST FAILED: Backend error(s) detected`);
    }

    console.log("✅ TEST 11 PASSED: Accès Crawlers Ads completed successfully");
  });

  /**
   * TEST 12: Clear Cache and Re-run Diagnostic Initial
   * ====================================================
   * Scénarios :
   * PHASE 1 - Premier run (identique au TEST 1, sans refresh) :
   *   1. Navigation vers la page Audit
   *   2. Vérification de la carte "Diagnostic Initial"
   *   3. Clic sur "Lancer" → état "En cours..."
   *   4. Attente fin de l'audit → bouton "Relancer" + badge de statut
   *   5. Clic sur la carte → déploie pipeline + issues/succès
   *
   * PHASE 2 - Vider le cache :
   *   6. Clic sur le bouton "Vider le cache"
   *   7. Vérification que les badges ont disparu
   *   8. Vérification que le pipeline n'est plus affiché
   *
   * PHASE 3 - Relancer l'audit (identique au TEST 1, sans refresh) :
   *   9. Vérification que le bouton affiche "Lancer" (pas "Relancer")
   *   10. Clic sur "Lancer" → état "En cours..."
   *   11. Attente fin de l'audit → bouton "Relancer" + badge de statut
   *   12. Clic sur la carte → déploie pipeline + issues/succès
   *   13. Vérification finale des erreurs console/backend
   */
  test("TEST 12: Clear Cache and Re-run Diagnostic Initial", async ({
    page,
    request,
  }) => {
    test.setTimeout(120000); // Extended timeout for two full audit runs

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);

    // =========================================================================
    // PHASE 1: Premier run de l'audit (identique au TEST 1, sans refresh)
    // =========================================================================
    console.log("📍 PHASE 1: Premier run de l'audit Diagnostic Initial");

    await navigateToAuditPage(page);

    const onboardingCard = page.locator('[data-audit-type="onboarding"]');
    await expect(onboardingCard).toBeVisible({ timeout: 10000 });
    await expect(onboardingCard.locator("text=Diagnostic Initial")).toBeVisible(
      { timeout: 10000 },
    );

    const launchButton = onboardingCard.locator(
      '[data-testid="audit-launch-button"]',
    );
    await expect(launchButton).toBeVisible({ timeout: 10000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Clic sur "Lancer"
    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(onboardingCard);
    const runningIndicator = onboardingCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Le pipeline NE doit PAS être visible
    const pipelinePanel = page.locator('[data-testid="audit-pipeline-panel"]');
    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    // Attente fin de l'audit
    await expect(runningIndicator).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérification du badge
    const statusBadge = onboardingCard.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadge).toBeVisible({ timeout: 15000 });

    const badgeText = await statusBadge.textContent();
    const isValidBadge =
      badgeText === "OK" || (badgeText !== null && /^\d+ pb$/.test(badgeText));
    expect(isValidBadge).toBe(true);

    // Clic sur la carte pour déployer
    await onboardingCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    await expect(pipelinePanel.locator("text=Pipeline d'audit")).toBeVisible({
      timeout: 10000,
    });

    const issuesPanel = page.locator('[data-testid="audit-issues-panel"]');
    const successPanel = page.locator('[data-testid="audit-success-panel"]');
    const hasIssuesPhase1 = await issuesPanel.isVisible().catch(() => false);
    const hasSuccessPhase1 = await successPanel.isVisible().catch(() => false);
    expect(hasIssuesPhase1 || hasSuccessPhase1).toBe(true);

    console.log("✅ PHASE 1 terminée: Premier run réussi");

    // =========================================================================
    // PHASE 2: Vider le cache
    // =========================================================================
    console.log("📍 PHASE 2: Vidage du cache");

    // Clic sur le bouton "Vider le cache"
    const clearCacheButton = page.locator('button:has-text("Vider le cache")');
    await expect(clearCacheButton).toBeVisible({ timeout: 10000 });
    await clearCacheButton.click();

    // Attendre que le cache soit vidé (le bouton peut afficher un état de chargement)
    await page.waitForTimeout(2000);

    // Vérification que le badge a disparu
    await expect(statusBadge).not.toBeVisible({ timeout: 15000 });

    // Vérification que le pipeline n'est plus affiché
    await expect(pipelinePanel).not.toBeVisible({ timeout: 15000 });

    // Vérification que le bouton affiche "Lancer" (pas "Relancer")
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer/);

    // Collapse the card (it was expanded in PHASE 1)
    await onboardingCard.click();
    await page.waitForTimeout(500);
    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    console.log("✅ PHASE 2 terminée: Cache vidé, badges et rapport nettoyés");

    // =========================================================================
    // PHASE 3: Relancer l'audit après vidage du cache
    // =========================================================================
    console.log("📍 PHASE 3: Relancer l'audit après vidage du cache");

    // Clic sur "Lancer"
    await launchButton.click();

    // Attendre que l'audit démarre (gère l'état "Démarrage..." puis "En cours...")
    await waitForAuditToStartRunning(onboardingCard);
    const runningIndicator2 = onboardingCard.locator(
      '[data-testid="audit-running-indicator"]',
    );

    // Le pipeline NE doit PAS être visible pendant l'exécution
    await expect(pipelinePanel).not.toBeVisible({ timeout: 10000 });

    // Attente fin de l'audit
    await expect(runningIndicator2).not.toBeVisible({ timeout: 30000 });
    await expect(launchButton).toBeVisible({ timeout: 15000 });
    await expect(launchButton).toHaveText(/Lancer|Relancer/);

    // Vérification du nouveau badge
    const statusBadge2 = onboardingCard.locator(
      '[data-testid="audit-status-badge"]',
    );
    await expect(statusBadge2).toBeVisible({ timeout: 15000 });

    const badgeText2 = await statusBadge2.textContent();
    const isValidBadge2 =
      badgeText2 === "OK" ||
      (badgeText2 !== null && /^\d+ pb$/.test(badgeText2));
    expect(isValidBadge2).toBe(true);

    // Clic sur la carte pour déployer
    await onboardingCard.click();
    await page.waitForTimeout(500);

    await expect(pipelinePanel).toBeVisible({ timeout: 15000 });
    await expect(pipelinePanel.locator("text=Pipeline d'audit")).toBeVisible({
      timeout: 10000,
    });

    const steps = pipelinePanel.locator('[data-testid="audit-step"]');
    await expect(steps.first()).toBeVisible({ timeout: 10000 });

    const hasIssuesPhase3 = await issuesPanel.isVisible().catch(() => false);
    const hasSuccessPhase3 = await successPanel.isVisible().catch(() => false);
    expect(hasIssuesPhase3 || hasSuccessPhase3).toBe(true);

    console.log(
      "✅ PHASE 3 terminée: Deuxième run réussi après vidage du cache",
    );

    // =========================================================================
    // Vérification finale des erreurs
    // =========================================================================
    const backendErrors = await getBackendErrors(request);
    const hasConsoleErrors = hasCriticalConsoleErrors(consoleErrors);
    const hasBackendErrors = backendErrors.length > 0;

    if (consoleErrors.length > 0 || backendErrors.length > 0) {
      console.log(formatErrors(consoleErrors, backendErrors));
    }

    if (hasConsoleErrors) {
      const criticalErrors = consoleErrors.filter(
        (e) => e.type === "error" || e.type === "pageerror",
      );
      throw new Error(
        `❌ TEST FAILED: ${String(criticalErrors.length)} console error(s) detected:\n` +
          criticalErrors.map((e) => `  - ${e.text}`).join("\n"),
      );
    }

    if (hasBackendErrors) {
      throw new Error(
        `❌ TEST FAILED: Backend error(s) detected:\n` +
          backendErrors.map((e) => `  - [${e.level}] ${e.message}`).join("\n"),
      );
    }

    console.log(
      "✅ TEST 12 PASSED: Clear Cache and Re-run completed successfully",
    );
    console.log("   📍 Phase 1: Premier run OK");
    console.log("   📍 Phase 2: Cache vidé, données nettoyées OK");
    console.log("   📍 Phase 3: Deuxième run après cache vidé OK");
  });

  /**
   * TEST 13: Lancer tous les audits
   * ================================
   * Scénarios :
   * 1. Navigation vers la page Audit
   * 2. Clic sur "Lancer tous les audits"
   * 3. Vérification de l'indicateur de progression avec les chips individuels
   * 4. Attente de la fin de tous les audits
   * 5. Vérification de la modal de résumé (score, readiness, bouton fermer)
   * 6. Fermeture de la modal
   * 7. Vérification que tous les badges de statut sont visibles sur les cartes
   * 8. Vérification finale des erreurs console/backend
   *
   * NOTE: Timeout étendu à 300s (exécution séquentielle de tous les audits)
   */
  test("TEST 13: Lancer tous les audits - run all and verify summary", async ({
    page,
    request,
  }) => {
    test.setTimeout(300000); // 5 minutes - tous les audits en séquence

    const pbAvailable = await isPocketBaseAvailable(request);
    test.skip(!pbAvailable, "PocketBase not available");

    const consoleErrors = setupConsoleTracking(page);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Navigation vers la page Audit
    // ─────────────────────────────────────────────────────────────────────────
    await navigateToAuditPage(page);
    console.log("📍 STEP 1: Navigation vers la page Audit OK");

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Clic sur "Lancer tous les audits"
    // ─────────────────────────────────────────────────────────────────────────
    const runAllButton = page.locator('[data-testid="run-all-audits-button"]');
    await expect(runAllButton).toBeVisible({ timeout: 10000 });
    await expect(runAllButton).toContainText("Lancer tous les audits");
    await runAllButton.click();
    console.log("📍 STEP 2: Clic sur 'Lancer tous les audits' OK");

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Vérification de l'indicateur de progression
    // ─────────────────────────────────────────────────────────────────────────
    const progressIndicator = page.locator(
      '[data-testid="audit-progress-indicator"]',
    );
    await expect(progressIndicator).toBeVisible({ timeout: 15000 });
    console.log("📍 STEP 3: Indicateur de progression visible");

    // Vérifier que l'indicateur affiche "Exécution des audits..."
    await expect(
      progressIndicator.locator("text=Exécution des audits"),
    ).toBeVisible({ timeout: 5000 });

    // Vérifier qu'il y a des chips de progression pour les audits
    const progressChips = progressIndicator.locator(
      '[data-testid^="progress-chip-"]',
    );
    const chipCount = await progressChips.count();
    expect(chipCount).toBeGreaterThan(0);
    console.log(`   ✓ ${String(chipCount)} chips de progression affichés`);

    // Le bouton doit maintenant afficher "X/Y en cours..."
    await expect(runAllButton).toContainText(/en cours/, { timeout: 5000 });

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Attendre la fin de tous les audits (modal de résumé apparaît)
    // ─────────────────────────────────────────────────────────────────────────
    console.log("📍 STEP 4: Attente de la fin des audits (max 4 min)...");

    const summaryModal = page.locator('[data-testid="campaign-summary-modal"]');
    await expect(summaryModal).toBeVisible({ timeout: 240000 }); // 4 minutes max
    console.log("   ✓ Modal de résumé de campagne apparue");

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Vérification du contenu de la modal de résumé
    // ─────────────────────────────────────────────────────────────────────────
    // Vérifier le titre "Résumé de campagne"
    await expect(summaryModal.locator("text=Résumé de campagne")).toBeVisible({
      timeout: 5000,
    });

    // Vérifier le cercle de score
    const scoreCircle = summaryModal.locator(
      '[data-testid="campaign-score-circle"]',
    );
    await expect(scoreCircle).toBeVisible({ timeout: 5000 });

    // Vérifier le badge de readiness (Prêt pour la campagne / Partiellement prêt / Non prêt)
    const readinessBadge = summaryModal.locator(
      '[data-testid="campaign-readiness-badge"]',
    );
    await expect(readinessBadge).toBeVisible({ timeout: 5000 });

    const readinessText = await readinessBadge.textContent();
    const isValidReadiness =
      readinessText !== null &&
      (readinessText.includes("Prêt") ||
        readinessText.includes("Partiellement") ||
        readinessText.includes("Non prêt"));
    expect(isValidReadiness).toBe(true);
    console.log(`   ✓ Readiness: "${readinessText ?? "unknown"}"`);

    // Vérifier le bouton Fermer
    const closeButton = summaryModal.locator(
      '[data-testid="campaign-summary-close"]',
    );
    await expect(closeButton).toBeVisible({ timeout: 5000 });
    await expect(closeButton).toHaveText("Fermer");
    console.log("📍 STEP 5: Contenu de la modal vérifié");

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Fermeture de la modal
    // ─────────────────────────────────────────────────────────────────────────
    // The modal content can be larger than the viewport, making buttons hard to click
    // Use dispatchEvent to trigger the click programmatically
    await closeButton.dispatchEvent("click");
    await expect(summaryModal).not.toBeVisible({ timeout: 5000 });
    console.log("📍 STEP 6: Modal fermée");

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Vérification que tous les badges de statut sont visibles
    // ─────────────────────────────────────────────────────────────────────────
    // Liste des types d'audit à vérifier
    const auditTypes = [
      "onboarding",
      "theme_code",
      "ga4_tracking",
      "meta_pixel",
      "capi",
      "customer_data",
      "cart_recovery",
      "ads_readiness",
      "merchant_center",
      "search_console",
      "bot_access",
    ];

    console.log(
      "📍 STEP 7: Vérification des badges de statut sur chaque carte",
    );
    let badgesVerified = 0;

    for (const auditType of auditTypes) {
      const auditCard = page.locator(`[data-audit-type="${auditType}"]`);
      const isCardVisible = await auditCard.isVisible().catch(() => false);

      if (isCardVisible) {
        const statusBadge = auditCard.locator(
          '[data-testid="audit-status-badge"]',
        );
        await expect(statusBadge).toBeVisible({ timeout: 10000 });

        const badgeText = await statusBadge.textContent();
        const isValidBadge =
          badgeText === "OK" ||
          (badgeText !== null && /^\d+ pb$/.test(badgeText));
        expect(isValidBadge).toBe(true);

        badgesVerified++;
        console.log(`   ✓ ${auditType}: ${badgeText ?? "unknown"}`);
      }
    }

    expect(badgesVerified).toBeGreaterThan(0);
    console.log(`   ✓ ${String(badgesVerified)} badges vérifiés au total`);

    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Vérification finale des erreurs (console + backend)
    // ─────────────────────────────────────────────────────────────────────────
    const backendErrors = await getBackendErrors(request);
    const hasConsoleErrors = hasCriticalConsoleErrors(consoleErrors);
    const hasBackendErrors = backendErrors.length > 0;

    if (consoleErrors.length > 0 || backendErrors.length > 0) {
      console.log(formatErrors(consoleErrors, backendErrors));
    }

    if (hasConsoleErrors) {
      const criticalErrors = consoleErrors.filter(
        (e) => e.type === "error" || e.type === "pageerror",
      );
      throw new Error(
        `❌ TEST FAILED: ${String(criticalErrors.length)} console error(s) detected:\n` +
          criticalErrors.map((e) => `  - ${e.text}`).join("\n"),
      );
    }

    if (hasBackendErrors) {
      throw new Error(
        `❌ TEST FAILED: Backend error(s) detected:\n` +
          backendErrors.map((e) => `  - [${e.level}] ${e.message}`).join("\n"),
      );
    }

    console.log(
      "✅ TEST 13 PASSED: Lancer tous les audits completed successfully",
    );
    console.log(`   📊 Score modal vérifié`);
    console.log(`   📋 ${String(badgesVerified)} audit badges visibles`);
    console.log(`   📺 Console warnings: ${String(consoleErrors.length)}`);
    console.log(`   🖥️ Backend status: OK`);
  });
});
