/**
 * V11.17.40 — Backlog #4. Tiny client helper for the Lab promo
 * impression/event telemetry. Lives outside the LabPromo component
 * so both the promo card AND discover.tsx's swipe handler can call
 * into the same identity + fetch logic.
 *
 * Identity:
 *   - Signed-in: passes Bearer token; user_id resolved server-side.
 *   - Anon: generates and persists a stable session_id in
 *     localStorage under SESSION_KEY. Same key the should-show
 *     endpoint reads from the query string.
 */

import { supabase } from '@/lib/supabase'

const SESSION_KEY = 'lab_promo_session_v1'

export type LabPromoEvent = 'shown' | 'dismissed' | 'clicked' | 'paywall_view'

/**
 * Get-or-create the anonymous session id. Stable across page loads
 * (localStorage), regenerated only if cleared. Returns null in
 * non-browser contexts (SSR).
 */
export function getLabPromoSessionId(): string | null {
  if (typeof window === 'undefined') return null
  try {
    var existing = localStorage.getItem(SESSION_KEY)
    if (existing) return existing
    var fresh = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : 'sid_' + Math.random().toString(36).slice(2) + Date.now().toString(36)
    localStorage.setItem(SESSION_KEY, fresh)
    return fresh
  } catch (_e) {
    return null
  }
}

interface ShouldShowResponse {
  should_show: boolean
  cadence: number
  reason: string | null
  impressions_7d: number
  weekly_cap: number
  last_dismissed_at: string | null
  last_clicked_at: string | null
}

/**
 * Ask the server whether the Lab promo may be shown in the current
 * session, and at what cadence (every Nth feed card). Network
 * errors → permissive default (show with cadence=25).
 */
export async function fetchLabPromoShouldShow(): Promise<ShouldShowResponse> {
  const fallback: ShouldShowResponse = {
    should_show: true,
    cadence: 25,
    reason: null,
    impressions_7d: 0,
    weekly_cap: 6,
    last_dismissed_at: null,
    last_clicked_at: null,
  }
  try {
    var sessionResult = await supabase.auth.getSession()
    var token = sessionResult.data.session?.access_token || ''
    var headers: any = {}
    if (token) headers.Authorization = 'Bearer ' + token
    var sid = getLabPromoSessionId()
    var url = '/api/lab/promo/should-show' + (sid ? ('?session_id=' + encodeURIComponent(sid)) : '')
    var r = await fetch(url, { headers })
    if (!r.ok) return fallback
    var j = await r.json()
    return {
      should_show: !!j.should_show,
      cadence: typeof j.cadence === 'number' ? j.cadence : 25,
      reason: j.reason || null,
      impressions_7d: j.impressions_7d || 0,
      weekly_cap: j.weekly_cap || 6,
      last_dismissed_at: j.last_dismissed_at || null,
      last_clicked_at: j.last_clicked_at || null,
    }
  } catch (_e) {
    return fallback
  }
}

/**
 * Fire-and-forget event log. Errors are swallowed — failed
 * telemetry must never disrupt UX.
 */
export async function logLabPromoEvent(
  eventType: LabPromoEvent,
  context: Record<string, unknown> = {},
): Promise<void> {
  try {
    var sessionResult = await supabase.auth.getSession()
    var token = sessionResult.data.session?.access_token || ''
    var headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (token) headers.Authorization = 'Bearer ' + token
    var sid = getLabPromoSessionId()
    await fetch('/api/lab/promo/event', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        event_type: eventType,
        session_id: sid,
        context,
      }),
      // Best-effort: don't block on slow network, don't surface errors.
      keepalive: true,
    })
  } catch (_e) {
    /* swallow */
  }
}
