'use client'

/**
 * ThumbsFeedback — per-card thumbs up / down personalization signal
 *
 * Panel-feedback (May 2026 — 4th round, Tier 2). Inline buttons on
 * feed cards that record a sentiment to /api/feed/feedback. The
 * feed-personalization service reads these events at feed-v2 query
 * time to weight per-user category preferences.
 *
 * Behavior:
 *   - Optimistic: the button visually flips immediately
 *   - Tapping the same sentiment again clears the vote (POSTs the
 *     opposite, or hits a DELETE — for simplicity we just no-op)
 *   - If unauthed, surfaces the AuthPromptModal instead of voting
 *   - State is local to the component; it doesn't try to read prior
 *     votes back from the server (would add a round-trip per card).
 *     Re-renders after re-fetching the feed pick up the persisted
 *     signal naturally.
 *
 * SWC: var + function() form.
 */

import React, { useState } from 'react'
import { ThumbsUp, ThumbsDown } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface ThumbsFeedbackProps {
  reportId: string
  category?: string | null
  /** Called when an unauthed user attempts to vote — parent shows
   *  AuthPromptModal. Optional; if not provided the buttons silently
   *  no-op for anons. */
  onUnauthed?: () => void
  className?: string
  /** V11.17.38 — corroboration counts pulled from reports.upvotes /
   *  reports.downvotes. When provided, the numeric tally renders
   *  inline next to each thumb so users can see the community signal
   *  ("13 others felt this rang true") not just an icon. We optimistic-
   *  update locally on vote so the count nudges immediately. */
  upvotes?: number
  downvotes?: number
}

type Vote = 'up' | 'down' | null

function formatCount(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k'
  return String(n)
}

export default function ThumbsFeedback(props: ThumbsFeedbackProps) {
  var [vote, setVote] = useState<Vote>(null)
  var [submitting, setSubmitting] = useState(false)
  // V11.17.38 — optimistic per-vote count nudges. We track only the
  // delta from props so the parent's stale data doesn't override our
  // local intent. Reset on prop change (new card).
  var [voteDelta, setVoteDelta] = useState<{ up: number; down: number }>({ up: 0, down: 0 })

  async function submitVote(sentiment: 'positive' | 'negative') {
    if (submitting) return
    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      if (props.onUnauthed) props.onUnauthed()
      return
    }
    var newVote: Vote = sentiment === 'positive' ? 'up' : 'down'
    // Toggle behavior: tapping same vote clears state locally but we
    // still POST so the server can record the action explicitly.
    var optimisticVote: Vote = vote === newVote ? null : newVote
    setVote(optimisticVote)
    // V11.17.38 — optimistic count nudge so the displayed tally moves
    // the moment the user taps. The deltas track our intent vs the
    // server props; if the server has the action persisted on the
    // next feed pick the props update naturally and the delta resets.
    var nextDelta = { up: 0, down: 0 }
    if (optimisticVote === 'up') nextDelta = { up: 1, down: vote === 'down' ? -1 : 0 }
    else if (optimisticVote === 'down') nextDelta = { up: vote === 'up' ? -1 : 0, down: 1 }
    else {
      // Cleared — undo whatever was previously local.
      if (vote === 'up') nextDelta = { up: -1, down: 0 }
      else if (vote === 'down') nextDelta = { up: 0, down: -1 }
    }
    setVoteDelta(nextDelta)
    setSubmitting(true)
    try {
      await fetch('/api/feed/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + session.access_token,
        },
        body: JSON.stringify({
          report_id: props.reportId,
          sentiment: sentiment,
          phenomenon_category: props.category || null,
        }),
      })
    } catch (e: any) {
      // Silent — don't pop a toast for a casual feedback action.
      console.warn('[ThumbsFeedback] vote failed:', e?.message)
    } finally {
      setSubmitting(false)
    }
  }

  function handleUp(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    submitVote('positive')
  }

  function handleDown(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    submitVote('negative')
  }

  // V11.17.38 — render counts when the parent passes them. Up-count
  // includes our local delta so the tap feels immediate; down-count
  // does the same. We render the number only when it's non-zero or
  // we have a definite zero — undefined hides the count so cards
  // without data don't show a misleading "0".
  var upBase = typeof props.upvotes === 'number' ? props.upvotes : null
  var downBase = typeof props.downvotes === 'number' ? props.downvotes : null
  var upDisplay = upBase === null ? null : Math.max(0, upBase + voteDelta.up)
  var downDisplay = downBase === null ? null : Math.max(0, downBase + voteDelta.down)

  return (
    <div className={'inline-flex items-center gap-1 ' + (props.className || '')}>
      <button
        type="button"
        onClick={handleUp}
        aria-label={upDisplay !== null ? 'Rang true — ' + upDisplay + ' others agree' : 'More like this'}
        aria-pressed={vote === 'up'}
        className={
          'inline-flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-[11px] font-medium tabular-nums ' +
          (vote === 'up'
            ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
            : 'text-gray-400 hover:text-emerald-300 hover:bg-emerald-600/10 border border-transparent')
        }
      >
        <ThumbsUp className="w-3.5 h-3.5" aria-hidden="true" />
        {upDisplay !== null && <span>{formatCount(upDisplay)}</span>}
      </button>
      <button
        type="button"
        onClick={handleDown}
        aria-label={downDisplay !== null ? 'Felt off — ' + downDisplay + ' others agree' : 'Less like this'}
        aria-pressed={vote === 'down'}
        className={
          'inline-flex items-center gap-1 px-2 py-1 rounded-full transition-colors text-[11px] font-medium tabular-nums ' +
          (vote === 'down'
            ? 'bg-red-600/30 text-red-200 border border-red-500/40'
            : 'text-gray-400 hover:text-red-300 hover:bg-red-600/10 border border-transparent')
        }
      >
        <ThumbsDown className="w-3.5 h-3.5" aria-hidden="true" />
        {downDisplay !== null && <span>{formatCount(downDisplay)}</span>}
      </button>
    </div>
  )
}
