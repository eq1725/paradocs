'use client'

import React, { useEffect, useState } from 'react'
import { Flame, Trophy, Calendar, TrendingUp } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import {
  StreakData,
  getStreak,
  getRecentActivity,
  getStreakMessage,
  getNextMilestone,
  getCurrentMilestone,
  STREAK_MILESTONES,
} from '@/lib/services/streak.service'
import { classNames } from '@/lib/utils'

interface ResearchStreakProps {
  /** Compact mode for dashboard sidebar */
  compact?: boolean
  /** Pre-loaded streak data (avoids extra fetch) */
  initialStreak?: StreakData | null
}

export default function ResearchStreak({ compact = false, initialStreak }: ResearchStreakProps) {
  const [streak, setStreak] = useState<StreakData | null>(initialStreak || null)
  const [activeDates, setActiveDates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(!initialStreak)

  useEffect(() => {
    async function load() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return

      const [streakData, dates] = await Promise.all([
        initialStreak ? Promise.resolve(initialStreak) : getStreak(session.user.id),
        getRecentActivity(session.user.id),
      ])

      setStreak(streakData)
      setActiveDates(dates)
      setLoading(false)
    }

    load()
  }, [initialStreak])

  if (loading) {
    return (
      <div className={classNames(
        'bg-gray-900 border border-gray-800 rounded-xl animate-pulse',
        compact ? 'p-4 h-24' : 'p-6 h-48'
      )} />
    )
  }

  const currentStreak = streak?.current_streak || 0
  const longestStreak = streak?.longest_streak || 0
  const totalDays = streak?.total_active_days || 0
  const message = streak ? getStreakMessage(streak) : 'Start your research streak today!'
  const nextMilestone = getNextMilestone(currentStreak)
  const currentMilestone = getCurrentMilestone(currentStreak)

  // Build last 30 days calendar
  const last30Days: { date: string; active: boolean; isToday: boolean }[] = []
  const today = new Date()
  for (let i = 29; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().split('T')[0]
    last30Days.push({
      date: dateStr,
      active: activeDates.has(dateStr),
      isToday: i === 0,
    })
  }

  // ── Compact mode (for dashboard sidebar) ──
  if (compact) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center gap-3 mb-3">
          <div className={classNames(
            'w-10 h-10 rounded-full flex items-center justify-center',
            currentStreak > 0 ? 'bg-orange-500/20' : 'bg-gray-800'
          )}>
            <Flame className={classNames(
              'w-5 h-5',
              currentStreak > 0 ? 'text-orange-400' : 'text-gray-600'
            )} />
          </div>
          <div className="flex-1">
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{currentStreak}</span>
              <span className="text-gray-500 text-sm">day streak</span>
            </div>
            <p className="text-gray-500 text-xs">{message}</p>
          </div>
        </div>

        {/* Mini calendar — last 30 days */}
        <div className="flex gap-[3px] flex-wrap">
          {last30Days.map((day) => (
            <div
              key={day.date}
              className={classNames(
                'w-[7px] h-[7px] rounded-[2px]',
                day.active ? 'bg-orange-400' : 'bg-gray-800',
                day.isToday && 'ring-1 ring-white/30'
              )}
              title={`${day.date}${day.active ? ' — active' : ''}`}
            />
          ))}
        </div>
      </div>
    )
  }

  // ── Full mode (for constellation page or standalone) ──
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h3 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
        <Flame className={classNames(
          'w-5 h-5',
          currentStreak > 0 ? 'text-orange-400' : 'text-gray-500'
        )} />
        Research Streak
      </h3>

      {/* Main stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        <div className="text-center">
          <div className="text-3xl font-bold text-white">{currentStreak}</div>
          <div className="text-gray-500 text-xs mt-1">Current Streak</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-400">{longestStreak}</div>
          <div className="text-gray-500 text-xs mt-1">Longest Streak</div>
        </div>
        <div className="text-center">
          <div className="text-3xl font-bold text-gray-400">{totalDays}</div>
          <div className="text-gray-500 text-xs mt-1">Total Active Days</div>
        </div>
      </div>

      {/* Message */}
      <p className="text-gray-300 text-sm mb-5">{message}</p>

      {/* 30-day calendar */}
      <div className="mb-5">
        <div className="flex items-center gap-2 mb-2">
          <Calendar className="w-3.5 h-3.5 text-gray-500" />
          <span className="text-gray-500 text-xs">Last 30 days</span>
        </div>
        <div className="flex gap-1 flex-wrap">
          {last30Days.map((day) => (
            <div
              key={day.date}
              className={classNames(
                'w-3 h-3 rounded-sm transition-colors',
                day.active ? 'bg-orange-400' : 'bg-gray-800',
                day.isToday && 'ring-1 ring-white/40'
              )}
              title={`${day.date}${day.active ? ' — active' : ''}`}
            />
          ))}
        </div>
      </div>

      {/* Next milestone */}
      {nextMilestone && (
        <div className="bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-4 h-4 text-amber-400" />
              <span className="text-gray-300 text-sm">
                Next: <span className="text-white font-medium">{nextMilestone.label}</span>
              </span>
            </div>
            <span className="text-gray-500 text-xs">
              {nextMilestone.days - currentStreak} days to go
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 rounded-full transition-all"
              style={{
                width: `${Math.min(100, (currentStreak / nextMilestone.days) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {/* Achieved milestones */}
      {currentMilestone && (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <span>{currentMilestone.icon}</span>
          <span className="text-gray-400">
            Achieved: <span className="text-amber-400 font-medium">{currentMilestone.label}</span>
          </span>
        </div>
      )}
    </div>
  )
}
