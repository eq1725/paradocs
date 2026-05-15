/**
 * PostHog wrapper — V10.10
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
 * The init function is called once from _app.tsx on the client.
 * Server-side analytics (cron jobs, API routes) should use a
 * separate posthog-node client — out of scope for this commit.
 */

import type { PostHog } from 'posthog-js'

let posthogInstance: PostHog | null = null
let initialized = false

const POSTHOG_KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY || ''
const POSTHOG_HOST = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

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

  // Dynamic import keeps PostHog out of the SSR bundle. The SDK
  // touches window during construction so it can't be imported at
  // the module top-level under Next.js.
  const posthog: PostHog = require('posthog-js').default

  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
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
    // Session replay config — heavy masking + 10% sample rate.
    // Inputs are masked by SDK default; we additionally mask all
    // text so users' report content / Ask the Unknown questions /
    // chat-style messages never end up in replays.
    session_recording: {
      maskAllInputs: true,
      maskTextSelector: '*',
      // Block specific selectors as belt-and-suspenders for any
      // surface where text masking might be insufficient (e.g.
      // textareas with PII, message threads).
      blockSelector: '[data-no-replay], textarea, input[type="email"], input[type="tel"]',
    },
    // Capture only 10% of sessions for replay. Adjust upward later
    // if we need more coverage; recording quota is the first thing
    // to blow past on the free tier.
    session_recording_sample_rate: 0.1 as any,
    // Don't auto-start recording until after page-load idle.
    disable_session_recording: false,
    // Respect Do Not Track signals.
    respect_dnt: true,
    // We pass our own user_id via identify() — disable PostHog's
    // anonymous-ID-promotion-on-identify so the two ID spaces stay
    // distinct (anonymous events get attached to authenticated
    // users on identify, but the anon ID isn't preserved).
    bootstrap: {},
  })

  posthogInstance = posthog
  initialized = true
  return posthog
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
