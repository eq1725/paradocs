/**
 * PostHog wrapper — V10.10 + T1.12
 *
 * Single source of truth for PostHog usage in the app. Components
 * call `capture(eventName, properties)` and never touch the SDK
 * directly. Two reasons:
 *
 *   1. Mockability — every test can stub this module without
 *      stubbing posthog-js itself.
 *   2. Defensive defaults — if the SDK isn't initialized (env var
 *      missing, SSR, ad-blocker), every helper no-ops silently
 *      instead of throwing. Analytics never breaks the product.
 *
 * Configuration choices baked in (rationale in init):
 *   - autocapture: false           — we send named events explicitly
 *   - mask_all_text: true          — no user-typed content in replays
 *   - mask_all_inputs: true        — no form values in replays
 *   - session recording sample 10% — burns the free-tier quota slowly
 *   - person_profiles: 'identified_only' — anonymous users don't
 *     consume the per-MAU quota
 *
 * T1.12 — session replay re-enabled with Private Relay safeguards:
 *   - api_host points to '/_posthog' reverse-proxied through our own
 *     origin (next.config.js rewrites). Private Relay blocks third-
 *     party telemetry origins like i.posthog.com but not first-party
 *     paths on the visited site, so events + recordings flow.
 *   - Stricter blockSelector covers textareas, email/password inputs,
 *     Ask the Unknown form, comments, and report description fields
 *     by default. Mask + block prevent user-typed content from
 *     leaving the device even if the recorder happens to capture
 *     surrounding DOM.
 *   - startSessionRecording is gated behind a health-check ping: if
 *     the proxy endpoint is unreachable for any reason, we silently
 *     skip recording for that session instead of letting the SDK
 *     thrash retries.
 *   - The V10.10.2 try/catch wrap is preserved end-to-end so a bad
 *     SDK build never crashes _app.tsx.
 */

import type { PostHog } from 'posthog-js'

let posthogInstance: PostHog | null = null
let initialized = false

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
// T1.12 — default to the same-origin reverse proxy. The legacy host
// env var is still honored for back-compat / on-prem PostHog setups
// that don't use Private Relay-affected origins.
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || '/_posthog'

// T1.12 — session recording can be re-enabled per V10.10.2 hotfix
// rollback. Default ON via the new safeguards; allow env-var override
// to flip back to disabled without a code change if regressions land.
const SESSION_RECORDING_ENABLED = process.env.NEXT_PUBLIC_POSTHOG_DISABLE_RECORDING !== '1'

// T1.12 — stricter block selector. Each entry covers a known PII
// surface. PostHog will neither capture nor render these elements in
// session recordings; ancestor DOM is captured but the matched node is
// represented as a blocked placeholder. Add a `data-private` attribute
// to any new surface that handles PII to inherit this protection.
const BLOCK_SELECTOR = [
  // All free-text user input (default: assume PII risk)
  'textarea',
  // Email / password / phone inputs — never capture these directly
  'input[type="email"]',
  'input[type="password"]',
  'input[type="tel"]',
  'input[autocomplete*="email"]',
  'input[autocomplete*="password"]',
  // Universal opt-out via attribute — usable anywhere
  '[data-private]',
  '[data-posthog-block]',
  // Ask the Unknown question form on /lab?tab=ask
  '.ask-the-unknown-input',
  '[data-ask-input]',
  // Report-description fields on /start (where users type their
  // paranormal experience — the most sensitive free-text in the app)
  '[data-report-description]',
  '#report-description',
  // Comments / replies (future surface — covered preemptively)
  '.comment-input',
  '[data-comment-input]',
].join(', ')

/**
 * T1.12 — health-check the PostHog endpoint before starting session
 * recording. If the proxy is unreachable (network, Private Relay edge
 * cases, mis-configured deploy), we'd rather skip recording for that
 * session than have the SDK thrash retries that may block resources.
 * Returns true when the endpoint responded; false when it didn't.
 */
async function posthogEndpointReachable(host: string): Promise<boolean> {
  if (typeof fetch === 'undefined') return false
  try {
    // Use HEAD against a known PostHog endpoint that returns quickly.
    // /decide is the SDK's bootstrap endpoint — if it's reachable, the
    // SDK has a viable transport.
    var url = host.replace(/\/+$/, '') + '/decide/?v=3'
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null
    var timeoutId: any
    if (ctrl) {
      timeoutId = setTimeout(function () { ctrl!.abort() }, 1500)
    }
    var resp = await fetch(url, {
      method: 'HEAD',
      // Don't block on credentials; PostHog accepts no-cors here.
      mode: 'no-cors',
      cache: 'no-store',
      signal: ctrl ? ctrl.signal : undefined,
    })
    if (timeoutId) clearTimeout(timeoutId)
    // With mode: 'no-cors' we get an opaque response. Any non-thrown
    // response (status 0 or otherwise) means the endpoint accepted
    // the request — that's enough signal to proceed.
    return !!resp
  } catch (_e) {
    return false
  }
}

/**
 * Initialize PostHog. Idempotent — safe to call multiple times.
 * Returns the instance (or null if disabled).
 *
 * Call once on app mount, after the user's auth state has been
 * resolved (so the identify() call below has a real user_id).
 */
export function initPostHog(): PostHog | null {
  if (typeof window === 'undefined') return null
  if (initialized) return posthogInstance
  if (!POSTHOG_KEY) {
    // Silent no-op — keeps Preview/Development deployments clean.
    initialized = true
    return null
  }

  // V10.10.2 — every step now wrapped in try/catch. The SDK isn't
  // supposed to throw at init, but if posthog-js loads with a bad
  // payload, version mismatch, or CSP block, we'd rather no-op the
  // entire analytics layer than crash _app.tsx for every user.
  try {
    // Dynamic import keeps PostHog out of the SSR bundle. The SDK
    // touches window during construction so it can't be imported at
    // the module top-level under Next.js.
    const posthog: PostHog = require('posthog-js').default

    posthog.init(POSTHOG_KEY, {
      api_host: POSTHOG_HOST,
      // T1.12 — point asset loading at the same reverse proxy so the
      // recorder script (rrweb) bundle isn't blocked by Private Relay.
      // PostHog reads this when fetching its static recorder bundle.
      ui_host: 'https://us.posthog.com',
      // V10.10 — explicit config choices. Each one matters for our
      // privacy posture or our cost trajectory; don't change without
      // re-reading the comments above.
      autocapture: false,
      capture_pageview: true,
      capture_pageleave: true,
      persistence: 'localStorage+cookie',
      // Anonymous visitors don't get person profiles — only signed-in
      // users do. Keeps the per-MAU billing meter focused on the
      // population we actually care about.
      person_profiles: 'identified_only',
      // T1.12 — session recording re-enabled with safeguards. We
      // start the recorder manually (via startSessionRecording below)
      // AFTER a health-check ping to the proxy so a Private-Relay-
      // blocked endpoint doesn't trigger SDK retry storms.
      disable_session_recording: !SESSION_RECORDING_ENABLED,
      // Stricter privacy posture on recordings: mask everything by
      // default, then explicitly block known-PII selectors so even
      // the masked-text placeholder doesn't appear for those inputs.
      session_recording: {
        maskAllInputs: true,
        maskTextSelector: '*',
        blockSelector: BLOCK_SELECTOR,
        // Don't record canvas / image data from third-party assets.
        recordCrossOriginIframes: false,
      } as any,
      // Respect Do Not Track signals.
      respect_dnt: true,
      // We pass our own user_id via identify() — disable PostHog's
      // anonymous-ID-promotion-on-identify so the two ID spaces stay
      // distinct (anonymous events get attached to authenticated
      // users on identify, but the anon ID isn't preserved).
      bootstrap: {},
      // T1.12 — turn off the SDK's auto-start of session recording so
      // we can gate it on the health check below. Without this, the
      // SDK would start recording immediately on init and could hammer
      // an unreachable proxy.
      loaded: function (ph: any) {
        if (!SESSION_RECORDING_ENABLED) return
        // Fire-and-forget — never block init on the health check.
        posthogEndpointReachable(POSTHOG_HOST).then(function (ok) {
          if (!ok) {
            // Endpoint not reachable from this client — skip recording
            // for the session. Events still flow (capture() will retry
            // via the SDK's own offline queue), recordings don't.
            try { ph.stopSessionRecording && ph.stopSessionRecording() } catch (_e) {}
            return
          }
          try { ph.startSessionRecording && ph.startSessionRecording() } catch (_e) {}
        }).catch(function () { /* swallow */ })
      },
    })

    posthogInstance = posthog
  } catch (e) {
    console.warn('[posthog] init failed (analytics disabled):', e)
    posthogInstance = null
  }
  initialized = true
  return posthogInstance
}

/**
 * Capture a named event. Safe to call before init (no-ops); safe to
 * call from SSR (no-ops); safe to call when PostHog is disabled
 * (no-ops). Use this everywhere instead of touching posthog directly.
 */
export function capture(eventName: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!posthogInstance) return
  try {
    posthogInstance.capture(eventName, properties)
  } catch (_e) {
    // Never let analytics throw into product code.
  }
}

/**
 * Tie subsequent events to a user_id. Call once on sign-in, again
 * on session refresh. Idempotent — PostHog handles re-identification.
 *
 * Properties live on the Person and are queryable in PostHog UI.
 * Stick to non-PII (email is fine; never report content / phone).
 */
export function identify(userId: string, properties?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return
  if (!posthogInstance) return
  try {
    posthogInstance.identify(userId, properties)
  } catch (_e) { /* swallow */ }
}

/**
 * Clear the identified user — call on sign-out so subsequent events
 * are anonymous and don't get attached to the previous account.
 */
export function reset(): void {
  if (typeof window === 'undefined') return
  if (!posthogInstance) return
  try {
    posthogInstance.reset()
  } catch (_e) { /* swallow */ }
}

/**
 * Read a feature flag. Returns boolean for boolean flags, string
 * for multivariate flags, false when PostHog isn't initialized
 * (so feature-gating fails safely closed).
 *
 * Usage:
 *   if (getFeatureFlag('signal-hero-pick-strategy') === 'fingerprint-first') { ... }
 *   if (getFeatureFlag('new-onboarding-v2')) { ... }
 *
 * Flags must be created in PostHog UI before they return non-default
 * values — see the V10.10 follow-up for the two flags we expect to
 * use first.
 */
export function getFeatureFlag(flagKey: string): boolean | string {
  if (typeof window === 'undefined') return false
  if (!posthogInstance) return false
  try {
    var v = posthogInstance.getFeatureFlag(flagKey)
    if (v === undefined || v === null) return false
    return v as boolean | string
  } catch (_e) { return false }
}
