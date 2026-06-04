'use client'

// V11.17.69 - Tier 2B
//
// TemporalStrip — the "clock-and-decade strip" surface from
// LAB_PANEL_REVIEW_V3 §3 first-session walkthrough.
//
// Renders TWO compact visualizations stacked for the focused
// experience:
//   1. A 24-hour dial showing the user's event hour against the
//      Archive's event-hour distribution for the same phenomenon
//      family.
//   2. A decade band showing the user's event decade against the
//      same-family decade distribution.
//
// Each visualization is paired with a single documentary-voice
// sentence ("Your encounter occurred at 02:47 — like 64% of UFO-shape
// reports in the Archive, this falls in the 12am-4am 'liminal hours'
// cluster.").
//
// Gating philosophy (V3 §2 + §3): the SURFACE renders at n=1 for
// every tier. Depth gates: Free → static labels; Basic → +time-of-week,
// lunar, seasonal overlays (placeholder slot here); Pro → +custom
// date-range, raw histograms (placeholder slot here).
//
// Data: we accept a `hourDistribution` (24-element array of percent
// shares) and `decadeDistribution` (array of { decade, share }) as
// props. The parent (DossierHeader / lab.tsx) is responsible for
// fetching from the appropriate API. When data is `null` we render a
// compact "computing..." placeholder rather than a fabricated chart —
// same pattern as Hints `min_data_threshold`.

import React from 'react'
import { Clock } from 'lucide-react'

interface TemporalStripProps {
  /** Hour 0-23 of the user's event, or null if unknown. */
  userHour: number | null
  /** Year of the user's event, or null if unknown. */
  userYear: number | null
  /**
   * 24-element array of percent shares (0-100) for the same-family
   * Archive distribution. null means data not yet loaded.
   */
  hourDistribution: number[] | null
  /**
   * Per-decade share (0-100). null means data not yet loaded.
   * Decades are integer year * 10 anchors: 1980, 1990, 2000, etc.
   */
  decadeDistribution: { decade: number; share: number }[] | null
  /**
   * Human-readable phen family label, e.g. "triangle UFO reports" or
   * "UFO-shape reports" — used in the prose sentence beneath each
   * visualization.
   */
  phenFamilyLabel: string
  /** Tier of the current viewer — gates depth-add affordances. */
  tier?: 'free' | 'basic' | 'pro' | null
}

// Bucket labels per the V3 §3 "liminal hours" copy convention.
function hourBucketLabel(hour: number): string {
  if (hour >= 0 && hour < 4) return '12am-4am liminal hours'
  if (hour >= 4 && hour < 8) return '4am-8am dawn band'
  if (hour >= 8 && hour < 12) return 'morning band'
  if (hour >= 12 && hour < 16) return 'afternoon band'
  if (hour >= 16 && hour < 20) return '4pm-8pm dusk band'
  return '8pm-12am evening band'
}

function bucketShareFromDistribution(dist: number[] | null, hour: number | null): number | null {
  if (!dist || hour == null) return null
  // 4-hour buckets aligned with the labels above.
  var startHour = Math.floor(hour / 4) * 4
  var sum = 0
  for (var i = startHour; i < startHour + 4 && i < dist.length; i++) sum += dist[i] || 0
  return Math.round(sum)
}

function formatHour(hour: number | null): string {
  if (hour == null) return 'time unknown'
  var h = hour % 12
  if (h === 0) h = 12
  var suffix = hour < 12 ? 'am' : 'pm'
  return h + ':00' + suffix
}

export default function TemporalStrip(props: TemporalStripProps) {
  var hasHour = props.userHour != null
  var hasYear = props.userYear != null
  var loading = props.hourDistribution == null && props.decadeDistribution == null

  // Pre-compute the prose sentence for the hour band.
  var bucketShare = bucketShareFromDistribution(props.hourDistribution, props.userHour)
  var bucketLabel = props.userHour != null ? hourBucketLabel(props.userHour) : ''

  // Pre-compute the user's decade.
  var userDecade = props.userYear != null ? Math.floor(props.userYear / 10) * 10 : null
  var decadeShare: number | null = null
  if (userDecade != null && props.decadeDistribution) {
    var match = props.decadeDistribution.find(function (d) { return d.decade === userDecade })
    if (match) decadeShare = Math.round(match.share)
  }

  return (
    <section
      aria-label="Temporal context — when this kind of account tends to happen"
      className="rounded-2xl border border-gray-800/60 bg-gray-950/40 p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3 px-1">
        <div className="flex items-center gap-2">
          <Clock className="w-3 h-3 text-purple-300" />
          <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300">
            Temporal context
          </span>
        </div>
        <span className="text-[10px] text-gray-500">vs the wider archive</span>
      </div>

      {/* 24-hour dial */}
      <div className="space-y-2">
        <HourDial
          userHour={props.userHour}
          distribution={props.hourDistribution}
        />
        <p className="text-sm text-gray-200 leading-relaxed">
          {hasHour
            ? (bucketShare != null
                ? <>Your account is recorded at{' '}
                    <span className="font-semibold text-purple-200">{formatHour(props.userHour)}</span>
                    {' '}&mdash; like{' '}
                    <span className="font-semibold text-purple-200">{bucketShare}%</span>
                    {' '}of {props.phenFamilyLabel} in the Archive, this falls in the{' '}
                    <span className="italic text-purple-200/90">{bucketLabel}</span>.
                  </>
                : (loading
                    ? <span className="text-gray-400">Computing the time-of-day distribution for {props.phenFamilyLabel}&hellip;</span>
                    : <>Your account is recorded at{' '}
                        <span className="font-semibold text-purple-200">{formatHour(props.userHour)}</span>
                        {' '}&mdash; the Archive&rsquo;s time-of-day distribution for {props.phenFamilyLabel} is still being computed for your fingerprint.
                      </>
                  )
              )
            : <span className="text-gray-400">Add a time of day to your account and we&rsquo;ll set it against the Archive&rsquo;s 24-hour distribution for {props.phenFamilyLabel}.</span>
          }
        </p>
      </div>

      {/* Decade band */}
      <div className="mt-5 pt-4 border-t border-gray-800/60 space-y-2">
        <DecadeBand
          userYear={props.userYear}
          distribution={props.decadeDistribution}
        />
        <p className="text-sm text-gray-200 leading-relaxed">
          {hasYear
            ? (decadeShare != null
                ? <>Your{' '}
                    <span className="font-semibold text-purple-200">{props.userYear}</span>
                    {' '}account sits in the{' '}
                    <span className="font-semibold text-purple-200">{userDecade}s</span>
                    {' '}&mdash; {decadeShare}% of {props.phenFamilyLabel} in the Archive cluster there.
                  </>
                : (loading
                    ? <span className="text-gray-400">Computing the decade distribution for {props.phenFamilyLabel}&hellip;</span>
                    : <>Your{' '}
                        <span className="font-semibold text-purple-200">{props.userYear}</span>
                        {' '}account sits in the{' '}
                        <span className="font-semibold text-purple-200">{userDecade}s</span>
                        {' '}&mdash; the decade distribution for {props.phenFamilyLabel} is still being computed.
                      </>
                  )
              )
            : <span className="text-gray-400">Add an event year to your account and we&rsquo;ll set it against the Archive&rsquo;s decade distribution.</span>
          }
        </p>
      </div>

      {/* Tier-depth affordance — depth gating, not access gating. */}
      {props.tier === 'free' && (
        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
          Basic adds time-of-week, lunar-phase, and seasonal overlays; Pro
          adds custom date-range filters and raw histograms.
        </p>
      )}
    </section>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

/**
 * 24-bar histogram of the corpus's hour-of-day distribution, with
 * the user's hour highlighted. When distribution is null, renders a
 * faint placeholder so the layout doesn't reflow once data arrives.
 */
function HourDial(props: { userHour: number | null; distribution: number[] | null }) {
  var dist = props.distribution
  var max = dist ? Math.max.apply(null, dist) || 1 : 1
  return (
    <div className="px-1">
      <div className="flex items-end justify-between gap-[1px] h-10">
        {Array.from({ length: 24 }).map(function (_, i) {
          var share = dist ? (dist[i] || 0) : 0
          var heightPct = dist ? Math.max(6, (share / max) * 100) : 6
          var isUser = props.userHour === i
          return (
            <div key={i} className="flex-1 flex flex-col justify-end h-full">
              <div
                className={
                  'w-full rounded-t-sm transition-colors ' +
                  (isUser
                    ? 'bg-purple-300'
                    : dist
                      ? 'bg-purple-700/40'
                      : 'bg-gray-800/40')
                }
                style={{ height: heightPct + '%' }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-1 text-[9px] text-gray-500 uppercase tracking-wide">
        <span>12am</span>
        <span>6am</span>
        <span>12pm</span>
        <span>6pm</span>
        <span>12am</span>
      </div>
    </div>
  )
}

/**
 * Horizontal decade band. Like the hour dial — user marker over a
 * faint corpus distribution. Span chosen to comfortably cover the
 * mass-market timeframe (1950s through current decade).
 */
function DecadeBand(props: { userYear: number | null; distribution: { decade: number; share: number }[] | null }) {
  var dist = props.distribution
  // Build the span: 1950 → current decade. We render every decade as a
  // bar so the user can read the corpus shape at a glance.
  var nowDecade = Math.floor(new Date().getFullYear() / 10) * 10
  var decades: number[] = []
  for (var d = 1950; d <= nowDecade; d += 10) decades.push(d)

  var distMap: Record<number, number> = {}
  if (dist) dist.forEach(function (entry) { distMap[entry.decade] = entry.share })
  var max = Math.max.apply(null, Object.values(distMap).concat([1])) || 1
  var userDecade = props.userYear != null ? Math.floor(props.userYear / 10) * 10 : null

  return (
    <div className="px-1">
      <div className="flex items-end justify-between gap-1 h-10">
        {decades.map(function (decade) {
          var share = distMap[decade] || 0
          var heightPct = dist ? Math.max(6, (share / max) * 100) : 6
          var isUser = userDecade === decade
          return (
            <div key={decade} className="flex-1 flex flex-col justify-end h-full">
              <div
                className={
                  'w-full rounded-t-sm transition-colors ' +
                  (isUser
                    ? 'bg-purple-300'
                    : dist
                      ? 'bg-purple-700/40'
                      : 'bg-gray-800/40')
                }
                style={{ height: heightPct + '%' }}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-between mt-1 text-[9px] text-gray-500 uppercase tracking-wide">
        {decades.map(function (decade, idx) {
          // Only label every other decade on mobile to avoid crowding.
          var show = idx % 2 === 0 || idx === decades.length - 1
          return (
            <span key={decade} className={'flex-1 text-center ' + (show ? '' : 'opacity-0')}>
              {('' + decade).slice(2)}s
            </span>
          )
        })}
      </div>
    </div>
  )
}
