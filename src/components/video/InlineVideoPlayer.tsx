'use client'

/**
 * InlineVideoPlayer — lazy-loaded vertical video card for the feed
 *
 * Panel-feedback (May 2026), video pipeline Phase A.
 *
 * Renders a 9:16 video player that:
 *   - Stays as a thumbnail (no network load) until the user scrolls
 *     it into the viewport (IntersectionObserver).
 *   - Auto-plays muted on first viewport entry, with native controls
 *     after first tap.
 *   - Burns captions from transcript_segments via a generated WebVTT
 *     track when the segments are present.
 *
 * Why lazy + autoplay-muted: the Today feed can hold dozens of
 * cards. Loading every video at once eats Vercel egress and kills
 * mobile data plans. Autoplaying *muted* is the Stories/TikTok
 * convention and is allowed by browser autoplay policies (audio
 * autoplay is what's blocked).
 *
 * Props:
 *   reportId      — for analytics + signed URL fetch
 *   videoId       — report_videos.id (used for analytics)
 *   playbackUrl   — public/signed URL of the video file
 *   thumbnailUrl  — optional poster image; falls back to the
 *                   first-frame still that browsers generate
 *   segments      — optional Whisper word-level segments for
 *                   captions (Phase B)
 *
 * SWC: var + function() form.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'

interface TranscriptSegment {
  start: number   // seconds, float
  end: number
  text: string
  words?: Array<{ start: number; end: number; word: string }>
}

interface InlineVideoPlayerProps {
  reportId: string
  videoId?: string
  playbackUrl: string
  thumbnailUrl?: string | null
  segments?: TranscriptSegment[] | null
  /** Optional className applied to the outer wrapper. */
  className?: string
}

/**
 * Convert Whisper-shaped transcript segments to a WebVTT data URL.
 * Returns null when there are no segments.
 *
 * Phase B uses this for native browser caption rendering. The data:
 * URL approach keeps everything in-memory — no server round-trip
 * needed to serve the caption file.
 */
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
  var vtt = lines.join('\n')
  return 'data:text/vtt;charset=utf-8,' + encodeURIComponent(vtt)
}

export default function InlineVideoPlayer(props: InlineVideoPlayerProps) {
  var wrapperRef = useRef<HTMLDivElement | null>(null)
  var videoRef = useRef<HTMLVideoElement | null>(null)
  var [shouldLoad, setShouldLoad] = useState(false)
  var [hasPlayed, setHasPlayed] = useState(false)

  // Lazy-load gate. We don't even set <video src> until the player
  // is in the viewport, so the browser never starts a network
  // request for off-screen cards.
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
    }, { rootMargin: '200px' })
    io.observe(el)
    return function () { io.disconnect() }
  }, [shouldLoad])

  // Autoplay muted once loaded — Stories pattern. Some browsers
  // refuse autoplay if the user hasn't interacted yet; in that case
  // the player stays paused on the poster.
  useEffect(function () {
    if (!shouldLoad) return
    var v = videoRef.current
    if (!v) return
    v.play().then(function () { setHasPlayed(true) }).catch(function () { /* autoplay blocked */ })
  }, [shouldLoad])

  var vttUrl = useMemo(function () { return segmentsToVttDataUrl(props.segments) }, [props.segments])

  return (
    <div
      ref={wrapperRef}
      className={(props.className || '') + ' relative aspect-[9/16] w-full bg-black rounded-xl overflow-hidden'}
    >
      {shouldLoad ? (
        <video
          ref={videoRef}
          src={props.playbackUrl}
          poster={props.thumbnailUrl || undefined}
          className="w-full h-full object-cover"
          playsInline
          muted
          loop
          controls={hasPlayed}
          preload="metadata"
        >
          {vttUrl && (
            <track
              kind="captions"
              src={vttUrl}
              srcLang="en"
              label="Auto-generated"
              default
            />
          )}
        </video>
      ) : props.thumbnailUrl ? (
        <img src={props.thumbnailUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <div className="w-full h-full flex items-center justify-center text-gray-600 text-xs">
          Video preview
        </div>
      )}
      {/* Tap-to-unmute affordance once playing. The native controls
          eventually appear, but this hint exists for the brief
          autoplay-muted window. */}
      {hasPlayed && (
        <button
          type="button"
          onClick={function () {
            var v = videoRef.current
            if (!v) return
            v.muted = !v.muted
          }}
          aria-label="Toggle sound"
          className="absolute bottom-3 right-3 px-2 py-1 rounded-full bg-black/60 text-white text-[10px] uppercase tracking-wider hover:bg-black/80"
        >
          Tap for sound
        </button>
      )}
    </div>
  )
}
