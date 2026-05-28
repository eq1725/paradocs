'use client'

/**
 * LabPromo — V11.17.39 (Round 4 panel-locked)
 *
 * Lab subscription upsell card injected into the Today feed. Replaces
 * the legacy ResearchHubPromo (which referenced deprecated terms:
 * "Research Hub", "RADAR" as a feature, "Build your RADAR", "Cases",
 * "constellation").
 *
 * Design spec (locked across 4 rounds of expert-panel review):
 *
 *   IDENTITY
 *     - "Lab" wordmark in Changa One (font-brand)
 *     - All other copy in Changa (font-display, weights 400/500/600)
 *     - Cream accent (#f2ead8) on indigo gradient — premium contrast
 *
 *   HERO VISUAL
 *     - Real production RadarVisualization component in 'reveal' mode
 *     - Faux but plausible match data so the rings, sweep, and dots all
 *       animate convincingly. Tap-through routes to /pricing — there's
 *       no real interaction needed on the preview.
 *
 *   COPY (Round 4 locked)
 *     - Headline = state-aware variant (see pickHeadline()):
 *         1. Anonymous              → "Something keeps pulling you back."
 *         2. Signed-in, 0 saves     → "You've been reading. Lab connects what you read."
 *         3. 1-3 saves              → "You're starting to notice something."
 *         4. 4+ saves               → "You saved {N} reports this week. There's a reason."
 *         5. 0 saves but active     → "You've viewed {N} reports. Lab finds the thread."
 *     - Sub-headline (always): "The pattern is already there. Lab makes it visible."
 *     - 3 benefit lines mapped to current Lab tabs:
 *         • "Every report you save, in one place"            → LIBRARY
 *         • "Radar — reports that match your details"        → YOUR STORY
 *         • "Ask the archive — 100k witnesses, one question" → EXPLORE
 *     - CTA: "Start 7-day free trial"
 *     - Footer: "Then $5.99/mo · Cancel anytime"
 *     - Panel decision: Pro tier NOT mentioned on this card. Tier
 *       selection happens on /pricing after the user signals intent.
 *       Two prices in feed paywalls measurably depress trial-start
 *       (Spotify, Strava both stripped this).
 *
 *   FOOTPRINT DATA
 *     - GET /api/lab/footprint returns {signedIn, savedCount7d,
 *       thumbsUpCount7d, viewedCount7d} for the headline ladder.
 *     - We fetch on mount when isActive=true. Static fallback (variant 1)
 *       renders immediately and gets replaced if data arrives.
 *
 * SWC compliant: var + function() form.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import RadarVisualization, { type RadarMatch } from '@/components/radar/RadarVisualization'

export interface PromoCardData {
  item_type: 'promo'
  id: string
  promo_type: 'research_hub'  // kept for backwards-compat with the feed-v2 item_type union
}

interface LabPromoProps {
  isActive: boolean
}

// V11.17.39 — Round 4: faux match set tuned to look like a real
// signature on the Radar at small size. Six categories at fixed
// clock positions, varied match_scores so the dots spread across
// rings instead of bunching at one radius. We deliberately bias
// toward 'ufos_aliens' (12 o'clock) because it's the largest category
// in the corpus and looks most natural in a teaser.
var FAUX_MATCHES: RadarMatch[] = [
  { id: 'fx-1', title: 'Triangular Object Over Pinnacle Peak', slug: '#', category: 'ufos_aliens', match_score: 0.82 },
  { id: 'fx-2', title: 'Shadow Figure at Foot of Bed', slug: '#', category: 'ghosts_hauntings', match_score: 0.68 },
  { id: 'fx-3', title: 'Three-Toed Track in Snow', slug: '#', category: 'cryptids', match_score: 0.55 },
  { id: 'fx-4', title: 'White Light NDE During Surgery', slug: '#', category: 'psychological_experiences', match_score: 0.71 },
  { id: 'fx-5', title: 'Synchronicity Cluster Before Move', slug: '#', category: 'psychic_phenomena', match_score: 0.62 },
  { id: 'fx-6', title: 'Silent Orb Over Estuary', slug: '#', category: 'ufos_aliens', match_score: 0.74 },
]

// V11.17.39 — Round 4 benefit lines locked.
var BENEFITS = [
  { text: 'Every report you save, in one place',      tab: 'Library' },
  { text: 'Radar — reports that match your details',   tab: 'Your Story' },
  { text: 'Ask the archive — 100k witnesses, one question', tab: 'Explore' },
]

interface Footprint {
  signedIn: boolean
  savedCount7d: number
  thumbsUpCount7d: number
  viewedCount7d: number
}

var SUB_HEADLINE = 'The pattern is already there. Lab makes it visible.'

// Panel Round 4 — variant matrix. State 4 floor: save_count >= 4
// before we trigger the personalized count headline (1-report
// shoutouts feel weak per panelist Sam).
function pickHeadline(fp: Footprint | null): string {
  if (!fp || !fp.signedIn) {
    return 'Something keeps pulling you back.'
  }
  if (fp.savedCount7d >= 4) {
    return 'You saved ' + fp.savedCount7d + ' reports this week. There\'s a reason.'
  }
  if (fp.savedCount7d >= 1) {
    return 'You\'re starting to notice something.'
  }
  // 0 saves
  if (fp.thumbsUpCount7d >= 10 || fp.viewedCount7d >= 30) {
    var n = Math.max(fp.thumbsUpCount7d, fp.viewedCount7d)
    return 'You\'ve viewed ' + n + ' reports. Lab finds the thread.'
  }
  return 'You\'ve been reading. Lab connects what you read.'
}

export function LabPromo(props: LabPromoProps) {
  var [fp, setFp] = useState<Footprint | null>(null)

  // Fetch footprint when the card becomes active. We fire-and-forget;
  // the static fallback headline renders immediately so the card never
  // looks empty mid-fetch.
  useEffect(function () {
    if (!props.isActive) return
    if (fp) return  // already loaded
    var cancelled = false
    async function load() {
      try {
        var sessionResult = await supabase.auth.getSession()
        var token = sessionResult.data.session?.access_token || ''
        var headers: any = {}
        if (token) headers.Authorization = 'Bearer ' + token
        var r = await fetch('/api/lab/footprint', { headers })
        if (!r.ok) return
        var j = await r.json()
        if (cancelled) return
        setFp({
          signedIn: !!j.signedIn,
          savedCount7d: j.savedCount7d || 0,
          thumbsUpCount7d: j.thumbsUpCount7d || 0,
          viewedCount7d: j.viewedCount7d || 0,
        })
      } catch (_e) { /* swallow — fallback headline is fine */ }
    }
    load()
    return function () { cancelled = true }
  }, [props.isActive])

  var headline = pickHeadline(fp)

  return (
    <div className="h-full w-full relative overflow-hidden bg-gray-950" role="article" aria-label="Promotion: Lab subscription">
      {/* Top-left context pill (kept from V2 — it's a feed-context flag, not card chrome) */}
      <div className="absolute top-3 left-3 z-20">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-[10px] font-display font-semibold uppercase tracking-wider text-indigo-200">
          From Paradocs
        </span>
      </div>

      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-gray-950 to-purple-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_22%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_78%,rgba(168,85,247,0.12),transparent_55%)]" />

      {/* V11.17.39 — Compressed vertical rhythm so the CTA fits within
          the Today-feed mobile viewport. Earlier sizing (72px wordmark,
          220px Radar, generous gutters) caused the CTA to sit below the
          fold on iPhone 14 Pro and similar. Now:
          - Wordmark trimmed 72→52px (still feels like the identity)
          - Radar trimmed 220→168px
          - Inter-block gutters tightened 24→14px
          - Bottom padding clamped to the mobile-tab-bar reserve only
          - justify-between to anchor CTA at the bottom of the safe area */}
      <div className={
        'relative z-10 h-full flex flex-col items-center px-5 sm:px-8 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+2.5rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+12px)] md:pb-6 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Lab wordmark — Changa One */}
        <h2 className="font-brand text-[52px] sm:text-[60px] leading-none text-[#f2ead8] tracking-tight">
          Lab
        </h2>

        {/* Real Radar — reveal mode, faux match data */}
        <div className="mt-2 mb-4 flex items-center justify-center">
          <RadarVisualization
            matches={FAUX_MATCHES}
            user={{ latitude: null, longitude: null }}
            mode={props.isActive ? 'reveal' : 'idle'}
            filter="all"
            size={168}
            centerLabel="YOU"
          />
        </div>

        {/* Headline + sub-line */}
        <div className="text-center max-w-sm">
          <h3 className="font-display font-semibold text-[#f2ead8] text-[20px] leading-tight">
            {headline}
          </h3>
          <p className="font-display font-normal text-[#f2ead8]/70 text-[14px] mt-1.5 leading-snug">
            {SUB_HEADLINE}
          </p>
        </div>

        {/* Hairline-divided benefit rows */}
        <div className="w-full max-w-sm mt-4 border-t border-b border-[#f2ead8]/12">
          {BENEFITS.map(function (b, i) {
            var isLast = i === BENEFITS.length - 1
            return (
              <div
                key={i}
                className={
                  'flex items-baseline justify-between py-2.5 px-1 ' +
                  (isLast ? '' : 'border-b border-[#f2ead8]/10')
                }
              >
                <span className="font-display font-medium text-[13px] text-[#f2ead8]">{b.text}</span>
                <span className="font-display font-medium text-[9.5px] uppercase tracking-[0.16em] text-[#f2ead8]/45 whitespace-nowrap pl-3">
                  {b.tab}
                </span>
              </div>
            )
          })}
        </div>

        {/* CTA — cream button on indigo per panel pixel direction.
            mt-auto pushes the CTA group to the bottom of the available
            space so it always sits above the mobile tab-bar gutter. */}
        <div className="mt-auto pt-5 text-center w-full">
          <Link
            href="/pricing"
            className="inline-flex items-center justify-center px-9 py-3 bg-[#f2ead8] hover:bg-white text-[#1e1b4b] rounded-full font-display font-semibold text-[14px] transition-colors"
          >
            Start 7-day free trial
          </Link>
          <p className="font-display font-normal text-[11px] text-[#f2ead8]/50 mt-2.5">
            Then $5.99/mo · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}
