'use client'

/**
 * LabPromo — V11.17.40 (impression telemetry + paywall click logging)
 *
 * V11.17.40 — Backlog #4 frequency cap. On mount, fires a fire-and-
 * forget POST to /api/lab/promo/event { event_type: 'shown' } so the
 * server-side cap (6/week) + cooldown logic stays accurate across
 * sessions and devices. The CTA tap now also logs 'clicked' before
 * navigating to /pricing (treated as the paywall_view signal — 7d
 * cooldown). Dismiss is wired from discover.tsx since the dismiss
 * action lives in the swipe handler, not here.
 *
 * Original (Round 5):
 *
 * Lab subscription upsell card injected into the Today feed. Replaces
 * the legacy ResearchHubPromo.
 *
 * History of this card:
 *   - Round 1-2: locked copy + variant matrix + ghost-cluster idea (cut)
 *   - Round 3: pricing-tier copy locked (single-line $5.99 footer)
 *   - Round 4: live RadarVisualization w/ reveal mode at size=168
 *   - Round 5 (this rev): replaced the live Radar with a stylized
 *     teaser SVG. The live component is tested down to 200px; at the
 *     168px we needed it for vertical-fit, the YOU node rendered
 *     off-center and the random category palette looked busy on a
 *     marketing surface. The teaser uses brand-purple / cream only and
 *     hand-tuned dot positions for clean geometry.
 *   - Round 5 vertical-fit pass: wordmark 52→44px, teaser 168→140px,
 *     gutter compression, CTA anchored via mt-auto so the entire card
 *     reliably fits above the iPhone tab-bar safe-area.
 *
 * Design spec (locked across 5 rounds of expert-panel review):
 *
 *   IDENTITY
 *     - "Lab" wordmark in Changa One (font-brand)
 *     - All other copy in Changa (font-display, weights 400/500/600)
 *     - Cream accent (#f2ead8) on indigo gradient
 *
 *   COPY (Round 4 locked)
 *     - Headline = state-aware variant from /api/lab/footprint
 *     - Sub-headline: "The pattern is already there. Lab makes it visible."
 *     - 3 benefit lines → Library / Your Story / Explore
 *     - CTA: "Start 7-day free trial"
 *     - Footer: "Then $5.99/mo · Cancel anytime"
 *
 * SWC compliant: var + function() form.
 */

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { logLabPromoEvent } from '@/lib/lab-promo-telemetry'

export interface PromoCardData {
  item_type: 'promo'
  id: string
  promo_type: 'research_hub'  // kept for feed-v2 item_type union compat
}

interface LabPromoProps {
  isActive: boolean
}

// V11.17.39 — Round 4 benefit lines locked.
var BENEFITS = [
  { text: 'Every report you save, in one place',       tab: 'Library' },
  { text: 'Radar — reports that match your details',    tab: 'Your Story' },
  { text: 'Ask the archive — 100k witnesses, one question', tab: 'Explore' },
]

interface Footprint {
  signedIn: boolean
  savedCount7d: number
  thumbsUpCount7d: number
  viewedCount7d: number
}

var SUB_HEADLINE = 'The pattern is already there. Lab makes it visible.'

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
  if (fp.thumbsUpCount7d >= 10 || fp.viewedCount7d >= 30) {
    var n = Math.max(fp.thumbsUpCount7d, fp.viewedCount7d)
    return 'You\'ve viewed ' + n + ' reports. Lab finds the thread.'
  }
  return 'You\'ve been reading. Lab connects what you read.'
}

/**
 * RadarTeaser — stylized brand-tuned mini-radar SVG.
 *
 * Visually rhymes with the live RadarVisualization (concentric rings,
 * pulsing YOU node at dead-center, sweep arm, category dots) but with:
 *   - Hand-picked dot positions for clean geometry
 *   - Brand cream + indigo only (no category palette mess at this size)
 *   - Centered YOU node (the live component renders off-center below
 *     its tested 200px size threshold)
 *   - CSS-keyframe sweep + halo pulse, scoped to this instance
 */
function RadarTeaser(props: { size?: number; active: boolean }) {
  var size = props.size || 140
  return (
    <div className="relative" style={{ width: size, height: size }} aria-hidden="true">
      <style jsx>{`
        @keyframes lab-radar-sweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        @keyframes lab-you-pulse {
          0%, 100% { transform: scale(1); opacity: 0.95; }
          50% { transform: scale(1.18); opacity: 0.55; }
        }
        @keyframes lab-dot-flash {
          0%, 90%, 100% { opacity: 0.85; }
          5% { opacity: 1; }
          12% { opacity: 0.85; }
        }
      `}</style>
      <svg viewBox="-100 -100 200 200" width={size} height={size} style={{ overflow: 'visible' }}>
        <defs>
          <radialGradient id="lab-you-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.7" />
            <stop offset="60%" stopColor="#a5b4fc" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="lab-sweep" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a5b4fc" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a5b4fc" stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Concentric rings (3 levels) */}
        <circle cx="0" cy="0" r="42" fill="none" stroke="#f2ead8" strokeOpacity="0.32" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="64" fill="none" stroke="#f2ead8" strokeOpacity="0.26" strokeWidth="0.8" />
        <circle cx="0" cy="0" r="88" fill="none" stroke="#f2ead8" strokeOpacity="0.18" strokeWidth="0.8" />

        {/* Cross-hair guides */}
        <line x1="-88" y1="0" x2="88" y2="0" stroke="#f2ead8" strokeOpacity="0.08" strokeWidth="0.6" strokeDasharray="2 4" />
        <line x1="0" y1="-88" x2="0" y2="88" stroke="#f2ead8" strokeOpacity="0.08" strokeWidth="0.6" strokeDasharray="2 4" />

        {/* Sweep arm — 90° wedge rotating around origin */}
        <g style={{
          transformOrigin: '0 0',
          animation: props.active ? 'lab-radar-sweep 7s linear infinite' : 'none',
        }}>
          <path d="M 0,0 L 88,0 A 88,88 0 0,1 62.2,62.2 Z" fill="url(#lab-sweep)" />
        </g>

        {/* Match dots — hand-positioned for clean geometry across the four
            quadrants. Slight radius variation so they don't sit on one ring. */}
        <circle cx="32"  cy="-26" r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '0s' }} />
        <circle cx="-20" cy="-52" r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '5.4s' }} />
        <circle cx="56"  cy="34"  r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '1.0s' }} />
        <circle cx="-44" cy="22"  r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '4.0s' }} />
        <circle cx="14"  cy="58"  r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '2.4s' }} />
        <circle cx="-58" cy="-30" r="3.4" fill="#f2ead8" opacity="0.85" style={{ animation: props.active ? 'lab-dot-flash 7s linear infinite' : 'none', animationDelay: '6.0s' }} />

        {/* YOU node + pulsing halo, dead-centered */}
        <circle cx="0" cy="0" r="22" fill="url(#lab-you-glow)" />
        <g style={{
          transformOrigin: '0 0',
          animation: props.active ? 'lab-you-pulse 2.6s ease-in-out infinite' : 'none',
        }}>
          <circle cx="0" cy="0" r="11" fill="#a5b4fc" opacity="0.18" />
        </g>
        <circle cx="0" cy="0" r="5" fill="#f2ead8" />
      </svg>
    </div>
  )
}

export function LabPromo(props: LabPromoProps) {
  var [fp, setFp] = useState<Footprint | null>(null)
  // V11.17.40 — log 'shown' once per mount-becomes-active so the
  // server-side cap counts correctly. Using a ref guards against
  // double-fire across React-strict-mode or rapid isActive toggles.
  var shownLoggedRef = useRef(false)

  useEffect(function () {
    if (!props.isActive) return
    if (fp) return
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

  // V11.17.40 — fire-and-forget 'shown' telemetry on activation.
  // Kept in a separate effect so it doesn't gate on footprint load
  // (we want the impression counted even if /footprint times out).
  useEffect(function () {
    if (!props.isActive) return
    if (shownLoggedRef.current) return
    shownLoggedRef.current = true
    logLabPromoEvent('shown').catch(function () { /* swallow */ })
  }, [props.isActive])

  function handleCtaClick() {
    // Fire-and-forget; don't block navigation on telemetry.
    logLabPromoEvent('clicked').catch(function () { /* swallow */ })
  }

  var headline = pickHeadline(fp)

  return (
    <div className="h-full w-full relative overflow-hidden bg-gray-950" role="article" aria-label="Promotion: Lab subscription">
      {/* Top-left context pill — feed-context flag */}
      <div className="absolute top-3 left-3 z-20">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-400/30 text-[10px] font-display font-semibold uppercase tracking-wider text-indigo-200">
          From Paradocs
        </span>
      </div>

      {/* Gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-gray-950 to-purple-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_22%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_78%,rgba(168,85,247,0.12),transparent_55%)]" />

      {/* V11.17.39 Round 5 — even tighter vertical rhythm + custom Radar
          teaser. Operator's iteration 3 showed the card still butted
          against the mobile tab-bar. New budget (iPhone 14 Pro ~770pt
          usable above tab-bar):
            top inset ~46 + wordmark 44 + 4 + radar 140 + 12 + headline
            ~44 + 28 + benefit rows ~96 + mt-auto + CTA group ~75 + bottom
            reserve ~110 ≈ 600pt. Comfortable. */}
      <div className={
        'relative z-10 h-full flex flex-col items-center px-5 sm:px-8 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+2rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+8px)] md:pb-6 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Lab wordmark */}
        <h2 className="font-brand text-[44px] sm:text-[54px] leading-none text-[#f2ead8] tracking-tight">
          Lab
        </h2>

        {/* Stylized Radar teaser — pure SVG, brand-tuned palette */}
        <div className="mt-1 mb-3 flex items-center justify-center">
          <RadarTeaser active={props.isActive} size={140} />
        </div>

        {/* Headline + sub-line */}
        <div className="text-center max-w-sm">
          <h3 className="font-display font-semibold text-[#f2ead8] text-[19px] leading-[1.2]">
            {headline}
          </h3>
          <p className="font-display font-normal text-[#f2ead8]/70 text-[13.5px] mt-1.5 leading-snug">
            {SUB_HEADLINE}
          </p>
        </div>

        {/* Hairline-divided benefit rows */}
        <div className="w-full max-w-sm mt-3.5 border-t border-b border-[#f2ead8]/12">
          {BENEFITS.map(function (b, i) {
            var isLast = i === BENEFITS.length - 1
            return (
              <div
                key={i}
                className={
                  'flex items-baseline justify-between py-2 px-1 ' +
                  (isLast ? '' : 'border-b border-[#f2ead8]/10')
                }
              >
                <span className="font-display font-medium text-[12.5px] text-[#f2ead8]">{b.text}</span>
                <span className="font-display font-medium text-[9.5px] uppercase tracking-[0.16em] text-[#f2ead8]/45 whitespace-nowrap pl-3">
                  {b.tab}
                </span>
              </div>
            )
          })}
        </div>

        {/* CTA — anchored to bottom via mt-auto */}
        <div className="mt-auto pt-4 text-center w-full">
          <Link
            href="/pricing"
            onClick={handleCtaClick}
            className="inline-flex items-center justify-center px-9 py-3 bg-[#f2ead8] hover:bg-white text-[#1e1b4b] rounded-full font-display font-semibold text-[14px] transition-colors"
          >
            Start 7-day free trial
          </Link>
          <p className="font-display font-normal text-[11px] text-[#f2ead8]/50 mt-2">
            Then $5.99/mo · Cancel anytime
          </p>
        </div>
      </div>
    </div>
  )
}
