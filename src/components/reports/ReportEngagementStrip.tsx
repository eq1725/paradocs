'use client'

/**
 * ReportEngagementStrip — V10.5
 *
 * Quiet horizontal strip below the meta block. Surfaces social
 * proof + commitment indicators for mass-market readers:
 *
 *   1.2K viewed · 89 saved · 12 in discussion · 3 min read
 *
 * Per the panel review, casual readers decide whether to commit
 * to a page based on evidence of life and effort signals. Pre-
 * V10.5 the report page showed none of these — felt like a
 * static document.
 *
 * Read-time is computed from narrative word count at 200 wpm
 * (median adult reading speed). Rounded up to the nearest min;
 * minimum "1 min read" so we never tell a user "0 min read".
 */

import React from 'react'
import { Eye, Bookmark, MessageSquare, Clock } from 'lucide-react'

export interface ReportEngagementStripProps {
  viewCount?: number | null
  savedCount?: number | null
  commentCount?: number | null
  /** Words to estimate read time from. Pass the narrative + any other prose visible above-fold. */
  readTimeWords?: number | null
  /**
   * V10.7.E.10 — when present, replace the 'X min read' chip with a
   * video-duration chip (e.g. '0:27 video'). Pass total seconds.
   * The read-time chip is misleading on a video report — the primary
   * artifact is the video, not the prose.
   */
  videoDurationSec?: number | null
  className?: string
}

export default function ReportEngagementStrip({
  viewCount,
  savedCount,
  commentCount,
  readTimeWords,
  videoDurationSec,
  className,
}: ReportEngagementStripProps) {
  const items: Array<{ icon: any; text: string; tint: string }> = []

  const v = typeof viewCount === 'number' ? viewCount : null
  const s = typeof savedCount === 'number' ? savedCount : null
  const c = typeof commentCount === 'number' ? commentCount : null
  const w = typeof readTimeWords === 'number' && readTimeWords > 0 ? readTimeWords : null
  const vd = typeof videoDurationSec === 'number' && videoDurationSec > 0 ? videoDurationSec : null

  if (v !== null && v > 0) items.push({ icon: Eye, text: formatCount(v) + ' viewed', tint: 'text-gray-300' })
  if (s !== null && s > 0) items.push({ icon: Bookmark, text: formatCount(s) + ' saved', tint: 'text-purple-300/90' })
  if (c !== null && c > 0) items.push({ icon: MessageSquare, text: formatCount(c) + (c === 1 ? ' comment' : ' comments'), tint: 'text-cyan-300/90' })
  // V10.7.E.10 — video duration takes precedence over read-time on
  // video reports. A 'X min read' chip on a 27-second selfie video
  // misframes the primary artifact.
  if (vd !== null) {
    const dm = Math.floor(vd / 60)
    const ds = Math.floor(vd % 60)
    const dStr = dm + ':' + (ds < 10 ? '0' + ds : ds)
    items.push({ icon: Clock, text: dStr + ' video', tint: 'text-gray-400' })
  } else if (w !== null) {
    const mins = Math.max(1, Math.ceil(w / 200))
    items.push({ icon: Clock, text: mins + ' min read', tint: 'text-gray-400' })
  }

  if (items.length === 0) return null

  return (
    <div
      className={
        'flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-gray-400 ' +
        (className || '')
      }
      aria-label="Engagement"
    >
      {items.map((it, i) => {
        const Icon = it.icon
        return (
          <React.Fragment key={i}>
            <span className={'inline-flex items-center gap-1 ' + it.tint}>
              <Icon className="w-3 h-3" />
              <span className="tabular-nums">{it.text}</span>
            </span>
            {i < items.length - 1 && <span className="text-gray-700" aria-hidden>·</span>}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function formatCount(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10000) return (Math.round(n / 100) / 10).toFixed(1).replace(/\.0$/, '') + 'K'
  if (n < 1000000) return Math.round(n / 1000) + 'K'
  return (Math.round(n / 100000) / 10).toFixed(1).replace(/\.0$/, '') + 'M'
}
