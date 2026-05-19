'use client'

/**
 * VideoReportCard — TikTok-style full-bleed vertical video card
 *
 * Panel-feedback (May 2026 — 7th round). When a report has an
 * approved user-submitted video (has_video=true + signed playback
 * URL on the feed payload), render a dedicated full-bleed vertical
 * video card instead of inline-embedding the player above a text
 * card. TikTok / Instagram Reels established this format as the
 * winning UX for short first-person video.
 *
 * Layout:
 *   ┌────────────────────────────┐
 *   │                       [S]  │  ← right-edge action strip
 *   │      9:16 video           │     (CardActionStrip overlay)
 *   │      (autoplay muted)     │
 *   │                       [👍]│
 *   │                            │
 *   │                       [👎]│
 *   │ ╔════════════════════════╗ │
 *   │ ║ CATEGORY · LOCATION    ║ │  ← bottom gradient scrim
 *   │ ║ Title in 18-20pt bold  ║ │     with title + meta
 *   │ ║ Tap for sound  · 27s   ║ │
 *   │ ╚════════════════════════╝ │
 *   └────────────────────────────┘
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import { Volume2, VolumeX, FileText, MapPin, Calendar } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { formatLocationLabel } from '@/lib/format/location-label'
import CategoryIcon from '@/components/ui/CategoryIcon'
import type { PhenomenonCategory } from '@/lib/database.types'
import CardActionStrip from '@/components/feed/CardActionStrip'
import type { ReportItem } from './DiscoverCards'

interface VideoReportCardProps {
  item: ReportItem
  index: number
  isActive: boolean
  expanded: boolean
  onExpand: () => void
  onCollapse?: () => void
  user: any
  onShowSignup: (show: boolean) => void
  isSaved?: boolean
  onSave?: () => void
  onShare?: () => void
}

interface TranscriptSegment {
  start: number
  end: number
  text: string
}

function segmentsToVttDataUrl(segments: TranscriptSegment[] | null | undefined): string | null {
  if (!segments || segments.length === 0) return null
  function formatTs(sec: number): string {
    var h = Math.floor(sec / 3600)
    var m = Math.floor((sec % 3600) / 60)
    var s = Math.floor(sec % 60)
    var ms = Math.floor((sec - Math.floor(sec)) * 1000)
    var pad = function (n: number, w: number) { return String(n).padStart(w, '0') }
    return pad(h, 2) + ':' + pad(m, 2) + ':' + pad(s, 2) + '.' + pad(ms, 3)
  }
  var lines: string[] = ['WEBVTT', '']
  for (var i = 0; i < segments.length; i++) {
    var seg = segments[i]
    lines.push(String(i + 1))
    lines.push(formatTs(seg.start) + ' --> ' + formatTs(seg.end))
    lines.push((seg.text || '').replace(/-->/g, '→').trim())
    lines.push('')
  }
  return 'data:text/vtt;charset=utf-8,' + encodeURIComponent(lines.join('\n'))
}

export default function VideoReportCard(props: VideoReportCardProps) {
  var router = useRouter()
  var item = props.item
  var video = item.video
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var categoryLabel = config?.label || item.category

  var wrapperRef = useRef<HTMLDivElement | null>(null)
  var videoRef = useRef<HTMLVideoElement | null>(null)
  var [shouldLoad, setShouldLoad] = useState(false)
  var [muted, setMuted] = useState(true)
  var [hasPlayed, setHasPlayed] = useState(false)

  // Lazy-load when scrolled into view.
  useEffect(function () {
    if (shouldLoad) return
    if (typeof IntersectionObserver === 'undefined') {
      setShouldLoad(true)
      return
    }
    var el = wrapperRef.current
    if (!el) return
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) {
          setShouldLoad(true)
          io.disconnect()
          return
        }
      }
    }, { rootMargin: '300px' })
    io.observe(el)
    return function () { io.disconnect() }
  }, [shouldLoad])

  // Autoplay muted on load.
  useEffect(function () {
    if (!shouldLoad) return
    var v = videoRef.current
    if (!v) return
    v.play().then(function () { setHasPlayed(true) }).catch(function () {})
  }, [shouldLoad])

  function toggleMute(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    var v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
  }

  var locationStr = formatLocationLabel(item, { maxParts: 2 }) || ''
  var yearMatch = item.event_date ? item.event_date.match(/\d{4}/) : null
  var year = yearMatch ? yearMatch[0] : ''

  var vttUrl = segmentsToVttDataUrl(video?.segments as any || null)

  if (!video || !video.playback_url) return null

  return (
    <article
      ref={wrapperRef}
      role="article"
      aria-label={'Video report: ' + (item.title || 'Untitled')}
      className="relative w-full overflow-hidden rounded-2xl bg-black shadow-lg"
      style={{ aspectRatio: '9 / 16', maxHeight: '85vh' }}
    >
      {shouldLoad ? (
        <video
          ref={videoRef}
          src={video.playback_url}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted={muted}
          loop
          preload="auto"
          controlsList="nodownload nofullscreen"
          disablePictureInPicture
          // V10.7.E.3 — tap the video surface to toggle mute. iOS
          // doesn't let web pages intercept hardware volume buttons,
          // and most first-time users won't notice the small corner
          // toggle. TikTok / Reels both use tap-anywhere-on-video as
          // the canonical unmute affordance.
          onClick={toggleMute}
        >
          {vttUrl && (
            <track kind="captions" src={vttUrl} srcLang="en" label="Auto-generated" default />
          )}
        </video>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
          Loading…
        </div>
      )}

      {/* Bottom gradient scrim for text legibility */}
      <div
        className="absolute inset-x-0 bottom-0 h-2/5 pointer-events-none"
        style={{ background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)' }}
      />

      {/* Top gradient — keeps badges readable when video is bright */}
      <div
        className="absolute inset-x-0 top-0 h-24 pointer-events-none"
        style={{ background: 'linear-gradient(to bottom, rgba(0,0,0,0.5) 0%, transparent 100%)' }}
      />

      {/* Top-left badge: category · year · location */}
      <div className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/50 backdrop-blur-sm text-white">
        <CategoryIcon category={item.category as PhenomenonCategory} size={12} />
        <span className="text-[10px] font-semibold uppercase tracking-widest">
          {[categoryLabel, year, locationStr].filter(Boolean).join(' · ')}
        </span>
      </div>

      {/* Top-right: sound toggle */}
      {hasPlayed && (
        <button
          type="button"
          onClick={toggleMute}
          aria-label={muted ? 'Unmute' : 'Mute'}
          className="absolute top-3 right-3 inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      )}

      {/* Right-edge action strip — TikTok pattern */}
      <div className="absolute right-2 top-1/2 -translate-y-1/2 z-10">
        <CardActionStrip
          reportId={item.id}
          isSaved={props.isSaved}
          onSave={function (e) {
            e.preventDefault()
            e.stopPropagation()
            if (!props.user) { props.onShowSignup(true); return }
            if (props.onSave) props.onSave()
          }}
          onShare={function (e) {
            e.preventDefault()
            e.stopPropagation()
            if (props.onShare) props.onShare()
          }}
          onUnauthed={function () { props.onShowSignup(true) }}
          category={item.category}
          variant="overlay"
        />
      </div>

      {/* Bottom overlay — title, meta, CTA.
          V10.7.E.3 — three changes vs. the panel-feedback v7 version:
            (a) the entire overlay is wrapped in a Link, so a tap
                anywhere in the title/hook/meta region opens the
                report. Previously only the tiny "Read full account →"
                link was tappable, which fell under the bottom nav on
                mobile and the user couldn't reach it without swiping
                to the next card.
            (b) pb-24 (rather than p-4) reserves ~96px of bottom
                padding so the title/hook/CTA clears the bottom tab
                bar even on iOS Safari with its dynamic toolbars.
            (c) The "Read full account →" affordance stays as a visual
                hint, but it's no longer the only tap target. */}
      <Link
        href={'/report/' + item.slug}
        onClick={function (e) { e.stopPropagation() }}
        className="absolute inset-x-0 bottom-0 block p-4 pr-16 pb-24 group"
        aria-label={'Read full report: ' + (item.title || 'Untitled')}
      >
        <h3 className="text-white text-lg sm:text-xl font-display font-bold leading-tight drop-shadow-lg">
          {item.title || 'Untitled'}
        </h3>
        {item.feed_hook && (
          <p className="text-white/85 text-sm mt-1 line-clamp-2 drop-shadow">
            {item.feed_hook}
          </p>
        )}
        <div className="mt-2 flex items-center gap-3 text-[11px] text-white/70">
          {locationStr && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {locationStr}
            </span>
          )}
          {year && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {year}
            </span>
          )}
        </div>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-white/95 group-hover:text-white">
          <FileText className="w-3.5 h-3.5" />
          Read full account →
        </span>
      </Link>
    </article>
  )
}
