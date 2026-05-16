/**
 * Flow 2 — delete-own-report (T1.13).
 *
 * Verifies the user can soft-delete one of their own submitted reports
 * via the Story tab's Manage Submissions surface.
 *
 * Gated behind test.skip() until the test backend is set up — same
 * reasoning as signup-submit-reveal.spec.ts.
 */

import { test, expect } from '@playwright/test'

test.describe('delete own report', () => {
  test.skip(
    !process.env.PLAYWRIGHT_TEST_USER_EMAIL,
    'requires authenticated test user + at least one seeded report',
  )

  test('user can soft-delete their own submission and it disappears from Story tab', async ({ page }) => {
    // 1. Sign in (helper TBD; for now assume session is injected via
    //    cookie before each test runs).
    await page.goto('/lab?tab=story')

    // 2. Navigate to Manage Submissions (location TBD per current UI).
    //    The flow is: Story tab → submission switcher → "Manage" → row → Delete
    await page.getByRole('link', { name: /manage submissions/i }).click()

    // 3. Pick the first row. In a real test backend this would be a
    //    known seeded report with a deterministic title.
    const firstRow = page.getByRole('row').nth(1) // 0 is the header
    const titleCell = await firstRow.locator('td').first().textContent()
    await firstRow.getByRole('button', { name: /delete/i }).click()

    // 4. Confirm the destructive-action modal.
    await page.getByRole('button', { name: /confirm|delete/i }).last().click()

    // 5. Verify the report is no longer in the list.
    await expect(page.getByText(titleCell || '')).not.toBeVisible()
  })
})
