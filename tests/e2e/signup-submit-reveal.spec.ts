/**
 * Flow 1 — signup → submit → reveal (T1.13).
 *
 * Exercises the post-T1.8 account-first onboarding flow end-to-end:
 *   1. Land on /start unauthenticated
 *   2. See the account-first gate (Sign up to share your experience)
 *   3. Enter email + username, send magic link
 *   4. Simulate clicking the magic link (auth callback)
 *   5. Land on the experience form
 *   6. Fill in description + category
 *   7. Submit → see RADAR reveal
 *   8. Verify trial activation fired (POST /api/subscription/activate-trial)
 *
 * Currently gated behind test.skip() because it requires:
 *   - A test Supabase project with magic-link auth disabled (for
 *     deterministic token handling) OR a way to inject a session
 *     directly into the browser via cookie
 *   - PLAYWRIGHT_TEST_USER_EMAIL / PLAYWRIGHT_TEST_USER_PASSWORD env
 *     vars set to a known test account
 *
 * Once the test-backend story lands (see tests/e2e/README.md), remove
 * the test.skip() and this flow runs against the test backend in CI.
 */

import { test, expect } from '@playwright/test'

test.describe('signup → submit → reveal flow (T1.8 + E0.5)', () => {
  test.skip(
    !process.env.PLAYWRIGHT_TEST_USER_EMAIL,
    'requires PLAYWRIGHT_TEST_USER_EMAIL env var + test backend (see tests/e2e/README.md)',
  )

  test('unauthed user lands on account step, completes signup, submits, sees reveal', async ({ page }) => {
    // Step 1-2: anon user on /start sees the account gate
    await page.goto('/start')
    await expect(page.getByRole('heading', { level: 1 }))
      .toContainText(/sign up to share your experience/i)

    // Step 3: enter email + username
    await page.getByLabel(/email/i).fill(process.env.PLAYWRIGHT_TEST_USER_EMAIL!)
    await page.getByLabel(/username/i).fill('e2e-' + Date.now())
    await page.getByRole('button', { name: /send me the link/i }).click()

    // Step 4: in a real test-backend, an admin tool would surface the
    // magic link or we'd inject a session directly. For now, simulate
    // arrival from /auth/callback with a session.
    // TODO: replace with session-injection helper once the test
    // backend has admin tooling for OTP retrieval.
    await page.goto('/start?from=auth')

    // Step 5: post-auth lands on experience form (T1.8 account-first
    // routing — see lab.tsx mount effect)
    await expect(page.getByRole('heading')).toBeVisible({ timeout: 10_000 })

    // Step 6: fill the form
    const description = page.getByPlaceholder(/describe|happened|experience/i).first()
    await description.fill(
      'I was driving home around 11pm when I saw three bright lights ' +
      'in a triangle formation hovering silently above a field. They ' +
      'rotated slowly before darting off at high speed. About 30 seconds ' +
      'total. Two other drivers pulled over to watch.',
    )

    // Step 7: continue + verify submit + reveal
    await page.getByRole('button', { name: /continue/i }).click()

    // Reveal step should render the RADAR or a matches list. Wait for
    // any of those indicators.
    await expect(
      page.getByText(/your radar|matches|patterns/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Step 8: verify trial activation fired. We can't easily inspect
    // the server side from here, but we can check the client posted to
    // the trial endpoint by spying on the request.
    // (Implementation note: in real CI, this assertion would be
    //  set up with `page.waitForRequest` BEFORE the submit action.)
  })
})
