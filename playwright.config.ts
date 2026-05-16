/**
 * Playwright configuration — T1.13 E2E test suite.
 *
 * Runs tests against a local Next.js dev server by default, or against
 * a deployed environment via PLAYWRIGHT_BASE_URL env var (used in CI
 * to test the staging/preview deploy).
 *
 * Local:
 *   npm run test:e2e:install   # one-time browser install
 *   npm run dev                # in one terminal
 *   npm run test:e2e           # in another
 *
 * CI: workflow at .github/workflows/e2e.yml builds + starts the
 * server, then runs the suite against PLAYWRIGHT_BASE_URL=http://localhost:3000.
 *
 * See tests/e2e/README.md for the backend-mocking status (most tests
 * are smoke-style; the full auth/submit flow lives under .skip until
 * the test-backend story is built out).
 */

import { defineConfig, devices } from '@playwright/test'

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:3000'

export default defineConfig({
  testDir: './tests/e2e',
  // Each test file runs in its own browser context.
  fullyParallel: true,
  // Fail CI on .only() in tests — prevents accidental focused commits.
  forbidOnly: !!process.env.CI,
  // Retry flaky tests once in CI; never locally so flakiness surfaces.
  retries: process.env.CI ? 1 : 0,
  // 2 workers in CI to keep runtime bounded; let Playwright pick locally.
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Default to a desktop viewport; flows can override per test.
    viewport: { width: 1280, height: 800 },
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'] },
    },
    // Mobile-Safari simulation. Critical for Paradocs since the
    // primary surface is iOS via the Capacitor wrap. Catches viewport-
    // specific regressions (mobile bottom tabs, snap-x carousels, etc.).
    {
      name: 'mobile-safari',
      use: { ...devices['iPhone 13'] },
    },
  ],
  // Don't auto-start a dev server in CI — the workflow handles it
  // explicitly so the build is reproducible. Locally, the user runs
  // `npm run dev` in a separate terminal.
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: BASE_URL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
