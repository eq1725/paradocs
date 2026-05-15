'use client'

/**
 * EndOfFeedCard — celebration / streak / suggestions card shown when the user
 * exhausts the Today feed.
 *
 * Pulls streak data from /api/user/streak (silent on failure for anonymous).
 * Shows:
 *   - Today's session count (cards seen)
 *   - Streak indicator ("4 days in a row exploring")
 *   - Three outbound CTAs: Browse / Map / Submit
 *
 * Visual language: warm, dossier-adjacent (uses .today-streak-glow).
 *
 * SWC: var, function expressions, string concat only.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Compass, Map as MapIcon, PenLine } from 'lucide-react'

interface StreakData {
  current_streak: number
  longest_streak: number
  total_active_days: number
}

export function EndOfFeedCard(props: {
  cardsSeen: number
  user: any
}) {
  var [streak, setStreak] = useState<StreakData | null>(null)

  useEffect(function () {
    if (!props.user?.id) return
    var aborted = false
    fetch('/api/user/streak')
      .then(function (res) { return res.ok ? res.json() : null })
      .then(function (data) {
        if (aborted) return
        if (data && data.streak) setStreak(data.streak)
      })
      .catch(function () {})
    return function () { aborted = true }
  }, [props.user?.id])

  var streakLabel = ''
  if (streak && streak.current_streak > 1) {
    streakLabel = streak.current_streak + ' day streak'
  } else if (streak && streak.current_streak === 1) {
    streakLabel = 'Day 1'
  }

  return (
    <div
      className="flex flex-col gap-6 h-full font-sans items-center justify-center text-center px-2"
      role="article"
      aria-label="End of Today's feed"
    >
      {/* Hero glyph */}
      <div className="text-5xl md:text-6xl mb-2" aria-hidden="true">{'✦'}</div>

      <div>
        <h2 className="text-2xl md:text-3xl font-display font-bold text-white leading-tight mb-2">
          That's Today.
        </h2>
        <p className="text-sm md:text-base text-gray-400 font-sans max-w-sm mx-auto">
          {props.cardsSeen > 0
            ? 'You moved through ' + props.cardsSeen + ' case' + (props.cardsSeen === 1 ? '' : 's') + ' tonight. Fresh dossiers tomorrow.'
            : 'Come back tomorrow for fresh dossiers.'}
        </p>
      </div>

      {/* Streak chip */}
      {streakLabel && (
        <div
          className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary-500/10 border border-primary-500/30 text-primary-300 text-xs font-sans font-medium today-streak-glow"
        >
          <span aria-hidden="true">{'◉'}</span>
          {streakLabel}
        </div>
      )}

      {/* Outbound CTAs */}
      <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
        <Link
          href="/explore"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-sans font-medium text-gray-200"
        >
          <Compass className="w-4 h-4" />
          Browse
        </Link>
        <Link
          href="/map"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors text-sm font-sans font-medium text-gray-200"
        >
          <MapIcon className="w-4 h-4" />
          Map
        </Link>
        <Link
          href="/start"
          className="flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-lg bg-primary-600/20 border border-primary-500/40 hover:bg-primary-600/30 transition-colors text-sm font-sans font-medium text-primary-200"
        >
          <PenLine className="w-4 h-4" />
          Submit yours
        </Link>
      </div>

      {streak && streak.longest_streak > 1 && (
        <p className="text-[11px] text-gray-600 font-sans">
          {'Longest streak: ' + streak.longest_streak + ' days  ·  Total active: ' + streak.total_active_days}
        </p>
      )}
    </div>
  )
}

export default EndOfFeedCard
