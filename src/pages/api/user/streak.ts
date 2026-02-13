/**
 * User Streak API
 *
 * GET  /api/user/streak — returns current streak data + recent activity calendar
 * POST /api/user/streak — logs an activity and updates streak
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const supabase = createServerSupabaseClient({ req, res })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  const userId = session.user.id

  if (req.method === 'GET') {
    try {
      // Get streak data
      const { data: streak } = await supabase
        .from('user_streaks')
        .select('current_streak, longest_streak, total_active_days, streak_started_at, last_active_date')
        .eq('user_id', userId)
        .single()

      // Get last 30 days of activity for calendar
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

      const { data: activityRows } = await supabase
        .from('user_activity_log')
        .select('created_at')
        .eq('user_id', userId)
        .gte('created_at', thirtyDaysAgo.toISOString())
        .order('created_at', { ascending: false })

      // Extract unique dates
      const activeDates: string[] = []
      const seen = new Set<string>()
      if (activityRows) {
        activityRows.forEach((row: any) => {
          const date = new Date(row.created_at).toISOString().split('T')[0]
          if (!seen.has(date)) {
            seen.add(date)
            activeDates.push(date)
          }
        })
      }

      return res.status(200).json({
        streak: streak || {
          current_streak: 0,
          longest_streak: 0,
          total_active_days: 0,
          streak_started_at: null,
          last_active_date: null,
        },
        activeDates,
      })
    } catch (error) {
      console.error('Error fetching streak:', error)
      return res.status(500).json({ error: 'Failed to fetch streak data' })
    }
  }

  if (req.method === 'POST') {
    const { activity_type, metadata = {} } = req.body

    if (!activity_type) {
      return res.status(400).json({ error: 'activity_type is required' })
    }

    const validTypes = [
      'view_report', 'submit_report', 'save_report', 'vote',
      'comment', 'journal_entry', 'search', 'explore',
    ]

    if (!validTypes.includes(activity_type)) {
      return res.status(400).json({ error: `Invalid activity_type. Must be one of: ${validTypes.join(', ')}` })
    }

    try {
      const { data, error } = await supabase.rpc('log_activity_and_update_streak', {
        p_user_id: userId,
        p_activity_type: activity_type,
        p_metadata: metadata,
      })

      if (error) {
        console.error('Error logging activity:', error)
        return res.status(500).json({ error: 'Failed to log activity' })
      }

      return res.status(200).json({ streak: data })
    } catch (error) {
      console.error('Error in POST /api/user/streak:', error)
      return res.status(500).json({ error: 'Failed to log activity' })
    }
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
