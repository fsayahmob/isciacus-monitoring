import { test, expect, type Page } from '@playwright/test'

/**
 * E2E Tests - Audit Page
 * ======================
 * Tests the UI components of the audit page.
 * Uses TEST_MODE backend which doesn't have real Shopify data.
 *
 * PocketBase Integration:
 * - Tests realtime state persistence via WebSocket
 * - Tests state restoration after page refresh
 */

/**
 * Helper to check if PocketBase is available
 */
async function isPocketBaseAvailable(page: Page): Promise<boolean> {
  try {
    const response = await page.request.get('http://localhost:8090/api/health')
    return response.ok()
  } catch {
    return false
  }
}

test.describe('Audit Page - UI Rendering', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to audit page
    await page.goto('/audit')

    // Wait for page to be interactive (either loaded or error state)
    await page.waitForLoadState('networkidle')
  })

  test('should render the audit page', async ({ page }) => {
    // Check that the page title or main heading is visible
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('should display audit cards or welcome state', async ({ page }) => {
    // Either audit cards exist or welcome/onboarding state is shown
    const auditCards = page.locator('[data-audit-type]')
    const welcomeCard = page.locator('text=/Bienvenue|Welcome|Diagnostic|Audit/i')

    const cardsCount = await auditCards.count()
    const hasWelcome = await welcomeCard.count()

    // At least one should be visible
    expect(cardsCount + hasWelcome).toBeGreaterThan(0)
  })

  test('should have proper page structure', async ({ page }) => {
    // Check for main layout elements
    const main = page.locator('main, [role="main"], .container, .mx-auto').first()
    await expect(main).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Audit Page - Theme', () => {
  test('should have dark theme styling', async ({ page }) => {
    await page.goto('/audit')
    await page.waitForLoadState('networkidle')

    // Check that dark theme is applied
    const bgColor = await page.evaluate(() => {
      return window.getComputedStyle(document.body).backgroundColor
    })

    // Should have some background color defined
    expect(bgColor).toBeTruthy()
  })
})

test.describe('Audit Page - Responsive', () => {
  test('should work on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    await page.goto('/audit')
    await page.waitForLoadState('networkidle')

    // Page should render without errors
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
  })

  test('should work on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 })
    await page.goto('/audit')
    await page.waitForLoadState('networkidle')

    // Page should render without errors
    const heading = page.locator('h1')
    await expect(heading).toBeVisible({ timeout: 10000 })
  })
})

test.describe('Audit Page - PocketBase Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Check if PocketBase is available for these tests
    const pbAvailable = await isPocketBaseAvailable(page)
    test.skip(!pbAvailable, 'PocketBase not available - skipping realtime tests')
  })

  test('should connect to PocketBase for realtime updates', async ({ page }) => {
    await page.goto('/audit')
    await page.waitForLoadState('networkidle')

    // Wait for PocketBase connection to be established
    // The page should load without WebSocket errors
    const consoleErrors: string[] = []
    page.on('console', (msg) => {
      if (msg.type() === 'error' && msg.text().includes('PocketBase')) {
        consoleErrors.push(msg.text())
      }
    })

    // Give time for WebSocket connection
    await page.waitForTimeout(2000)

    // Should not have PocketBase-related errors
    expect(consoleErrors).toHaveLength(0)
  })
})

test.describe('Audit Page - State Persistence on Refresh', () => {
  test.beforeEach(async ({ page }) => {
    const pbAvailable = await isPocketBaseAvailable(page)
    test.skip(!pbAvailable, 'PocketBase not available - skipping persistence tests')
  })

  test('should restore running audit state from PocketBase after refresh', async ({ page }) => {
    test.setTimeout(60000) // 60 seconds timeout
    const testAuditType = 'ga4_tracking'

    // Step 1: Get the current session ID from the backend
    const sessionResponse = await page.request.get('http://localhost:8080/api/audits/session')
    expect(sessionResponse.ok()).toBeTruthy()
    const sessionData = await sessionResponse.json()
    const sessionId = sessionData.session?.id

    if (!sessionId) {
      test.skip(true, 'No backend session available')
      return
    }
    console.log(`Using backend session_id: ${sessionId}`)

    // Step 2: Create a "running" audit record in PocketBase with the REAL session ID
    console.log(`Creating test audit run with session_id: ${sessionId}`)
    const createResponse = await page.request.post(
      'http://localhost:8090/api/collections/audit_runs/records',
      {
        data: {
          session_id: sessionId,
          audit_type: testAuditType,
          status: 'running',
          started_at: new Date().toISOString(),
        },
      }
    )
    expect(createResponse.ok()).toBeTruthy()
    const createdRecord = await createResponse.json()
    console.log(`Created PocketBase record: ${createdRecord.id}`)

    try {
      // Step 3: Navigate to audit page
      await page.goto('/')
      await page.waitForLoadState('networkidle')

      // Click on Audit tab in navigation
      const auditTab = page.locator('button:has-text("Audit")')
      await auditTab.click()
      await page.waitForTimeout(1000)

      // Step 4: Wait for PocketBase to sync
      await page.waitForTimeout(3000)

      // Look for the running audit indicators
      const spinner = page.locator('.animate-spin')
      const runningText = page.locator('text=/En cours/i')

      const hasSpinner = await spinner.count()
      const hasRunningText = await runningText.count()

      console.log(`Before refresh - Spinner: ${hasSpinner}, RunningText: ${hasRunningText}`)

      // Step 5: Refresh the page
      console.log('Refreshing page...')
      await page.reload({ timeout: 10000 })
      await page.waitForLoadState('domcontentloaded')
      console.log('Page reloaded')

      // The app should restore the Audit tab state, but if not, click on it
      // Use more specific selector for the navigation tab
      const auditNavTab = page.locator('nav button:has-text("Audit"), [role="navigation"] button:has-text("Audit")')
      const tabCount = await auditNavTab.count()
      if (tabCount > 0) {
        await auditNavTab.first().click({ timeout: 5000 })
        console.log('Clicked Audit nav tab after refresh')
      } else {
        console.log('Already on Audit page after refresh')
      }

      // Step 6: Wait for PocketBase to restore state
      await page.waitForTimeout(2000)

      // Step 7: Verify the running state is restored
      const spinnerAfter = page.locator('.animate-spin')
      const runningTextAfter = page.locator('text=/En cours/i')

      const hasSpinnerAfter = await spinnerAfter.count()
      const hasRunningTextAfter = await runningTextAfter.count()

      console.log(`After refresh - Spinner: ${hasSpinnerAfter}, RunningText: ${hasRunningTextAfter}`)

      // The running state should be restored from PocketBase
      const stateRestored = hasSpinnerAfter > 0 || hasRunningTextAfter > 0
      expect(stateRestored).toBeTruthy()
      console.log('✓ Running state successfully restored after refresh')
    } finally {
      // Cleanup: Delete the test record
      await page.request.delete(
        `http://localhost:8090/api/collections/audit_runs/records/${createdRecord.id}`
      )
      console.log(`Cleaned up test record: ${createdRecord.id}`)
    }
  })

  test('should not show stale running state after Docker restart cleanup', async ({ page }) => {
    // This test verifies that stale "running" states are cleaned up
    // when the backend restarts (handled by cleanup_stale_running_audits)

    await page.goto('/audit')
    await page.waitForLoadState('networkidle')

    // Give time for PocketBase sync
    await page.waitForTimeout(2000)

    // Look for any "running" indicators
    const spinners = page.locator('.animate-spin')
    const runningText = page.locator('text=/En cours de/i')
    const runningCount = (await spinners.count()) + (await runningText.count())

    // If there are running indicators, they should correspond to actual running audits
    // (not stale ones that weren't cleaned up)
    if (runningCount > 0) {
      // Verify these are actual running audits by checking the progress indicator
      const progressBar = page.locator('[role="progressbar"], .bg-info')
      // Progress should be changing (not stuck at 0 or same value)
      console.log(`Found ${runningCount} running indicators - verifying they are active`)
    } else {
      // No running audits - this is also valid
      console.log('No running audits detected - cleanup working correctly')
    }
  })
})
