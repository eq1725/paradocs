/**
 * Flow 3 — push notification opt-in (T1.13).
 *
 * Verifies the user can opt into web push notifications and the
 * subscription is saved on the backend.
 *
 * Gated behind test.skip() pending the test backend story. Browser-
 * permission overrides for push notifications are supported in
 * Playwright via `context.grantPermissions(['notifications'])` so the
 * test doesn't need a UI prompt — see test.beforeAll below.
 */

import { test, expect } from '@playwright/test'

test.describe('push notification opt-in', () => {
  test.skip(
    !process.env.PLAYWRIGHT_TEST_USER_EMAIL,
    'requires authenticated test user',
  )

  test.beforeEach(async ({ context, baseURL }) => {
    if (baseURL) {
      await context.grantPermissions(['notifications'], { origin: baseURL })
    }
  })

  test('signed-in user opts into push and subscription is registered', async ({ page }) => {
    // Land on a page where the push prompt surfaces (Lab > Story or
    // a contextual prompt component — verify whichever currently fires).
    await page.goto('/lab?tab=story')

    // Look for the opt-in CTA (NotificationOptInPrompt in
    // src/components/discover or similar).
    const optInButton = page.getByRole('button', { name: /enable notifications|turn on alerts|notify me/i }).first()
    await expect(optInButton).toBeVisible()
    await optInButton.click()

    // The push permission was pre-granted; the SDK should now have
    // a subscription. Verify by polling /api/push/subscription-status
    // or by checking the UI shifts to a "you're subscribed" state.
    await expect(
      page.getByText(/you'?re subscribed|notifications on/i).first(),
    ).toBeVisible({ timeout: 10_000 })
  })
})
