import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E Test Configuration
 * ==================================
 * Tests run against local development servers (frontend + backend)
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',

  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Start dev servers before running tests
  webServer: [
    {
      command: 'cd frontend && npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
    {
      command: 'cd backend && uvicorn monitoring_app:app --reload --port 8000',
      url: 'http://localhost:8000/api/products',
      reuseExistingServer: !process.env.CI,
      timeout: 120 * 1000,
    },
  ],
})
