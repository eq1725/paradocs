'use client'

// V11.17.78 - submission card upgrade
//
// Tier 1 of the My Record submission display upgrade per
// docs/MY_RECORD_SUBMISSIONS_PANEL.md. Three additive elements land on
// the focused dossier card:
//
//   A) Video poster above the prose body (when has_photo_video / video
//      data is present). 16:9, center play button, duration badge,
//      tap-to-expand in-place into <InlineVideoPlayer mode="watch" />.
//      The prose body (synthesized paragraph + verbatim excerpt) is
//      preserved below the poster.
//   B) "Read the full report" CTA in the card footer. Uses next/link
//      so /lab → /report → back keeps the journaling-app return loop
//      intact. Mobile tap target ≥44px high.
//   C) Ownership chrome at the top of the card: "Documented by you ·
//      {date}" eyebrow + status pill (Published / Pending review /
//      Archived) + <DiscoverabilityToggle /> next to the existing
//      identity chrome.
//
// Mobile-first: card never overflows narrow viewports; eyebrow + pill
// wrap to a second row at <640px; poster maintains 16:9; play overlay
// and CTA both ≥44×44 tap targets.
//
// V11.17.69 - Tier 2B
//
// DossierHeader — the persistent header at the top of My Record per
// LAB_PANEL_REVIEW_V3 §3 + V2 §2 scaling-tiers spec.
//
// n-aware rendering:
//   - n=0: ghosted dossier (EmptyDossier) + onboarding CTA.
//   - n=1: full-bleed dossier of the single experience. GOLD STANDARD
//     per V3 §3 — synthesized paragraph + verbatim account + dossier
//     fact row.
//   - n=2-4: experience strip (horizontal pills, tap to focus) above
//     the focused-experience dossier card. Plus an "Add another"
//     pill BELOW per the panel's mass-market rule.
//   - n=5+: same as 2-4 but the strip becomes scrollable.
//   - n=15+: filter affordance hint surfaced in the
//     CrossExperienceHeader (separate component) — DossierHeader stays
//     focused on the SPINE; it doesn't grow new chrome at higher n
//     beyond the scrollable strip.
//
// "Add another to your record" pill is always rendered BELOW the
// dossier (V2 §2 + V3 §3 — never above; we don't tell a first-time
// user they should have more before they've finished reading their
// first).
//
// This component is the SPINE; the comparative surfaces (Temporal /
// Geographic / Radar / Hints / Paywall) live OUTSIDE of it in the
// lab.tsx page composition.

import React, { useState } from 'react'
import Link from 'next/link'
import { User as UserIcon, MapPin, Calendar, Plus, ChevronRight, Play } from 'lucide-react'
import EmptyDossier from './EmptyDossier'
import InlineVideoPlayer from '@/components/video/InlineVideoPlayer'
import DiscoverabilityToggle from './DiscoverabilityToggle'

interface ExperienceVideo {
  videoUrl: string | null
  posterUrl: string | null
  durationSec: number | null
  segments?: unknown[] | null
}

interface ExperienceForDossier {
  id: string
  title?: string | null
  type_name?: string | null
  category?: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  location_description?: string | null
  event_date?: string | null
  event_date_raw?: string | null
  description?: string | null
  summary?: string | null
  /** Year already resolved by the caller (event_date or event_date_raw). */
  resolved_year?: number | null
  // V11.17.78 — submission card upgrade.
  slug?: string | null
  status?: string | null
  created_at?: string | null
  has_video?: boolean | null
  has_photo_video?: boolean | null
  discoverable?: boolean | null
  video?: ExperienceVideo | null
}

interface DossierHeaderProps {
  /** All user-submitted experiences (in display order; newest first). */
  experiences: ExperienceForDossier[]
  /** Index of the focused experience in `experiences`. */
  focusedIdx: number
  /** Click handler when the user taps a pill in the multi-experience strip. */
  onFocus: (idx: number) => void
  /**
   * The synthesized one/two-sentence body paragraph for the focused
   * experience — produced upstream by the Haiku synthesis call per
   * V3 §3 ("Your 1998 Lumberton triangle is one of 23 triangle
   * sightings…"). null = computing.
   */
  synthesizedParagraph: string | null
  /** Optional manage-submissions handler — surfaced as a quiet link. */
  onManageOpen?: () => void
}

function locationLabel(e: ExperienceForDossier): string {
  var parts = [e.city, e.state_province].filter(Boolean) as string[]
  if (parts.length > 0) return parts.join(', ')
  if (e.location_description) return e.location_description
  return e.country || 'Location unrecorded'
}

function dossierTitle(e: ExperienceForDossier): string {
  if (e.title) return e.title
  if (e.type_name) return e.type_name
  if (e.category) return e.category.replace(/_/g, ' ')
  return 'Your experience'
}

function shortYear(e: ExperienceForDossier): string {
  if (e.resolved_year != null) return String(e.resolved_year)
  if (e.event_date) {
    var y = new Date(e.event_date).getFullYear()
    if (!isNaN(y) && y > 1800 && y < 2200) return String(y)
  }
  if (e.event_date_raw) {
    var m = String(e.event_date_raw).match(/(\d{4})/)
    if (m) return m[1]
  }
  return ''
}

// V11.17.78 — submission card upgrade. Format "Mar 14, 2026" for the
// ownership eyebrow. Falls back to empty string when created_at is
// missing or unparseable; the eyebrow gracefully shows
// "Documented by you" alone in that case.
function formatDocumentedDate(iso?: string | null): string {
  if (!iso) return ''
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  } catch (_e) {
    return ''
  }
}

function formatDuration(sec?: number | null): string {
  if (sec == null || !isFinite(sec) || sec < 0) return ''
  var s = Math.floor(sec)
  var m = Math.floor(s / 60)
  var r = s % 60
  return m + ':' + (r < 10 ? '0' : '') + r
}

interface StatusVisual {
  label: string
  className: string
}

function statusVisual(status?: string | null): StatusVisual | null {
  var s = (status || '').toLowerCase()
  if (s === 'approved' || s === 'published') {
    return {
      label: 'Published',
      className: 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300',
    }
  }
  if (s === 'pending' || s === 'pending_review') {
    return {
      label: 'Pending review',
      className: 'bg-amber-500/10 border-amber-500/40 text-amber-300',
    }
  }
  if (s === 'archived' || s === 'rejected') {
    return {
      label: s === 'rejected' ? 'Archived' : 'Archived',
      className: 'bg-gray-500/10 border-gray-500/40 text-gray-300',
    }
  }
  return null
}

export default function DossierHeader(props: DossierHeaderProps) {
  // Hooks first — Rules-of-Hooks compliance. Gate checks come AFTER.
  var [videoPlaying, setVideoPlaying] = useState(false)

  var n = props.experiences.length
  var focusedIdx = Math.max(0, Math.min(props.focusedIdx, Math.max(0, n - 1)))
  var focused: ExperienceForDossier | null = n > 0 ? props.experiences[focusedIdx] : null

  // Reset the in-place player when the focused experience changes.
  // (Cheap to recompute; the state lives at the card and the card
  // re-renders on focus change anyway.)
  var focusedId = focused ? focused.id : ''
  React.useEffect(function () {
    setVideoPlaying(false)
  }, [focusedId])

  // Gate checks.
  if (n === 0) return <EmptyDossier />
  if (!focused) return <EmptyDossier />

  var description = (focused.description || focused.summary || '').trim()
  var documentedDate = formatDocumentedDate(focused.created_at)
  var status = statusVisual(focused.status)
  var slug = focused.slug || null
  var hasVideoMedia = !!(focused.has_photo_video || focused.has_video)
  var videoData = focused.video || null
  var posterUrl = videoData ? videoData.posterUrl : null
  var videoUrl = videoData ? videoData.videoUrl : null
  var durationLabel = videoData ? formatDuration(videoData.durationSec) : ''
  // Show the poster slot only when we actually have a poster OR a
  // playable URL; otherwise (has_video=true but signing failed) we
  // fall back silently to the prose-only layout per panel guidance.
  var showPosterSlot = hasVideoMedia && (posterUrl || videoUrl)

  return (
    <section
      aria-label="Your record dossier"
      className="w-full max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-2"
    >
      {/* Multi-experience strip — only at n≥2. Horizontal scroll on
          mobile, wraps on desktop. */}
      {n >= 2 && (
        <div className="mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300">
              Your experiences ({n})
            </span>
            {props.onManageOpen && (
              <button
                type="button"
                onClick={props.onManageOpen}
                className="inline-flex items-center gap-1 text-[10px] font-semibold tracking-widest uppercase text-gray-400 hover:text-purple-300 transition-colors"
              >
                Manage <ChevronRight className="w-3 h-3" />
              </button>
            )}
          </div>
          <div className="flex items-stretch gap-2 overflow-x-auto scrollbar-hide -mx-4 sm:-mx-0 px-4 sm:px-0 pb-2 snap-x snap-mandatory">
            {props.experiences.map(function (e, i) {
              var active = i === focusedIdx
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={function () { props.onFocus(i) }}
                  aria-pressed={active}
                  className={
                    'flex-shrink-0 snap-start text-left rounded-xl px-3 py-2.5 transition-colors border min-w-[180px] max-w-[78vw] sm:max-w-[260px] ' +
                    (active
                      ? 'bg-purple-600/15 border-purple-500/60 ring-1 ring-purple-500/30'
                      : 'bg-gray-900/60 border-gray-800/60 hover:border-gray-700')
                  }
                >
                  <p className={'text-sm font-semibold truncate ' + (active ? 'text-white' : 'text-gray-200')}>
                    {locationLabel(e)}
                  </p>
                  <p className="text-[11px] text-gray-400 truncate mt-0.5">
                    {shortYear(e) ? shortYear(e) + ' · ' : ''}{dossierTitle(e)}
                  </p>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Focused dossier — full-bleed at n=1, otherwise the focused card
          inside the multi-experience timeline. */}
      <article
        className="rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/30 via-gray-950/40 to-gray-950/60 p-4 sm:p-6"
      >
        {/* C) Ownership chrome — eyebrow + status pill + identity row.
            Mobile-first: the eyebrow row wraps to two lines on narrow
            viewports; status pill never overflows. */}
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-5 h-5 text-purple-200" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
              <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300">
                Documented by you{documentedDate ? ' · ' + documentedDate : ''}
              </p>
              {status && (
                <span
                  className={
                    'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ' +
                    status.className
                  }
                >
                  {status.label}
                </span>
              )}
            </div>
            <h2 className="text-lg sm:text-xl font-semibold text-white leading-snug" style={{ fontFamily: "'Changa One', system-ui, sans-serif" }}>
              {dossierTitle(focused)}
            </h2>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {locationLabel(focused)}
              </span>
              {shortYear(focused) && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="w-3 h-3" /> {shortYear(focused)}
                </span>
              )}
            </div>
            {/* DiscoverabilityToggle (Tier 3C ships this) — mounted
                next to the identity chrome. Hidden when no slug yet
                (pending submissions can't be made discoverable). */}
            {slug && (
              <div className="mt-3">
                <DiscoverabilityToggle reportId={focused.id} initialDiscoverable={focused.discoverable === true ? true : (focused.discoverable === false ? false : undefined)} />
              </div>
            )}
          </div>
        </div>

        {/* A) Video poster — when present, sits above the prose body.
            16:9 aspect, full-bleed inside the card, rounded corners,
            tap-to-expand-in-place. Per panel: documentary register —
            quiet poster + center play, no auto-loop. */}
        {showPosterSlot && (
          <div className="mb-4">
            {videoPlaying && videoUrl ? (
              <div className="relative w-full overflow-hidden rounded-xl bg-black">
                <InlineVideoPlayer
                  reportId={focused.id}
                  playbackUrl={videoUrl}
                  thumbnailUrl={posterUrl || undefined}
                  segments={(videoData && (videoData.segments as any)) || null}
                  mode="watch"
                  className="!aspect-video"
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={function () {
                  if (videoUrl) setVideoPlaying(true)
                }}
                disabled={!videoUrl}
                aria-label={videoUrl ? 'Play your video submission' : 'Video preview unavailable'}
                className="group relative block w-full overflow-hidden rounded-xl bg-black/60 border border-white/10 aspect-video focus:outline-none focus:ring-2 focus:ring-purple-500/50"
              >
                {posterUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={posterUrl}
                    alt=""
                    className="absolute inset-0 w-full h-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-purple-900/30 via-gray-900/40 to-black/60">
                    <span className="text-xs uppercase tracking-widest text-gray-400">Video</span>
                  </div>
                )}
                {/* Subtle vignette for legibility of the play / duration affordances. */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20" />
                {/* Center play target — ≥44×44 per HIG. */}
                <span
                  className={
                    'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-white/15 backdrop-blur-sm border border-white/30 transition-colors ' +
                    (videoUrl ? 'group-hover:bg-white/25' : 'opacity-60')
                  }
                >
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 text-white" fill="currentColor" />
                </span>
                {durationLabel && (
                  <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-black/70 text-white text-[11px] font-medium tabular-nums">
                    {durationLabel}
                  </span>
                )}
              </button>
            )}
          </div>
        )}

        {/* Synthesized paragraph — the load-bearing prose surface per
            V3 §3. Two sentences max from Haiku; never long-form. */}
        <div className="mb-4 pt-4 border-t border-purple-800/30">
          {props.synthesizedParagraph
            ? (
                <p className="text-sm sm:text-[15px] text-gray-100 leading-relaxed italic">
                  {props.synthesizedParagraph}
                </p>
              )
            : (
                <p className="text-sm text-gray-400 leading-relaxed italic">
                  Computing where your account sits in the wider Archive&hellip;
                </p>
              )
          }
        </div>

        {/* Verbatim account excerpt — V3 §3 "the user's written account
            preserved verbatim. This is the load-bearing object." */}
        {description && (
          <div className="pt-4 border-t border-purple-800/30">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-gray-500 mb-2">
              In your words
            </p>
            <p className="text-sm text-gray-200 leading-relaxed whitespace-pre-line">
              &ldquo;{description.length > 480 ? description.substring(0, 480).trim() + '…' : description}&rdquo;
            </p>
          </div>
        )}

        {/* B) "Read the full report" CTA — bottom of the card. Routes
            in-app via <Link> (panel: preserves the /lab → /report → back
            loop). Mobile tap target ≥44px high via py-3. */}
        {slug && (
          <div className="mt-5 pt-4 border-t border-purple-800/30 flex justify-start">
            <Link
              href={'/report/' + slug}
              className="inline-flex items-center gap-1.5 py-3 pr-2 -my-1 text-sm font-medium text-purple-300 hover:text-purple-200 hover:underline underline-offset-4 transition-colors min-h-[44px]"
            >
              Read the full report
              <ChevronRight className="w-4 h-4" />
            </Link>
          </div>
        )}
      </article>

      {/* Permanent "Add another to your record" pill — BELOW the
          dossier per V3 §3 + V2 §2 mass-market rule. */}
      <div className="flex justify-center mt-5">
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600/15 border border-purple-500/40 text-purple-200 text-sm font-medium hover:bg-purple-600/25 hover:text-white transition-colors min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          Add another to your record
        </Link>
      </div>
    </section>
  )
}
