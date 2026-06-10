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
import { ArrowRight, Compass } from 'lucide-react'
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
//
// V11.18.16 — Fix 4. Apple-aligned polish. The "Your account, set
// against the archive" sub-line read as corporate marketing copy
// against the Apple Health / Apple News register the founder is
// chasing. We now compose the sub-line from the user's actual state
// ("4 reports this week · 12 on record") via composeSubline() so the
// surface earns its space with concrete numbers instead of abstract
// promises. Anonymous + zero-save cases fall back to the original
// abstract line.
var SUB_HEADLINE_DEFAULT = 'Your record, set against the archive.'
function composeSubline(payload: RecentSavesPayload | null): string {
  if (!payload || !payload.signedIn) return SUB_HEADLINE_DEFAULT
  var n = payload.savedCount7d || 0
  if (n === 0) return SUB_HEADLINE_DEFAULT
  if (n === 1) return 'Your record · 1 report this week'
  return 'Your record · ' + n + ' reports this week'
}

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
          // V11.18.16 — Fix 3. Be louder on non-2xx so the founder's
          // DevTools surfaces 401/500 instead of silently empty.
          // Defensive fallback: treat as anonymous so the empty-state
          // chip renders. The card never has a void.
          console.warn('[LabPromo] recent-saves response not ok', {
            status: r.status,
            statusText: r.statusText,
            hadToken: !!token,
          })
          if (!cancelled) setData({ signedIn: false, savedCount7d: 0, saves: [] })
          return
        }
        var j = await r.json()
        if (cancelled) return
        var payload: RecentSavesPayload = {
          signedIn: !!j.signedIn,
          savedCount7d: Number(j.savedCount7d) || 0,
          saves: Array.isArray(j.saves) ? j.saves as RecentSaveChip[] : [],
        }
        // V11.18.16 — Fix 3. Founder reported a "headline says 4 saved,
        // chip stack shows empty" mismatch on /discover?preview_labpromo=1.
        // Surface the response shape so the exact cause is visible in
        // DevTools and is a real datapoint after the V11.18.16 API patch.
        console.log('[LabPromo] recent-saves response', {
          signedIn: payload.signedIn,
          savedCount7d: payload.savedCount7d,
          saves: payload.saves.length,
        })
        setData(payload)
      } catch (e: any) {
        console.warn('[LabPromo] recent-saves threw', { message: e?.message || String(e) })
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
  // V11.18.16 — Fix 3. The empty-state chip should ONLY render when the
  // user genuinely has zero saves in the 7-day window. Before V11.18.16
  // a recent-saves response that returned `savedCount7d > 0` but
  // `saves: []` (e.g. PostgREST FK embed mis-name dropping every row,
  // or a transient 401) would still render the "Start saving reports to
  // fill your record" empty-state chip — directly contradicting the
  // "You've saved N reports this week" headline above. Now the chip
  // stack only falls to the empty state when savedCount7d is also 0.
  // When savedCount7d > 0 but saves is empty, the substance slab shows
  // a "filling in…" placeholder + a diagnostic warn so the operator
  // can see the gap in DevTools without breaking the card surface.
  var savedCount = (data && data.savedCount7d) || 0
  var showEmptyState = visibleSaves.length === 0 && savedCount === 0
  var showFallbackPlaceholder = visibleSaves.length === 0 && savedCount > 0
  React.useEffect(function () {
    if (!data) return
    var source: 'primary' | 'fallback' | 'empty' = visibleSaves.length > 0
      ? 'primary'
      : (savedCount > 0 ? 'fallback' : 'empty')
    console.log('[LabPromo] chip-stack render', {
      source: source,
      count: visibleSaves.length,
      savedCount7d: savedCount,
      signedIn: data.signedIn,
    })
  }, [data])

  return (
    <div
      className="h-full w-full relative overflow-hidden bg-gray-950"
      role="article"
      aria-label="Promotion: My Record"
    >
      {/* Gradient background — kept as the one card-surface tell that
          this is the promo surface (intentional divergence per panel
          §5.2). Restrained palette per Helena copy-for-visuals pass.
          V11.18.16 — Fix 4. Apple-aligned polish: add a top-to-bottom
          subtle darkening overlay so the card has a felt-depth gradient
          (Apple News / Apple Music story-card pattern) rather than a
          flat dark slab. The two radial-gradients stay as the brand-
          purple glow accents. */}
      <div className="absolute inset-0 bg-gradient-to-br from-indigo-950/60 via-gray-950 to-purple-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_22%,rgba(99,102,241,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_78%_78%,rgba(168,85,247,0.12),transparent_55%)]" />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/35" />

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
          {composeSubline(data)}
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
            // V11.18.16 — Fix 4. Apple-aligned polish: dashed border,
            // inline CTA-as-affordance ("Save your first report →"), and
            // a slight gradient lift for visual presence. The empty-state
            // chip is the entry-level case for cold users — it should
            // feel like an open envelope, not a closed dead-end.
            <Link
              href="/discover"
              className={
                'mt-3 flex items-center justify-between gap-3 rounded-lg ' +
                'border border-dashed border-[#f2ead8]/35 ' +
                'bg-gradient-to-br from-[#f2ead8]/[0.07] to-[#f2ead8]/[0.025] ' +
                'px-3.5 py-3 hover:from-[#f2ead8]/[0.10] hover:to-[#f2ead8]/[0.04] ' +
                'transition-colors'
              }
            >
              <p className="font-display text-[13px] text-[#f2ead8]/85 leading-snug">
                Save your first report
              </p>
              <ArrowRight className="w-4 h-4 text-[#f2ead8]/70 shrink-0" />
            </Link>
          ) : showFallbackPlaceholder ? (
            // V11.18.16 — Fix 3. Headline says N>0 saved, but the chip-
            // resolution missed (PostgREST FK mismatch, transient 401,
            // etc). Render a quiet placeholder instead of contradicting
            // the headline with the empty-state CTA. The diagnostic
            // chip-stack render log above will surface the gap to the
            // operator.
            <Link
              href="/lab"
              className={
                'mt-3 flex items-center justify-between gap-3 rounded-lg ' +
                'border border-[#f2ead8]/18 bg-[#f2ead8]/[0.045] ' +
                'px-3.5 py-3 hover:bg-[#f2ead8]/[0.07] transition-colors'
              }
            >
              <p className="font-display text-[13px] text-[#f2ead8]/80 leading-snug">
                {savedCount === 1
                  ? '1 report on record'
                  : savedCount + ' reports on record'}
              </p>
              <ArrowRight className="w-4 h-4 text-[#f2ead8]/65 shrink-0" />
            </Link>
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
        {/* V11.18.16 — Fix 4. Apple-aligned polish:
              - Compass icon prefixes "Open My Record" so the chevron
                feels like a destination affordance, not just an arrow.
              - Pricing caption demoted to text-[10.5px] / 45% opacity
                so it doesn't compete with the CTA. */}
        <div className="mt-auto pt-5 border-t border-[#f2ead8]/15">
          <Link
            href="/lab"
            onClick={handleCtaClick}
            className={
              'inline-flex items-center gap-2 ' +
              'font-display font-semibold text-[15px] sm:text-[16px] text-[#f2ead8] ' +
              'hover:text-white transition-colors min-h-[44px] -my-2 py-2'
            }
          >
            <Compass className="w-[15px] h-[15px] opacity-90" />
            Open My Record
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-1 font-display font-normal text-[10.5px] text-[#f2ead8]/45 leading-snug">
            Free to start · $5.99/mo after 7 days.
          </p>
        </div>
      </div>
    </div>
  )
}
