/**
 * POST /api/user/streak-bootstrap
 *
 * V8.4 — closes the V8.2 anonymous-streak-nudge loop. When a user
 * who's been tracking a streak in localStorage signs in, this
 * endpoint migrates the count to their server-side user_streaks row.
 *
 * Body:
 *   { anon_days: number, anon_last_visit?: string (YYYY-MM-DD) }
 *
 * Behavior:
 *   - Only takes effect if the user's existing current_streak is
 *     LESS than anon_days (otherwise their server streak is already
 *     ahead — likely they cleared cookies but kept their account).
 *   - Sets current_streak = max(server, anon_days).
 *   - Sets longest_streak = max(longest_streak, anon_days).
 *   - Sets total_active_days = max(total_active_days, anon_days).
 *   - Sets last_active_date to today.
 *   - Sets streak_started_at to today minus (anon_days - 1) days
 *     when seeding a brand-new streak record.
 *
 * Idempotent: calling twice with the same value produces the same
 * result. The client should clear localStorage after a successful
 * call so it doesn't keep re-bootstrapping on every visit.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createServerSupabaseClient({ req, res })
  var { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  var userId = session.user.id
  var anonDays = parseInt(String(req.body?.anon_days || 0), 10)
  if (isNaN(anonDays) || anonDays < 1 || anonDays > 365) {
    return res.status(400).json({ error: 'Invalid anon_days (must be 1-365)' })
  }

  try {
    // Read existing streak (if any)
    var { data: existing } = await supabase
      .from('user_streaks')
      .select('current_streak, longest_streak, total_active_days, streak_started_at, last_active_date')
      .eq('user_id', userId)
      .single()

    var existingCurrent = (existing && typeof existing.current_streak === 'number') ? existing.current_streak : 0
    var existingLongest = (existing && typeof existing.longest_streak === 'number') ? existing.longest_streak : 0
    var existingTotal = (existing && typeof existing.total_active_days === 'number') ? existing.total_active_days : 0

    // Server already at or ahead — no-op
    if (existingCurrent >= anonDays) {
      return res.status(200).json({
        migrated: false,
        reason: 'server_already_ahead',
        current_streak: existingCurrent,
      })
    }

    // Compute new values
    var nextCurrent = anonDays
    var nextLongest = Math.max(existingLongest, anonDays)
    var nextTotal = Math.max(existingTotal, anonDays)
    var today = new Date()
    var todayStr = today.toISOString().substring(0, 10)
    // streak_started_at = today minus (anon_days - 1) days
    var startDate = new Date(today.getTime())
    startDate.setDate(startDate.getDate() - (anonDays - 1))
    var startStr = startDate.toISOString().substring(0, 10)

    var upsertPayload: any = {
      user_id: userId,
      current_streak: nextCurrent,
      longest_streak: nextLongest,
      total_active_days: nextTotal,
      last_active_date: todayStr,
    }
    // Only seed streak_started_at when this is a brand-new record
    // (otherwise we'd overwrite the user's existing start date).
    if (!existing || !existing.streak_started_at) {
      upsertPayload.streak_started_at = startStr
    }

    var { error: upsertError } = await supabase
      .from('user_streaks')
      .upsert(upsertPayload, { onConflict: 'user_id' })

    if (upsertError) {
      console.error('[StreakBootstrap] Upsert error:', upsertError)
      return res.status(500).json({ error: 'Failed to bootstrap streak' })
    }

    return res.status(200).json({
      migrated: true,
      current_streak: nextCurrent,
      longest_streak: nextLongest,
      total_active_days: nextTotal,
      streak_started_at: (existing && existing.streak_started_at) || startStr,
    })
  } catch (error) {
    console.error('[StreakBootstrap] Error:', error)
    return res.status(500).json({ error: 'Failed to bootstrap streak' })
  }
}
