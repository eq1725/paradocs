/**
 * GET /api/lab/promo/should-show
 *
 * V11.17.40 — Backlog #4. Server decides whether the Lab upsell card
 * may be shown in the current session, and at what cadence (every
 * Nth feed card). The client uses the returned shape to inject the
 * promo at positions [N, 2N, 3N, ...] up to LabPromo's session
 * placement budget; the hard cap (6/week) is enforced server-side
 * by short-circuiting `should_show=false` once the weekly threshold
 * is reached.
 *
 * Input:
 *   - Authed: Bearer token (user_id resolved)
 *   - Anon: ?session_id=<uuid> (client maintains in localStorage
 *     under key 'lab_promo_session_v1')
 *
 * Response:
 *   {
 *     should_show: boolean,
 *     cadence: 12 | 25,             // every Nth feed card
 *     reason?: 'paywall_cooldown' | 'dismiss_cooldown' | 'weekly_cap' |
 *              'tier_pro' | null,
 *     impressions_7d: number,
 *     weekly_cap: 6,
 *     // Cooldown timestamps echoed for client diagnostics.
 *     last_dismissed_at?: string | null,
 *     last_clicked_at?: string | null,
 *   }
 *
 * Notes:
 *   - "tier_pro" short-circuit handled client-side today; if the
 *     server gets a user_id and we can resolve tier='pro' we'll
 *     return reason='tier_pro'. For now the client still gates.
 *   - 'clicked' is treated as the paywall_view signal because the
 *     Lab CTA goes directly to /pricing. A future explicit
 *     'paywall_view' event from /pricing strengthens this.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const WEEKLY_CAP = 6
const DISMISS_COOLDOWN_HOURS = 48
const PAYWALL_COOLDOWN_DAYS = 7
const CADENCE_HIGH_INTENT = 12   // 4+ saves in last 7d
const CADENCE_DEFAULT = 25       // everyone else (incl. anon)
const HIGH_INTENT_SAVES_THRESHOLD = 4
const PERIOD_DAYS = 7

interface ShouldShowResponse {
  should_show: boolean
  cadence: number
  reason: string | null
  impressions_7d: number
  weekly_cap: number
  last_dismissed_at: string | null
  last_clicked_at: string | null
}

function hoursAgo(iso: string | null): number | null {
  if (!iso) return null
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Resolve identity: authed user OR anon session id from query.
    let userId: string | null = null
    const authHeader = req.headers.authorization || ''
    const token = authHeader.replace('Bearer ', '')
    if (token) {
      const userResult = await supabase.auth.getUser(token)
      if (!userResult.error && userResult.data.user) userId = userResult.data.user.id
    }
    const sessionId = typeof req.query.session_id === 'string' ? req.query.session_id : null

    // Must have at least one identifier.
    if (!userId && !sessionId) {
      // No identity — fall back to default cadence, allow show.
      // Client will sync identity on first impression.
      return res.status(200).json(<ShouldShowResponse>{
        should_show: true,
        cadence: CADENCE_DEFAULT,
        reason: null,
        impressions_7d: 0,
        weekly_cap: WEEKLY_CAP,
        last_dismissed_at: null,
        last_clicked_at: null,
      })
    }

    const periodStartIso = new Date(Date.now() - PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString()

    // Cadence: high-intent if signed-in user has 4+ saves in last 7d.
    let cadence = CADENCE_DEFAULT
    let savedCount7d = 0
    if (userId) {
      const savedResult = await supabase
        .from('saved_reports')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', periodStartIso)
      savedCount7d = savedResult.count || 0
      if (savedCount7d >= HIGH_INTENT_SAVES_THRESHOLD) cadence = CADENCE_HIGH_INTENT
    }

    // Subject filter for impression queries — prefer user_id when
    // authed, fall back to session_id otherwise. (We don't merge the
    // two histories; a fresh sign-in counts as a fresh subject. This
    // is conservative — the user re-establishes their cap on
    // sign-in. The alternative — merge by linking session→user — is
    // a future enhancement.)
    let subjectCol: 'user_id' | 'session_id'
    let subjectVal: string
    if (userId) { subjectCol = 'user_id'; subjectVal = userId }
    else        { subjectCol = 'session_id'; subjectVal = sessionId as string }

    // Count shown events in last 7d (hard cap check).
    const shownResult = await supabase
      .from('lab_promo_impressions')
      .select('id', { count: 'exact', head: true })
      .eq(subjectCol, subjectVal)
      .eq('event_type', 'shown')
      .gte('occurred_at', periodStartIso)
    const impressions7d = shownResult.count || 0

    // Latest 'dismissed' (for 48h cooldown).
    const dismissedResult = await supabase
      .from('lab_promo_impressions')
      .select('occurred_at')
      .eq(subjectCol, subjectVal)
      .eq('event_type', 'dismissed')
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastDismissedAt = dismissedResult.data?.occurred_at || null

    // Latest 'clicked' OR 'paywall_view' (for 7d cooldown).
    const paywallResult = await supabase
      .from('lab_promo_impressions')
      .select('occurred_at')
      .eq(subjectCol, subjectVal)
      .in('event_type', ['clicked', 'paywall_view'])
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    const lastClickedAt = paywallResult.data?.occurred_at || null

    // Decision tree — strict order:
    //   1. 7d paywall cooldown
    //   2. 48h dismiss cooldown
    //   3. 6/week hard cap
    //   4. show
    let reason: string | null = null
    let shouldShow = true

    const hoursSincePaywall = hoursAgo(lastClickedAt)
    if (hoursSincePaywall !== null && hoursSincePaywall < PAYWALL_COOLDOWN_DAYS * 24) {
      shouldShow = false
      reason = 'paywall_cooldown'
    } else {
      const hoursSinceDismiss = hoursAgo(lastDismissedAt)
      if (hoursSinceDismiss !== null && hoursSinceDismiss < DISMISS_COOLDOWN_HOURS) {
        shouldShow = false
        reason = 'dismiss_cooldown'
      } else if (impressions7d >= WEEKLY_CAP) {
        shouldShow = false
        reason = 'weekly_cap'
      }
    }

    return res.status(200).json(<ShouldShowResponse>{
      should_show: shouldShow,
      cadence,
      reason,
      impressions_7d: impressions7d,
      weekly_cap: WEEKLY_CAP,
      last_dismissed_at: lastDismissedAt,
      last_clicked_at: lastClickedAt,
    })
  } catch (e: any) {
    console.error('[api/lab/promo/should-show] error:', e?.message || e)
    // Fail-open: if telemetry breaks, fall back to default-cadence-show.
    // The 6/week cap is a "nice to have" not a "must enforce"; better
    // to keep the upsell working than to hide it entirely on errors.
    return res.status(200).json(<ShouldShowResponse>{
      should_show: true,
      cadence: CADENCE_DEFAULT,
      reason: null,
      impressions_7d: 0,
      weekly_cap: WEEKLY_CAP,
      last_dismissed_at: null,
      last_clicked_at: null,
    })
  }
}
