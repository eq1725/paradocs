'use client'

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

import React from 'react'
import Link from 'next/link'
import { User as UserIcon, MapPin, Calendar, Plus, ChevronRight } from 'lucide-react'
import EmptyDossier from './EmptyDossier'

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

export default function DossierHeader(props: DossierHeaderProps) {
  var n = props.experiences.length

  // n=0 — ghosted empty state.
  if (n === 0) {
    return <EmptyDossier />
  }

  var focused = props.experiences[Math.max(0, Math.min(props.focusedIdx, n - 1))]
  if (!focused) return <EmptyDossier />

  var description = (focused.description || focused.summary || '').trim()

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
              var active = i === props.focusedIdx
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
        className="rounded-2xl border border-purple-700/40 bg-gradient-to-br from-purple-950/30 via-gray-950/40 to-gray-950/60 p-5 sm:p-6"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-purple-600/30 border border-purple-500/40 flex items-center justify-center flex-shrink-0">
            <UserIcon className="w-5 h-5 text-purple-200" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold tracking-widest uppercase text-purple-300 mb-1">
              Your experience
            </p>
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
          </div>
        </div>

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
      </article>

      {/* Permanent "Add another to your record" pill — BELOW the
          dossier per V3 §3 + V2 §2 mass-market rule. */}
      <div className="flex justify-center mt-5">
        <Link
          href="/start"
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-purple-600/15 border border-purple-500/40 text-purple-200 text-sm font-medium hover:bg-purple-600/25 hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add another to your record
        </Link>
      </div>
    </section>
  )
}
