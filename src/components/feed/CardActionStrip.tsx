'use client'

/**
 * CardActionStrip — unified right-edge vertical action menu for feed cards
 *
 * Panel-feedback (May 2026 — 7th round). TikTok proved that a
 * right-edge vertical action strip is the highest-engagement
 * mobile-first action pattern for feed cards. Same actions on every
 * card type (text report, video report, phenomenon spotlight,
 * cluster card, on-this-day card) — reduces cognitive load and
 * keeps the feed feeling like one cohesive app.
 *
 * Actions (top to bottom):
 *   - Save (bookmark this card)
 *   - Thumbs up (more like this)
 *   - Thumbs down (less like this)
 *   - Share (native share or copy link)
 *
 * The strip floats absolute-positioned along the right edge of the
 * card so it doesn't compete with the card body. On larger screens
 * it stays right-aligned; on mobile it has a translucent backdrop
 * so it doesn't lose contrast over varied card backgrounds.
 *
 * SWC: var + function() form.
 */

import React, { useState } from 'react'
import { Bookmark, BookmarkCheck, ThumbsUp, ThumbsDown, Share2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface CardActionStripProps {
  /** Report ID (used for save + feedback APIs). */
  reportId?: string
  /** Whether this card is currently saved. */
  isSaved?: boolean
  /** Save toggle handler. */
  onSave?: (e: React.MouseEvent) => void
  /** Share handler — opens native share sheet or copies link. */
  onShare?: (e: React.MouseEvent) => void
  /** Called when an unauthed user attempts an action. */
  onUnauthed?: () => void
  /** Optional category hint for the thumbs feedback API. */
  category?: string | null
  /** Layout variant: 'overlay' floats over a video/image background
   *  with a backdrop blur for contrast. 'embedded' is the same
   *  vertical strip with no backdrop (for text cards on dark bg). */
  variant?: 'overlay' | 'embedded'
}

export default function CardActionStrip(props: CardActionStripProps) {
  var [thumbsVote, setThumbsVote] = useState<'up' | 'down' | null>(null)
  var [submitting, setSubmitting] = useState(false)

  async function submitThumbs(sentiment: 'positive' | 'negative', e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (submitting || !props.reportId) return

    var sessionResult = await supabase.auth.getSession()
    var session = sessionResult.data.session
    if (!session) {
      if (props.onUnauthed) props.onUnauthed()
      return
    }

    var newVote: 'up' | 'down' = sentiment === 'positive' ? 'up' : 'down'
    var optimistic: 'up' | 'down' | null = thumbsVote === newVote ? null : newVote
    setThumbsVote(optimistic)
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
      console.warn('[CardActionStrip] thumbs failed:', e?.message)
    } finally {
      setSubmitting(false)
    }
  }

  var variant = props.variant || 'embedded'
  var baseBtn = 'flex-shrink-0 inline-flex flex-col items-center justify-center w-11 h-11 rounded-full transition-colors '
  var btnIdle = variant === 'overlay'
    ? 'text-white/90 bg-black/40 backdrop-blur-sm hover:bg-black/60'
    : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'
  var btnActiveSave = variant === 'overlay'
    ? 'text-yellow-300 bg-black/40 backdrop-blur-sm'
    : 'text-yellow-300 bg-yellow-500/10'
  var btnActiveUp = variant === 'overlay'
    ? 'text-emerald-300 bg-black/40 backdrop-blur-sm'
    : 'text-emerald-300 bg-emerald-500/15'
  var btnActiveDown = variant === 'overlay'
    ? 'text-red-300 bg-black/40 backdrop-blur-sm'
    : 'text-red-300 bg-red-500/15'

  return (
    <div className="flex flex-col items-center gap-2.5">
      <button
        type="button"
        aria-label={props.isSaved ? 'Saved' : 'Save'}
        onClick={props.onSave}
        className={baseBtn + (props.isSaved ? btnActiveSave : btnIdle)}
      >
        {props.isSaved ? <BookmarkCheck className="w-5 h-5" /> : <Bookmark className="w-5 h-5" />}
      </button>
      <button
        type="button"
        aria-label="More like this"
        aria-pressed={thumbsVote === 'up'}
        onClick={function (e) { submitThumbs('positive', e) }}
        className={baseBtn + (thumbsVote === 'up' ? btnActiveUp : btnIdle)}
      >
        <ThumbsUp className="w-5 h-5" />
      </button>
      <button
        type="button"
        aria-label="Less like this"
        aria-pressed={thumbsVote === 'down'}
        onClick={function (e) { submitThumbs('negative', e) }}
        className={baseBtn + (thumbsVote === 'down' ? btnActiveDown : btnIdle)}
      >
        <ThumbsDown className="w-5 h-5" />
      </button>
      <button
        type="button"
        aria-label="Share"
        onClick={props.onShare}
        className={baseBtn + btnIdle}
      >
        <Share2 className="w-5 h-5" />
      </button>
    </div>
  )
}
