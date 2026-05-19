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
}

type Vote = 'up' | 'down' | null

export default function ThumbsFeedback(props: ThumbsFeedbackProps) {
  var [vote, setVote] = useState<Vote>(null)
  var [submitting, setSubmitting] = useState(false)

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

  return (
    <div className={'inline-flex items-center gap-1 ' + (props.className || '')}>
      <button
        type="button"
        onClick={handleUp}
        aria-label="More like this"
        aria-pressed={vote === 'up'}
        className={
          'p-1.5 rounded-full transition-colors ' +
          (vote === 'up'
            ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
            : 'text-gray-400 hover:text-emerald-300 hover:bg-emerald-600/10 border border-transparent')
        }
      >
        <ThumbsUp className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={handleDown}
        aria-label="Less like this"
        aria-pressed={vote === 'down'}
        className={
          'p-1.5 rounded-full transition-colors ' +
          (vote === 'down'
            ? 'bg-red-600/30 text-red-200 border border-red-500/40'
            : 'text-gray-400 hover:text-red-300 hover:bg-red-600/10 border border-transparent')
        }
      >
        <ThumbsDown className="w-3.5 h-3.5" />
      </button>
    </div>
  )
}
