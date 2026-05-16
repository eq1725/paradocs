# E2E tests (T1.13)

Pre-launch insurance against regressions on critical paths. Playwright
suite covering the four flows the MVP spec names plus per-page smoke
tests for the most important surfaces.

## Local setup

```bash
npm install               # installs @playwright/test
npm run test:e2e:install  # one-time: fetches Chromium binary
npm run dev               # in one terminal
npm run test:e2e          # in another
```

UI mode (interactive runner):

```bash
npm run test:e2e:ui
```

## What's covered

**Smoke tests** (`smoke.spec.ts`) — fast, no-auth, render-correctness
checks for the highest-traffic surfaces. Catches deploy-time regressions
(broken imports, blank pages, runtime errors on first paint). Run in
under 30 seconds.

**Flow tests** — the four spec-named flows live in their own files:

- `signup-submit-reveal.spec.ts` — account-first onboarding (T1.8) →
  experience form → submit → RADAR reveal
- `delete-own-report.spec.ts` — Story tab > Manage Submissions → delete
  flow
- `push-opt-in.spec.ts` — notification permission prompt → subscription
  saved
- `email-digest.spec.ts` — `/lab?tab=story#email-prefs` → toggle digest
  cadence → confirm preference persists

## Backend-mocking status (important)

The flow tests require real authenticated requests against the Supabase
backend. The MVP suite handles this two ways:

1. **Pages-level smoke checks** are unauthenticated and run against any
   environment.
2. **Authenticated flows** are written but **gated behind `test.skip()`**
   until the dedicated test backend is set up. Recommended path:
   - Spin up a `paradocs-test` Supabase project as a snapshot of prod
     schema (no production data)
   - Create a CI-only service-role API key for that project
   - Add a `PLAYWRIGHT_TEST_USER_EMAIL` + `PLAYWRIGHT_TEST_USER_PASSWORD`
     pair to repo secrets
   - Remove the `test.skip()` lines and the tests start exercising real
     auth + DB

This split lets the smoke suite catch obvious regressions today while
preserving the structure for the full flows once the test backend
exists. Track as a follow-up task post-launch.

## CI integration

`.github/workflows/e2e.yml` runs the suite on every push to main and
on PRs. Currently runs only the smoke tests in CI; the gated flows
will activate automatically once the test backend secrets land.

## Adding a new test

1. Create `tests/e2e/<feature>.spec.ts`
2. Use `test.describe()` to group related cases
3. Prefer accessibility-based selectors (`getByRole`, `getByLabel`)
   over CSS classes — they survive design refactors
4. Run locally first (`npm run test:e2e`), then push
5. CI will pick it up automatically

## Why Playwright and not Cypress

Playwright supports multi-browser (Chromium + WebKit + Firefox) from a
single test file, ships with mobile-emulation profiles out of the box
(critical for Paradocs's Capacitor-wrap submission story), and has a
trace viewer that surfaces full DOM + network + console state on
failures. Cypress is fine but Playwright's WebKit support is essential
for catching iOS-specific bugs pre-submission.
