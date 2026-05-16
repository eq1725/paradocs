/**
 * Flow 4 — email digest opt-in/out (T1.13).
 *
 * Verifies the user can change their email digest cadence (weekly /
 * daily / off) via the /lab?tab=story#email-prefs surface and the
 * preference persists.
 *
 * Gated behind test.skip() pending the test backend story.
 */

import { test, expect } from '@playwright/test'

test.describe('email digest opt-in / out', () => {
  test.skip(
    !process.env.PLAYWRIGHT_TEST_USER_EMAIL,
    'requires authenticated test user',
  )

  test('user can toggle digest cadence and preference persists across reloads', async ({ page }) => {
    // 1. Open the email-prefs anchor inside Story
    await page.goto('/lab?tab=story#email-prefs')

    // 2. Verify the cadence selector is present
    const cadenceSelector = page.getByRole('group', { name: /digest cadence|email cadence/i })
    await expect(cadenceSelector).toBeVisible()

    // 3. Pick "Weekly"
    await cadenceSelector.getByRole('radio', { name: /weekly/i }).click()

    // 4. Reload and verify the choice persisted
    await page.reload()
    await expect(
      cadenceSelector.getByRole('radio', { name: /weekly/i, checked: true } as any),
    ).toBeVisible()

    // 5. Pick "Off" — test full opt-out
    await cadenceSelector.getByRole('radio', { name: /off|none/i }).click()
    await page.reload()
    await expect(
      cadenceSelector.getByRole('radio', { name: /off|none/i, checked: true } as any),
    ).toBeVisible()
  })
})
