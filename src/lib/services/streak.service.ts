/**
 * Streak Service
 *
 * Handles activity logging and research streak tracking.
 * Uses the `log_activity_and_update_streak` RPC function to atomically
 * log an activity and recalculate the user's streak in one call.
 */

import { supabase } from '@/lib/supabase'

export type ActivityType =
  | 'view_report'
  | 'submit_report'
  | 'save_report'
  | 'vote'
  | 'comment'
  | 'journal_entry'
  | 'search'
  | 'explore'

export interface StreakData {
  current_streak: number
  longest_streak: number
  total_active_days: number
  streak_started_at: string | null
  last_active_date: string | null
}

export interface StreakMilestone {
  days: number
  label: string
  icon: string
}

export const STREAK_MILESTONES: StreakMilestone[] = [
  { days: 3, label: 'Getting Started', icon: '🌱' },
  { days: 7, label: 'One Week', icon: '🔥' },
  { days: 14, label: 'Two Weeks', icon: '⚡' },
  { days: 30, label: 'One Month', icon: '🌟' },
  { days: 60, label: 'Two Months', icon: '💫' },
  { days: 100, label: 'Century', icon: '🏆' },
  { days: 365, label: 'One Year', icon: '👑' },
]

/**
 * Get the current user's streak data
 */
export async function getStreak(userId: string): Promise<StreakData | null> {
  try {
    const { data, error } = await supabase
      .from('user_streaks' as any)
      .select('current_streak, longest_streak, total_active_days, streak_started_at, last_active_date')
      .eq('user_id', userId)
      .single() as any

    if (error || !data) return null
    return data as StreakData
  } catch {
    return null
  }
}

/**
 * Log an activity and update the user's streak.
 * Returns the updated streak data.
 *
 * Debounced per activity type — only logs once per type per session
 * to prevent spamming (e.g., scrolling through many reports).
 */
const loggedThisSession = new Set<string>()

export async function logActivity(
  activityType: ActivityType,
  metadata: Record<string, any> = {},
  options: { force?: boolean } = {}
): Promise<StreakData | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session?.user) return null

    const userId = session.user.id

    // Debounce: only log each activity type once per session
    // (unless force is true, e.g., for explicit actions like submitting a report)
    const dedupeKey = `${activityType}:${metadata.report_id || 'general'}`
    if (!options.force && loggedThisSession.has(dedupeKey)) {
      // Still return current streak even if we skip logging
      return getStreak(userId)
    }
    loggedThisSession.add(dedupeKey)

    // Call the RPC that logs activity + updates streak atomically
    const { data, error } = await supabase.rpc('log_activity_and_update_streak', {
      p_user_id: userId,
      p_activity_type: activityType,
      p_metadata: metadata,
    }) as any

    if (error) {
      console.error('Error logging activity:', error)
      return null
    }

    return data as StreakData
  } catch (err) {
    console.error('Error in logActivity:', err)
    return null
  }
}

/**
 * Get the next milestone the user is working toward
 */
export function getNextMilestone(currentStreak: number): StreakMilestone | null {
  return STREAK_MILESTONES.find(m => m.days > currentStreak) || null
}

/**
 * Get the highest milestone the user has achieved
 */
export function getCurrentMilestone(currentStreak: number): StreakMilestone | null {
  const achieved = STREAK_MILESTONES.filter(m => m.days <= currentStreak)
  return achieved.length > 0 ? achieved[achieved.length - 1] : null
}

/**
 * Get the last 30 days of activity for the streak calendar
 */
export async function getRecentActivity(userId: string): Promise<Set<string>> {
  try {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

    const { data } = await supabase
      .from('user_activity_log' as any)
      .select('created_at')
      .eq('user_id', userId)
      .gte('created_at', thirtyDaysAgo.toISOString())
      .order('created_at', { ascending: false }) as any

    if (!data) return new Set()

    // Extract unique dates (YYYY-MM-DD)
    const dates = new Set<string>()
    data.forEach((row: any) => {
      const date = new Date(row.created_at).toISOString().split('T')[0]
      dates.add(date)
    })

    return dates
  } catch {
    return new Set()
  }
}

/**
 * Generate a friendly streak message
 */
export function getStreakMessage(streak: StreakData): string {
  if (streak.current_streak === 0) {
    return 'Start your research streak today!'
  }
  if (streak.current_streak === 1) {
    return "You've started investigating. Come back tomorrow to build your streak."
  }
  if (streak.current_streak < 7) {
    return `You've been investigating for ${streak.current_streak} consecutive days.`
  }
  if (streak.current_streak < 30) {
    return `${streak.current_streak} days of dedicated research. Keep going!`
  }
  if (streak.current_streak < 100) {
    return `${streak.current_streak} consecutive days. Your dedication is remarkable.`
  }
  return `${streak.current_streak} days. You're among our most dedicated investigators.`
}
