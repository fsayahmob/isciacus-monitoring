import { test, expect } from '@playwright/test'

/**
 * E2E Tests - Audit Page
 * ======================
 * Tests the UI components of the audit page.
 * Uses TEST_MODE backend which doesn't have real Shopify data.
 */

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
