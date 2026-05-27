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
import { Volume2, VolumeX, FileText, MapPin, Calendar, Captions, CaptionsOff } from 'lucide-react'
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

// V10.7.E.4 — dropped the WebVTT data-URL helper. Native browser
// captions rendered at the bottom of the <video> element, which on
// mobile sits right where the bottom tab bar sits — the second line
// got eaten by the nav. We now render our own caption overlay div
// positioned above the title block (see findCurrentSegment + the
// JSX below). Custom rendering also gives us font/contrast control
// the native cue rendering doesn't.

export default function VideoReportCard(props: VideoReportCardProps) {
  var router = useRouter()
  var item = props.item
  var video = item.video
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var categoryLabel = config?.label || item.category

  var wrapperRef = useRef<HTMLDivElement | null>(null)
  var videoRef = useRef<HTMLVideoElement | null>(null)
  var [shouldLoad, setShouldLoad] = useState(false)
  // V10.7.E.14 — initial mute state is persisted across cards. Once
  // the user unmutes ANY card (via tap-to-mute toggle or the corner
  // button) we set localStorage 'paradocs.feed_sound_on'=1 and all
  // future cards mount with muted=false. First card is forced muted
  // because browser autoplay policy blocks audio without a prior
  // user gesture; the .play().catch() fallback below also flips back
  // to muted if the browser blocks an unmuted autoplay.
  var [muted, setMuted] = useState<boolean>(function () {
    if (typeof window === 'undefined') return true
    try {
      var stored = window.localStorage.getItem('paradocs.feed_sound_on')
      return stored === '1' ? false : true
    } catch (_) { return true }
  })
  var [hasPlayed, setHasPlayed] = useState(false)
  var [captionText, setCaptionText] = useState('')
  // V10.7.E.6 — CC toggle. Persisted to localStorage so the choice
  // sticks across cards and sessions. Defaults to ON because the
  // feed autoplays muted and captions are the only way the viewer
  // can follow the witness's account until they tap to unmute.
  var [ccEnabled, setCcEnabled] = useState<boolean>(function () {
    if (typeof window === 'undefined') return true
    try {
      var stored = window.localStorage.getItem('paradocs.cc_enabled')
      if (stored === '0') return false
      return true
    } catch (_) { return true }
  })

  // V10.7.E.12 — pre-warm load policy for instant-feel playback.
  //
  // TikTok-quality "tap → frame in the first paint" depends on the
  // first segment of video bytes ALREADY being in the browser cache
  // by the time the user lands on the card. The previous gate
  // (IntersectionObserver, rootMargin 300px) waited until the card
  // was 300px from the viewport before even setting <video src>;
  // that means the user sees the poster then waits 1-3s while the
  // browser does DNS → TLS → range request → first segment download
  // before playback can start.
  //
  // New policy:
  //   - The ACTIVE card (props.isActive) gets shouldLoad=true
  //     IMMEDIATELY on mount — no IntersectionObserver gate.
  //     The first card the user sees on /discover starts downloading
  //     its first segment as the page mounts.
  //   - The first card in the feed (index === 0) ditto, even if it
  //     hasn't been marked active yet by the scroll snap logic.
  //   - All other cards keep the lazy gate with a wider 600px
  //     rootMargin so cards 1 ahead in the scroll direction pre-
  //     warm before the user reaches them.
  useEffect(function () {
    if (shouldLoad) return
    if (props.isActive || props.index === 0) {
      setShouldLoad(true)
      return
    }
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
    }, { rootMargin: '600px' })
    io.observe(el)
    return function () { io.disconnect() }
  }, [shouldLoad, props.isActive, props.index])

  // V11.17.39 — hls.js attachment for Mux HLS streams on non-Safari.
  // Safari can play .m3u8 natively (canPlayType returns truthy); for
  // every other browser we dynamic-import hls.js and attach it. The
  // lib is ~120kb gzipped — we only load when we actually need it
  // (i.e., when a Mux-served video card becomes shouldLoad), so the
  // feed bundle stays lean for users who only see photo/text reports.
  useEffect(function () {
    if (!shouldLoad) return
    var el = videoRef.current
    if (!el) return
    var url = (props.item as any)?.video?.playback_url
    if (typeof url !== 'string' || url.indexOf('.m3u8') < 0) return
    // Safari path — native HLS, src already set declaratively above.
    var nativeHls = !!(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'))
    if (nativeHls) return

    var destroyed = false
    var hlsInstance: any = null
    ;(async function () {
      try {
        var mod = await import('hls.js')
        var Hls: any = mod.default || mod
        if (destroyed) return
        if (!Hls.isSupported || !Hls.isSupported()) {
          // Last-ditch: try setting src and let the browser figure it out.
          el!.src = url
          return
        }
        hlsInstance = new Hls({
          // Tight buffer for feed-scroll: we don't need 30s of lookahead
          // for a 1-2min clip. Keeps memory + cellular bytes lean.
          maxBufferLength: 10,
          maxMaxBufferLength: 30,
          // Pick a sensible starting bitrate vs always topping out.
          startLevel: -1, // 'auto'
        })
        hlsInstance.loadSource(url)
        hlsInstance.attachMedia(el!)
      } catch (e: any) {
        console.warn('[VideoReportCard] hls.js load failed:', e?.message || e)
      }
    })()
    return function () {
      destroyed = true
      try { hlsInstance && hlsInstance.destroy && hlsInstance.destroy() } catch (_e) {}
    }
  }, [shouldLoad, props.item])

  // V10.7.E.14 — autoplay with sound-when-possible.
  //   - If muted=false (the user previously unmuted and we persisted
  //     the preference), TRY unmuted autoplay first. If the browser
  //     blocks it (no prior user gesture this session), .play()
  //     rejects; we fall back to muted autoplay so playback still
  //     starts, and surface the muted state so the corner toggle
  //     shows "unmute" again.
  //   - If muted=true, normal muted autoplay (Stories convention).
  useEffect(function () {
    if (!shouldLoad) return
    var el = videoRef.current
    if (!el) return
    var vEl = el
    vEl.muted = muted
    vEl.play().then(function () { setHasPlayed(true) }).catch(function () {
      // Autoplay blocked — most common cause is muted=false with no
      // user gesture yet. Force-mute and retry; the corner toggle
      // will show 🔇 so the user can re-enable sound with a tap.
      if (!vEl.muted) {
        vEl.muted = true
        setMuted(true)
        vEl.play().then(function () { setHasPlayed(true) }).catch(function () { /* give up */ })
      }
    })
  }, [shouldLoad])

  // V10.7.E.4 — drive captions ourselves so we can position them
  // safely above the title overlay (and the mobile bottom nav).
  // Track the current segment via the video's timeupdate event and
  // expose it as state for the overlay JSX. Cleared when the video
  // pauses or there's no matching segment.
  useEffect(function () {
    if (!shouldLoad) return
    var el = videoRef.current
    if (!el) return
    var segs: TranscriptSegment[] = (video?.segments as any) || []
    if (!segs || segs.length === 0) return
    var vEl = el
    function onTime() {
      var t = vEl.currentTime
      // Linear scan is fine — typical transcript has <100 segments.
      for (var i = 0; i < segs.length; i++) {
        if (t >= segs[i].start && t < segs[i].end) {
          var txt = (segs[i].text || '').trim()
          setCaptionText(txt)
          return
        }
      }
      setCaptionText('')
    }
    vEl.addEventListener('timeupdate', onTime)
    vEl.addEventListener('seeked', onTime)
    return function () {
      vEl.removeEventListener('timeupdate', onTime)
      vEl.removeEventListener('seeked', onTime)
    }
  }, [shouldLoad, video])

  function toggleMute(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    var v = videoRef.current
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    // V10.7.E.14 — persist the choice so the NEXT card the user
    // scrolls to mounts with the same audio state. Without this
    // every new card defaults back to muted and the user has to
    // tap-unmute over and over.
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('paradocs.feed_sound_on', v.muted ? '0' : '1')
      }
    } catch (_) { /* localStorage unavailable — non-fatal */ }
  }

  function toggleCc(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    var next = !ccEnabled
    setCcEnabled(next)
    try {
      if (typeof window !== 'undefined') {
        window.localStorage.setItem('paradocs.cc_enabled', next ? '1' : '0')
      }
    } catch (_) { /* localStorage unavailable — fine */ }
  }

  var locationStr = formatLocationLabel(item, { maxParts: 2 }) || ''
  var yearMatch = item.event_date ? item.event_date.match(/\d{4}/) : null
  var year = yearMatch ? yearMatch[0] : ''

  if (!video || !video.playback_url) return null

  // V10.7.E.16 — even with `poster` set on the <video> element, some
  // browsers (notably Safari iOS) paint the video element's black
  // background BEFORE fetching the poster image, producing a flash
  // of black on first paint. Render the poster as a sibling absolute-
  // positioned <img> behind the video so the browser starts the
  // image fetch immediately on mount and the poster paints as soon
  // as the bytes arrive — regardless of when the video element
  // decides to render its own native poster. The <video>'s object-
  // cover overlay obscures the <img> once playback begins.
  var posterUrl: string | null = (video as any).poster_url || null

  return (
    <article
      ref={wrapperRef}
      role="article"
      aria-label={'Video report: ' + (item.title || 'Untitled')}
      className="relative w-full overflow-hidden rounded-2xl bg-black shadow-lg"
      style={{ aspectRatio: '9 / 16', maxHeight: '85vh' }}
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          aria-hidden="true"
          className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          loading="eager"
          decoding="async"
        />
      )}
      {shouldLoad ? (
        <video
          ref={videoRef}
          // V11.17.39 — Mux HLS playback. When playback_url ends in
          // .m3u8 (served from stream.mux.com), Safari plays natively
          // but Chrome/Firefox/Edge need hls.js to attach a MediaSource.
          // The useEffect below handles the detection + lazy-loads
          // hls.js when needed. We DON'T set src on the element for
          // HLS — the lib attaches its own. For MP4 / Supabase signed
          // URLs the src prop is set the old way.
          src={(function () {
            var url = (video as any).playback_url as string
            if (typeof url !== 'string') return url
            // Safari natively plays HLS — set src directly.
            if (url.indexOf('.m3u8') >= 0 && typeof window !== 'undefined') {
              var nativeHls = !!(document.createElement('video').canPlayType('application/vnd.apple.mpegurl'))
              if (nativeHls) return url
              // Non-Safari: don't set src; useEffect below mounts hls.js
              return undefined as any
            }
            return url
          })()}
          // V10.7.E.7 — first-paint thumbnail. The poster JPEG was
          // captured client-side at submit and uploaded as a sibling
          // file to the video. feed-v2 signs both URLs in parallel.
          // With a poster set the browser paints the thumbnail
          // INSTANTLY (before any video bytes load), instead of a
          // black square while the first frame buffers.
          poster={(video as any).poster_url || undefined}
          className="absolute inset-0 w-full h-full object-cover"
          playsInline
          muted={muted}
          loop
          // V10.7.E.7 — preload tuning. Only the active feed card
          // gets the full preload="auto" (browser eagerly fetches
          // bytes for instant playback). Off-screen / out-of-focus
          // cards get preload="metadata" — browser just grabs the
          // header so it knows duration + dimensions for the poster,
          // skipping multi-MB body downloads for cards the user may
          // never reach. Browsers don't always honour preload=metadata
          // perfectly, but on Safari iOS it noticeably cuts cellular
          // bytes on long feed scrolls.
          preload={props.isActive ? 'auto' : 'metadata'}
          controlsList="nodownload nofullscreen"
          disablePictureInPicture
          // V10.7.E.3 — tap the video surface to toggle mute. iOS
          // doesn't let web pages intercept hardware volume buttons,
          // and most first-time users won't notice the small corner
          // toggle. TikTok / Reels both use tap-anywhere-on-video as
          // the canonical unmute affordance.
          onClick={toggleMute}
        />

      ) : !posterUrl ? (
        // No poster, no video loaded yet — show a quiet loading state.
        // (The poster-as-background <img> above already handles the
        // "we have a poster" case, painting INSTANTLY before this
        // branch could ever fire.)
        <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-xs">
          Loading…
        </div>
      ) : null}

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

      {/* Top-right: sound + CC toggles */}
      {hasPlayed && (
        <div className="absolute top-3 right-3 flex items-center gap-2">
          {/* CC toggle — only shown when we actually have a transcript
              to display. localStorage-backed so the choice persists. */}
          {video.segments && (video.segments as any).length > 0 && (
            <button
              type="button"
              onClick={toggleCc}
              aria-label={ccEnabled ? 'Hide captions' : 'Show captions'}
              aria-pressed={ccEnabled}
              className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
            >
              {ccEnabled ? <Captions className="w-4 h-4" /> : <CaptionsOff className="w-4 h-4" />}
            </button>
          )}
          <button
            type="button"
            onClick={toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'}
            className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-black/50 backdrop-blur-sm text-white hover:bg-black/70 transition-colors"
          >
            {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
        </div>
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
        {/* V10.7.E.5 — captions live INSIDE the bottom overlay, just
            above the title block. Round 6's bottom-32 absolute
            position landed in the middle of the title (Chase saw the
            caption text superimposed over "Black Triangular UFO Over
            Childhood Home"). Keeping the caption inside the Link's
            content flow means it ALWAYS sits cleanly above the
            title regardless of viewport size, the title block pushes
            down naturally when caption text is present, and the
            existing gradient scrim already provides legibility. */}
        {ccEnabled && captionText && (
          <div aria-live="polite" className="mb-3 flex justify-start">
            <span
              className="inline-block max-w-full text-white text-[15px] sm:text-base font-medium leading-snug px-3 py-1.5 rounded-md"
              style={{ background: 'rgba(0,0,0,0.62)', textShadow: '0 1px 2px rgba(0,0,0,0.85)' }}
            >
              {captionText}
            </span>
          </div>
        )}
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
