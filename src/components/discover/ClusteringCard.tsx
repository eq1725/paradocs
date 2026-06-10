'use client'

/**
 * ClusteringCard — V11.18.12 Sprint 1E redesign (panel: Sho / Mariko /
 * Helena / Lucia / Sam).
 *
 * Memo: docs/TODAY_SPECIAL_CARDS_REDESIGN.md §3
 *
 * Sprint 1E changes:
 *   - HERO: `baseline_text` ("5×") promoted to a Spotify-Wrapped-scale
 *     72px brand-purple numeric. Headline demoted to a fact-sentence
 *     under the numeric. When baseline_text is missing the hero numeric
 *     is suppressed and the headline floats up into the hero slot —
 *     the card never has a void.
 *   - SUBSTANCE: NEW "IN THIS CLUSTER" section listing 3 representative
 *     reports (title + location + relative date). Each row is its own
 *     tap target → /report/<slug>. Data comes from the API's new
 *     `representative_reports[]` field (cluster route joins on the
 *     first 3 of linked_report_ids).
 *   - ACTION: existing meta-footer kept (category · location · time +
 *     chevron).
 *   - SHARE: deliberately NOT added on the cluster card in MVP
 *     (founder taste-call locked decision #2 — share lives on
 *     FindingCard only).
 *
 * V11.17.41 prior history (kept for context):
 *   - Left-edge accent rail (4px brand-purple, ~20% opacity)
 *   - Whole-card tap target; chevron in the meta footer
 *   - Body is the API's `body` field — Haiku-synthesised when
 *     defensible, templated fallback otherwise
 *
 * Voice contract: documentary register, no second-person, no
 * exclamations. The hero numeric is the founder's "screenshottable
 * beat"; the substance list is the evidence-not-chrome that the
 * panel locked in for Zone B.
 *
 * SWC compliant: var + function() form.
 */

import React from 'react'
import { ChevronRight, ArrowRight } from 'lucide-react'

export interface ClusterRepresentativeReport {
  id: string
  slug: string
  title: string
  location_short: string | null
  date_short: string | null
}

export interface ClusterCardData {
  item_type: 'cluster'
  id: string
  cluster_type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  // V11.17.41 — Eyebrow label per panel memo. Examples:
  //   "Geographic cluster", "Recent burst", "Category trend", "Milestone"
  type_label: string
  // V11.17.41 — Headline is now the templated fact sentence
  // ("196 UFO reports from California this week."). Number is embedded
  // in the sentence; no separate numeric hero block.
  headline: string
  // V11.17.41 — Body is the "finding" sentence. v2 uses Haiku to
  // synthesise this from the linked reports' shared characteristics
  // when possible ("Most cluster around the Central Valley and the
  // coast south of Monterey."). Falls back to a quiet templated line.
  //
  // V11.18.12 — Sprint 1E. Demoted: the body sentence is no longer
  // rendered in the standard layout (the substance zone now carries
  // the 3-row rep-reports list). Retained on the interface so the
  // API contract is stable and so we can re-introduce body as a
  // hairline-italic fact line if a future iteration needs it.
  body: string
  // V11.17.41 — Optional baseline sentence ("Twice the usual week.")
  // V11.18.12 — Sprint 1E. PROMOTED. Parsed for the leading numeric
  // ("5×", "Twice"); the leading token becomes the Spotify-Wrapped-
  // scale hero glyph and the rest becomes the fact-line beneath it.
  // When missing, the hero numeric is suppressed entirely and the
  // headline promotes into the hero slot.
  baseline_text?: string
  // V11.17.41 — Human-readable category label ("UFOs & Aliens", not
  // the slug). Computed server-side so client doesn't need to look up
  // CATEGORY_CONFIG.
  category: string
  category_label: string
  report_count: number
  time_range: string
  location_summary?: string
  linked_report_ids: string[]
  // V11.18.12 — Sprint 1E. NEW. 3 representative reports for the
  // cluster's substance-zone list. May be empty when the join lost
  // rows (status changes, etc); the card then suppresses the section.
  representative_reports?: ClusterRepresentativeReport[]
  // V8-era field. Kept for the legacy fallback path; not rendered.
  headline_legacy?: string
  subheadline_legacy?: string
}

interface ClusteringCardProps {
  item: ClusterCardData
  isActive: boolean
}

// V11.17.41 — fallback labels if the API doesn't emit type_label (e.g.
// during the brief window between server deploy and the consumer
// receiving the new shape).
var TYPE_LABEL_FALLBACK: Record<string, string> = {
  geographic_cluster: 'Geographic cluster',
  temporal_burst: 'Recent burst',
  category_trend: 'Category trend',
  milestone: 'Milestone',
}

// V11.18.12 — Sprint 1E. Parse the baseline string into the leading
// scalar glyph + the trailing fact-line.
//   "Twice the usual week."          → { glyph: "2×", trailing: "the usual week" }
//   "5× the usual week."             → { glyph: "5×", trailing: "the usual week" }
//   "Three times the usual week."    → { glyph: "3×", trailing: "the usual week" }
//
// Returns null when the string doesn't parse to a defensible
// hero-numeric — in that case the card suppresses the hero entirely
// and the headline promotes up into the hero slot.
function parseBaseline(s: string | undefined): { glyph: string; trailing: string } | null {
  if (!s) return null
  var t = String(s).trim()
  if (t.length === 0) return null
  // Match "5× the usual week" style first.
  var mNum = t.match(/^([0-9]+(?:\.[0-9]+)?)\s*×\s*(.*?)\.?$/)
  if (mNum) {
    var n = mNum[1]
    return { glyph: n + '×', trailing: (mNum[2] || '').trim() }
  }
  // "Twice / Three times the usual week".
  var lower = t.toLowerCase()
  if (lower.indexOf('twice') === 0) {
    return { glyph: '2×', trailing: t.replace(/^twice\s+/i, '').replace(/\.$/, '').trim() }
  }
  var mTimes = lower.match(/^(three|four|five|six|seven|eight|nine|ten)\s+times\s+(.*)$/)
  if (mTimes) {
    var WORD: Record<string, string> = {
      three: '3×', four: '4×', five: '5×', six: '6×',
      seven: '7×', eight: '8×', nine: '9×', ten: '10×',
    }
    return { glyph: WORD[mTimes[1]] || '×', trailing: t.replace(/^[a-z]+\s+times\s+/i, '').replace(/\.$/, '').trim() }
  }
  // Unparseable — be conservative; suppress the hero numeric.
  return null
}

export function ClusteringCard(props: ClusteringCardProps) {
  var item = props.item
  var typeLabel = item.type_label || TYPE_LABEL_FALLBACK[item.cluster_type] || 'Cluster'
  var categoryLabel = item.category_label || item.category
  var isMilestone = item.cluster_type === 'milestone'
  var href = '/explore?category=' + encodeURIComponent(item.category)

  // V11.17.41 — Backwards-compat: older API responses may not yet
  // emit `headline` / `body` in the new shape. Fall back to the
  // legacy templated fields so the card renders sensibly during a
  // staggered deploy window.
  var displayHeadline = item.headline || item.headline_legacy || ''

  // V11.18.12 — Sprint 1E. Hero numeric parsed from baseline_text.
  var hero = parseBaseline(item.baseline_text)
  var reps = Array.isArray(item.representative_reports) ? item.representative_reports : []

  // V11.18.13 — Sprint 1E fixes. Diagnostic when the substance zone is
  // suppressed because the API returned no representative reports. The
  // founder reported the zone consistently empty during Sprint 1E QA;
  // this surfaces the cause (no representative_reports field at all vs.
  // empty array vs. some other shape mismatch) in DevTools without
  // breaking the documentary register on the rendered card.
  React.useEffect(function () {
    if (typeof window !== 'undefined' && reps.length === 0) {
      console.warn('[ClusteringCard] substance zone suppressed — no representative reports', {
        cluster_id: item.id,
        cluster_type: item.cluster_type,
        linked_count: Array.isArray(item.linked_report_ids) ? item.linked_report_ids.length : 0,
        has_reps_field: Object.prototype.hasOwnProperty.call(item, 'representative_reports'),
      })
    }
  }, [item.id])

  // V11.18.12 — Sprint 1E. The card has up to (1 + reps.length) hit
  // targets: each rep row is a real <a> to /report/<slug>; the outer
  // card click takes the user to /explore?category=<slug>. We use the
  // same outer-div-with-onClick pattern as the FindingCard rewrite so
  // nested anchors stay valid HTML.
  function onCardClick(e: React.MouseEvent) {
    if (e.defaultPrevented) return
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    if ((e as any).button && (e as any).button !== 0) return
    var a = document.createElement('a')
    a.href = href
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  function onCardKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onCardClick(e as any)
    }
  }

  return (
    <div
      onClick={onCardClick}
      onKeyDown={onCardKey}
      role="link"
      tabIndex={0}
      aria-label={typeLabel + ': ' + displayHeadline}
      // V11.18.13 — Sprint 1E fixes. Apply the same mobile-portrait
      // max-width treatment as FindingCard today_card so the two special
      // cards read as a coherent family at tablet + desktop widths. See
      // FindingCard TodayCardLayout for the rationale; both cards top
      // out at max-w-[34ch] internally, so an unconstrained outer card
      // stretches edge-to-edge with awkward whitespace gutters.
      className={
        'block h-full w-full relative overflow-hidden bg-gray-950 group cursor-pointer ' +
        'focus:outline-none focus-visible:ring-1 focus-visible:ring-purple-500/40 ' +
        'sm:max-w-lg sm:mx-auto'
      }
    >
      {/* Left-edge accent rail — single brand-purple bar, no wash.
          Identifying mark per the V11.17.41 panel memo; kept verbatim
          in Sprint 1E. */}
      <div
        className="absolute top-0 bottom-0 left-0 w-1 pointer-events-none"
        style={{ background: 'linear-gradient(to right, rgba(144,0,240,0.55), rgba(144,0,240,0))', width: '60px' }}
        aria-hidden="true"
      />
      <div
        className="absolute top-0 bottom-0 left-0 w-1 pointer-events-none"
        style={{ background: '#9000F0' }}
        aria-hidden="true"
      />

      <div className={
        'relative z-10 h-full flex flex-col px-7 sm:px-10 transition-all duration-700 ' +
        'pt-[calc(env(safe-area-inset-top,0px)+1.5rem)] pb-[calc(80px+env(safe-area-inset-bottom,0px)+1.25rem)] md:pb-8 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Eyebrow pill — corner self-identifier. Optional milestone dot. */}
        <div className="inline-flex items-center self-start gap-2 mb-5">
          {isMilestone && (
            <span
              className="inline-block w-1.5 h-1.5 rounded-full"
              style={{ background: '#9000F0' }}
              aria-hidden="true"
            />
          )}
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-purple-500/10 border border-purple-500/25 text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-purple-200/90">
            {typeLabel}
          </span>
        </div>

        {/* HERO ZONE — Sprint 1E.
            When baseline_text parses, render a 72px brand-purple glyph
            ("5×") as the dominant numeric and the headline becomes the
            fact-line beneath it. When it doesn't parse, promote the
            headline into the hero slot — the card never has a void. */}
        {hero ? (
          <>
            <div
              className="font-display font-semibold leading-none tracking-tight mb-2 max-w-[6ch]"
              style={{ color: '#9000F0', fontSize: 'clamp(56px, 18vw, 76px)' }}
              aria-label={hero.glyph + ' ' + hero.trailing}
            >
              {hero.glyph}
            </div>
            {hero.trailing && (
              <p className="font-display text-[14px] sm:text-[15px] text-gray-300/85 leading-snug mb-5 max-w-[24ch]">
                {hero.trailing}
              </p>
            )}
            <h2 className="font-display text-[20px] sm:text-[22px] font-semibold text-white leading-[1.25] tracking-[-0.005em] max-w-[24ch] mb-6">
              {displayHeadline}
            </h2>
          </>
        ) : (
          <h2 className="font-display text-[26px] sm:text-[30px] font-semibold text-white leading-[1.2] tracking-[-0.005em] max-w-[22ch] mb-6">
            {displayHeadline}
          </h2>
        )}

        {/* SUBSTANCE ZONE — Sprint 1E NEW.
            3-row representative-report list. "IN THIS CLUSTER" small-
            caps label + hairline rule + tappable rows. The whole list
            is suppressed when no rep reports are returned — the card
            then leans on the hero + headline + footer. */}
        {reps.length > 0 && (
          <div className="mb-4 max-w-[34ch]">
            <div className="text-[10px] sm:text-[10.5px] font-sans font-semibold uppercase tracking-[0.22em] text-gray-400 pb-1.5 border-b border-white/[0.18] mb-3 inline-block">
              In this cluster
            </div>
            <ul className="space-y-2">
              {reps.slice(0, 3).map(function (r) {
                return (
                  <li key={r.id}>
                    <a
                      href={'/report/' + encodeURIComponent(r.slug || r.id)}
                      onClick={function (e) { e.stopPropagation() }}
                      className={
                        'flex items-start gap-2.5 py-1.5 ' +
                        'text-gray-200 hover:text-white transition-colors'
                      }
                      aria-label={'Read the report: ' + r.title}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="text-[13.5px] sm:text-[14px] leading-snug font-medium line-clamp-1">
                          {r.title || 'Untitled account'}
                        </div>
                        {(r.location_short || r.date_short) && (
                          <div className="mt-0.5 text-[11px] text-gray-500 tabular-nums truncate">
                            {r.location_short && <span>{r.location_short}</span>}
                            {r.location_short && r.date_short && <span className="text-gray-600"> · </span>}
                            {r.date_short && <span>{r.date_short}</span>}
                          </div>
                        )}
                      </div>
                      <ArrowRight className="w-3.5 h-3.5 mt-1 text-gray-500 shrink-0" />
                    </a>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        {/* ACTION ZONE — kept from V11.17.41. */}
        <div className="mt-auto">
          <div className="border-t border-white/[0.07] pt-4 flex items-center gap-1.5 text-[12px] font-sans font-medium text-gray-400 group-hover:text-gray-200 transition-colors">
            <span className="truncate">{categoryLabel}</span>
            {item.location_summary && (
              <>
                <span className="text-gray-600">·</span>
                <span className="truncate">{item.location_summary}</span>
              </>
            )}
            <span className="text-gray-600">·</span>
            <span className="truncate">{item.time_range}</span>
            <span className="flex-1" />
            <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          </div>
        </div>
      </div>
    </div>
  )
}
