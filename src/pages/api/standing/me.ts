/**
 * GET /api/standing/me
 *
 * V11.17.42 — returns the authenticated user's Standing (both pills
 * + prose progression copy + Lab flag) for the profile page.
 *
 * Reads from user_standing; recomputes on the fly if missing or
 * older than STANDING_STALE_MS (24h). The nightly cron keeps active
 * users fresh; this endpoint guards against silent stagnation when
 * someone just crossed a threshold and is staring at their profile.
 *
 * Response shape: see types.StandingMeResponse below.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  buildDisplay,
  buildProgress,
  getStandingForUser,
  isLabSubscriber,
} from '@/lib/services/standing.service'
import { StandingDisplay, StandingProgress } from '@/lib/standing/types'

interface StandingMeResponse {
  display: StandingDisplay
  progress: {
    catalogue: StandingProgress
    contribution: StandingProgress
  }
  /** Snapshot counts so the UI can show the underlying numbers if it wants to. */
  counts: {
    saves: number
    active_days: number
    account_age_days: number
    reports: number
    comments: number
    journal: number
  }
}

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'not_authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'invalid_session' })

  try {
    var [row, lab] = await Promise.all([
      getStandingForUser(user.id),
      isLabSubscriber(user.id),
    ])
    if (!row) {
      // Should be rare — a recompute failure. Return a safe default
      // so the UI can render the Reader/Witness floor.
      var fallback: StandingMeResponse = {
        display: { catalogue_tier: 1, contribution_tier: 1, inline_label: null, is_lab: lab },
        progress: {
          catalogue: buildProgress('catalogue', {
            user_id: user.id, catalogue_tier: 1, contribution_tier: 1,
            catalogue_since: null, contribution_since: null,
            saves_count: 0, active_days: 0, account_age_days: 0,
            reports_count: 0, comments_count: 0, journal_count: 0,
            computed_at: new Date().toISOString(),
          }),
          contribution: buildProgress('contribution', {
            user_id: user.id, catalogue_tier: 1, contribution_tier: 1,
            catalogue_since: null, contribution_since: null,
            saves_count: 0, active_days: 0, account_age_days: 0,
            reports_count: 0, comments_count: 0, journal_count: 0,
            computed_at: new Date().toISOString(),
          }),
        },
        counts: { saves: 0, active_days: 0, account_age_days: 0, reports: 0, comments: 0, journal: 0 },
      }
      return res.status(200).json(fallback)
    }

    var resp: StandingMeResponse = {
      display: buildDisplay(row, lab),
      progress: {
        catalogue: buildProgress('catalogue', row),
        contribution: buildProgress('contribution', row),
      },
      counts: {
        saves: row.saves_count,
        active_days: row.active_days,
        account_age_days: row.account_age_days,
        reports: row.reports_count,
        comments: row.comments_count,
        journal: row.journal_count,
      },
    }
    // Short cache — the profile page doesn't need to chase the count
    // in real time, but 5 minutes is short enough that crossing a
    // tier still feels close to live.
    res.setHeader('Cache-Control', 'private, max-age=300')
    return res.status(200).json(resp)
  } catch (e: any) {
    console.error('[standing/me] error: ' + (e && e.message ? e.message : e))
    return res.status(500).json({ error: 'internal_error' })
  }
}
