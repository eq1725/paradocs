'use client'

/**
 * LabPromo — V11.18.12 Sprint 1E redesign
 *
 * Memo: docs/TODAY_SPECIAL_CARDS_REDESIGN.md §4
 *
 * Sprint 1E (this rev) replaces the V5-era marketing surface with the
 * documentary-register treatment the cross-card panel locked in:
 *
 *   - HERO: keep "My Record" wordmark + state-aware headline ladder.
 *     Sub-line replaced from the workshop-vocabulary
 *     "The pattern is already there. My Record places your account
 *     inside it." to the cleaner one-sentence
 *     "Your account, set against the archive."
 *   - SUBSTANCE: replace the 140px RADAR sphere + 3-item corporate
 *     value-prop list with a "YOUR RECORD SO FAR" chip stack — 3-4 of
 *     the user's most-recently saved reports. When the user has 0
 *     saves the slab swaps to a single empty-state chip
 *     ("Start saving reports to fill your record"). When the user
 *     has 1-3 saves we show what they have; 4+ we show the most
 *     recent 4. The chips are tap targets to the report page.
 *   - ACTION: replace the cream-pill "Start 7-day free trial" with a
 *     chevron-style "Open My Record →" + a quiet pricing caption
 *     ("Free to start · $5.99/mo after 7 days"). The cream pill was
 *     the Today feed's only marketing-y mass; the chevron + caption
 *     keeps the offer present without making it the visual lead.
 *   - Drops "FROM PARADOCS" pill — the wordmark already identifies.
 *   - Founder taste call #1: chevron treatment over cream pill (Lucia
 *     dissent recorded — wanted A/B; founder picked the documentary
 *     register).
 *   - Founder taste call #3: engage primary, convert secondary — the
 *     chevron action is "Open My Record" not "Start free trial". The
 *     destination is /lab (not /pricing), because the panel surveyed
 *     that the user converts from there with better intent.
 *
 * V11.17.40 — preserved fire-and-forget impression telemetry. Logs
 * 'shown' once per mount-becomes-active; logs 'clicked' on the action
 * tap before navigation. Both calls are fire-and-forget; navigation
 * never blocks on telemetry.
 *
 * SWC compliant: var + function() per repo convention.
 */

import React, { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
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

interface RecentSaveChip {
  id: string
  slug: string
  title: string
  location_short: string | null
  date_short: string | null
}

interface RecentSavesPayload {
  signedIn: boolean
  savedCount7d: number
  saves: RecentSaveChip[]
}

// V11.18.12 — Sprint 1E. State-aware headline ladder per panel §4.4.
// Three states:
//   - savedCount7d >= 4: count-aware "The catalogue can tell you why."
//   - savedCount7d 1-3:  count-aware with N saved
//   - savedCount7d 0:    onboarding-style "Start your record."
//
// Anonymous viewers fall into the 0-saves branch — the offer is "start
// your record," same surface as a signed-in user with zero saves.
function pickHeadline(payload: RecentSavesPayload | null): string {
  if (!payload || !payload.signedIn) {
    return 'Start your record. The catalogue can tell you why.'
  }
  var n = payload.savedCount7d || 0
  if (n >= 4) {
    return 'You’ve saved ' + n + ' reports this week. The catalogue can tell you why.'
  }
  if (n >= 1) {
    var noun = n === 1 ? 'report' : 'reports'
    return 'You’ve saved ' + n + ' ' + noun + ' this week. The catalogue can tell you why.'
  }
  return 'Start your record. The catalogue can tell you why.'
}

// V11.18.12 — Sprint 1E. Helena-cleared sub-line. Replaces the two-
// sentence workshop vocabulary
// ("The pattern is already there. My Record places your account inside it.")
// with one austere documentary sentence.
var SUB_HEADLINE = 'Your account, set against the archive.'

export function LabPromo(props: LabPromoProps) {
  var [data, setData] = useState<RecentSavesPayload | null>(null)
  // V11.17.40 — log 'shown' once per mount-becomes-active.
  var shownLoggedRef = useRef(false)

  useEffect(function () {
    if (!props.isActive) return
    if (data) return
    var cancelled = false
    async function load() {
      try {
        var sessionResult = await supabase.auth.getSession()
        var token = sessionResult.data.session?.access_token || ''
        var headers: any = {}
        if (token) headers.Authorization = 'Bearer ' + token
        var r = await fetch('/api/lab/recent-saves', { headers })
        if (!r.ok) {
          // Defensive fallback: treat as anonymous so the empty-state
          // chip renders. The card never has a void.
          if (!cancelled) setData({ signedIn: false, savedCount7d: 0, saves: [] })
          return
        }
        var j = await r.json()
        if (cancelled) return
        setData({
          signedIn: !!j.signedIn,
          savedCount7d: Number(j.savedCount7d) || 0,
          saves: Array.isArray(j.saves) ? j.saves as RecentSaveChip[] : [],
        })
      } catch (_e) {
        if (!cancelled) setData({ signedIn: false, savedCount7d: 0, saves: [] })
      }
    }
    load()
    return function () { cancelled = true }
  }, [props.isActive])

  // V11.17.40 — fire-and-forget 'shown' telemetry on activation.
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

  var headline = pickHeadline(data)
  var saves: RecentSaveChip[] = (data && data.saves) || []
  // Chip stack capacity is 4. We rely on the API to cap; defensive .slice.
  var visibleSaves = saves.slice(0, 4)
  var showEmptyState = visibleSaves.length === 0

  return (
    <div
      className="h-full w-full relative overflow-hidden bg-gray-950"
      role="article"
      aria-label="Promotion: My Record"
    >
      {/* Gradient background — kept as the one card-surface tell that
          this is the promo surface (intentional divergence per panel
          §5.2). Restrained palette per Helena copy-for-visuals pass. */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-gray-950 to-purple-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_22%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_78%,rgba(168,85,247,0.12),transparent_55%)]" />

      <div className={
        'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+2rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+1rem)] md:pb-6 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* HERO ZONE — Sprint 1E.
            My Record wordmark + state-aware headline + austere sub-line.
            "FROM PARADOCS" pill dropped per panel §5.2 (the wordmark
            already identifies). */}
        <h2 className="font-brand text-[40px] sm:text-[48px] leading-none text-[#f2ead8] tracking-tight">
          My Record
        </h2>

        <h3 className="mt-5 font-display font-semibold text-[#f2ead8] text-[20px] sm:text-[22px] leading-[1.2] max-w-[22ch]">
          {headline}
        </h3>
        <p className="mt-2 font-display font-normal text-[#f2ead8]/75 text-[13.5px] leading-snug max-w-[28ch]">
          {SUB_HEADLINE}
        </p>

        {/* SUBSTANCE ZONE — Sprint 1E NEW. "YOUR RECORD SO FAR" chip
            stack. Empty-state chip when the user has zero saves so the
            card never has a void.

            The label sits above a thin hairline rule; chips are
            stacked, separated by hairlines, with a slightly warmer
            border-color than the FindingCard slab so the surface
            reads as the user's-own-stuff (not the catalogue). */}
        <div className="mt-6 max-w-[34ch]">
          <div className="text-[10px] sm:text-[10.5px] font-sans font-semibold uppercase tracking-[0.22em] text-[#f2ead8]/75 pb-1.5 border-b border-[#f2ead8]/22 inline-block">
            Your record so far
          </div>

          {showEmptyState ? (
            <div className="mt-3 rounded-lg border border-[#f2ead8]/18 bg-[#f2ead8]/[0.045] px-3.5 py-3">
              <p className="font-display text-[13px] text-[#f2ead8]/80 leading-snug">
                Start saving reports to fill your record.
              </p>
            </div>
          ) : (
            <ul className="mt-3 rounded-lg border border-[#f2ead8]/18 bg-[#f2ead8]/[0.035] divide-y divide-[#f2ead8]/14 overflow-hidden">
              {visibleSaves.map(function (s) {
                return (
                  <li key={s.id}>
                    <Link
                      href={'/report/' + encodeURIComponent(s.slug || s.id)}
                      className="block px-3.5 py-2.5 hover:bg-[#f2ead8]/[0.06] transition-colors"
                    >
                      <div className="text-[13px] text-[#f2ead8] leading-snug font-medium line-clamp-1">
                        {s.title || 'Untitled account'}
                      </div>
                      {(s.location_short || s.date_short) && (
                        <div className="mt-0.5 text-[11px] text-[#f2ead8]/55 tabular-nums truncate">
                          {s.location_short && <span>{s.location_short}</span>}
                          {s.location_short && s.date_short && <span className="text-[#f2ead8]/35"> · </span>}
                          {s.date_short && <span>{s.date_short}</span>}
                        </div>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* ACTION ZONE — Sprint 1E.
            Chevron "Open My Record →" replaces the cream-pill 7-day
            trial CTA. Pricing caption beneath the action keeps the
            offer present per Lucia's dissent compromise.

            Destination is /lab (engage primary, convert secondary —
            founder taste call #3). The /lab surface itself routes
            non-Basic users into the paywall when they hit gated
            features; that's the right surface for the conversion ask,
            not the Today feed promo. */}
        <div className="mt-auto pt-5 border-t border-[#f2ead8]/15">
          <Link
            href="/lab"
            onClick={handleCtaClick}
            className={
              'inline-flex items-center gap-1.5 ' +
              'font-display font-semibold text-[15px] sm:text-[16px] text-[#f2ead8] ' +
              'hover:text-white transition-colors min-h-[44px] -my-2 py-2'
            }
          >
            Open My Record
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-1 font-display font-normal text-[11.5px] text-[#f2ead8]/55 leading-snug">
            Free to start · $5.99/mo after 7 days.
          </p>
        </div>
      </div>
    </div>
  )
}
