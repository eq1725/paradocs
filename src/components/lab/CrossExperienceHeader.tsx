'use client'

// V11.17.69 - Tier 2B
//
// CrossExperienceHeader — the n≥2 aggregated header strip per
// LAB_PANEL_REVIEW_V2 §2 and V3 §3.
//
// Renders ONLY when the user has 2+ submitted experiences. Surfaces a
// short documentary-voice summary of the BODY OF WORK (not the most
// recent submission alone), in the same register as the Hints copy.
//
// Concrete examples from the panel:
//   - 2-4 experiences: "Three experiences spanning 1998-2014. Two
//     share a Robeson County radius; all three are night-time
//     accounts."
//   - 5+ experiences: "Across five experiences from 1991 to 2014, the
//     throughline is night-time observation in Robeson County. Three
//     describe a triangular or V-shape. Two are family-shared events."
//
// Computation philosophy: we compute the signals client-side from the
// user's own report rows already loaded by useLabData / MyRecordTab.
// No new RPC needed for the MVP — just basic groupings (decade range,
// dominant phen family, recurring location anchor, hour-of-day band
// concentration).
//
// Tier-depth gates (V3 §2):
//   - Free: this header appears at n≥2 with the basic body-of-work
//     paragraph.
//   - Basic: + cross-experience patterns (3-of-N callouts), refresh
//     weekly.
//   - Pro: + lens bar with filter affordances at n≥15.

import React, { useMemo } from 'react'
import { Layers } from 'lucide-react'

interface ExperienceLite {
  id: string
  category: string | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  event_date?: string | null
  /** ISO timestamp or "HH:MM" — used for hour-of-day clustering. */
  event_time?: string | null
}

interface CrossExperienceHeaderProps {
  experiences: ExperienceLite[]
  tier?: 'free' | 'basic' | 'pro' | null
  /**
   * Optional click handler when the user taps "Filter & lens" affordance
   * (visible only at n≥15 for Pro tier in the matrix). Wire-up deferred
   * to Tier 3 — Pro Dossier filter affordance.
   */
  onOpenLensBar?: () => void
}

function yearOf(iso: string | null | undefined): number | null {
  if (!iso) return null
  var y = new Date(iso).getFullYear()
  if (isNaN(y) || y < 1800 || y > 2200) return null
  return y
}

function hourOf(timeOrIso: string | null | undefined): number | null {
  if (!timeOrIso) return null
  if (/^\d{1,2}:\d{2}/.test(timeOrIso)) {
    return parseInt(timeOrIso.split(':')[0], 10)
  }
  var d = new Date(timeOrIso)
  if (isNaN(d.getTime())) return null
  return d.getHours()
}

function locationAnchor(e: ExperienceLite): string {
  var parts = [e.city, e.state_province].filter(Boolean) as string[]
  if (parts.length > 0) return parts.join(', ')
  return e.country || ''
}

function categoryLabel(slug: string | null | undefined): string {
  if (!slug) return 'unspecified'
  if (slug === 'ufos_aliens') return 'UFO'
  if (slug === 'ghosts_hauntings') return 'apparition'
  if (slug === 'cryptids') return 'cryptid encounter'
  if (slug === 'psychic_phenomena') return 'psychic'
  if (slug === 'consciousness_practices') return 'consciousness'
  if (slug === 'perception_sensory') return 'perception'
  if (slug === 'religion_mythology') return 'mythological'
  if (slug === 'esoteric_practices') return 'esoteric'
  return slug.replace(/_/g, ' ')
}

function buildBodyOfWorkSentence(experiences: ExperienceLite[]): string[] {
  var sentences: string[] = []
  var n = experiences.length
  if (n < 2) return sentences

  // Year range.
  var years = experiences.map(function (e) { return yearOf(e.event_date) }).filter(function (y) { return y != null }) as number[]
  var yearMin = years.length > 0 ? Math.min.apply(null, years) : null
  var yearMax = years.length > 0 ? Math.max.apply(null, years) : null

  // Dominant category.
  var catCounts: Record<string, number> = {}
  experiences.forEach(function (e) {
    var c = e.category || 'unspecified'
    catCounts[c] = (catCounts[c] || 0) + 1
  })
  var sortedCats = Object.keys(catCounts).sort(function (a, b) { return catCounts[b] - catCounts[a] })
  var topCat = sortedCats[0]

  // Recurring location anchor.
  var locCounts: Record<string, number> = {}
  experiences.forEach(function (e) {
    var loc = locationAnchor(e)
    if (loc) locCounts[loc] = (locCounts[loc] || 0) + 1
  })
  var sharedLoc = Object.keys(locCounts).find(function (k) { return locCounts[k] >= 2 })

  // Hour-of-day concentration: count experiences in night band 21-04.
  var nightCount = experiences.filter(function (e) {
    var h = hourOf(e.event_time)
    if (h == null) return false
    return h >= 21 || h <= 4
  }).length

  // Sentence 1 — span + count.
  if (yearMin != null && yearMax != null && yearMin !== yearMax) {
    sentences.push(
      n + ' experiences spanning ' + yearMin + '–' + yearMax + '.'
    )
  } else if (yearMin != null) {
    sentences.push(n + ' experiences anchored in ' + yearMin + '.')
  } else {
    sentences.push(n + ' experiences in your record.')
  }

  // Sentence 2 — dominant pattern or shared location.
  var clauses: string[] = []
  if (sharedLoc && locCounts[sharedLoc] >= 2) {
    clauses.push(
      locCounts[sharedLoc] + ' of your ' + n + ' accounts share a recurring location anchor near ' + sharedLoc
    )
  }
  if (topCat && catCounts[topCat] >= 2) {
    clauses.push(
      catCounts[topCat] + ' of your ' + n + ' accounts are ' + categoryLabel(topCat) + ' reports'
    )
  }
  if (nightCount >= 2) {
    clauses.push(
      nightCount + ' of your ' + n + ' accounts are night-time observations'
    )
  }
  if (clauses.length > 0) {
    sentences.push(clauses.slice(0, 2).join('; ') + '.')
  }

  return sentences
}

export default function CrossExperienceHeader(props: CrossExperienceHeaderProps) {
  var bodySentences = useMemo(function () { return buildBodyOfWorkSentence(props.experiences) }, [props.experiences])
  var n = props.experiences.length

  if (n < 2) return null

  // n=15+ surfaces the filter/lens bar affordance per V3 §2.
  var showLensBar = n >= 15

  return (
    <section
      aria-label="Across your experiences — the body of work"
      className="rounded-2xl border border-purple-800/40 bg-gradient-to-br from-purple-950/25 via-gray-950/40 to-gray-950/40 p-4 sm:p-5"
    >
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <Layers className="w-3 h-3 text-purple-300" />
          <span className="text-[10px] font-semibold tracking-[0.22em] uppercase text-purple-300">
            Across your record
          </span>
        </div>
        <span className="text-[10px] text-gray-500">
          {n} experiences shared
        </span>
      </div>

      <div className="space-y-1.5">
        {bodySentences.length > 0 ? (
          bodySentences.map(function (s, i) {
            return (
              <p key={i} className="text-sm text-gray-200 leading-relaxed">
                {s}
              </p>
            )
          })
        ) : (
          <p className="text-sm text-gray-300 leading-relaxed">
            {n} experiences in your record. As you add details (location,
            time of day, phenomenon family), this strip will surface the
            patterns across them.
          </p>
        )}
      </div>

      {props.tier === 'free' && (
        <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
          Basic adds a weekly body-of-work refresh, cross-experience pattern
          callouts, and depth on every comparative surface.
        </p>
      )}

      {showLensBar && (
        <div className="mt-4 pt-3 border-t border-purple-800/30 flex items-center justify-between gap-2">
          <p className="text-[11px] text-gray-400">
            Your record is dense enough for a filter + lens bar.
          </p>
          <button
            type="button"
            onClick={props.onOpenLensBar}
            className="text-[11px] font-semibold uppercase tracking-widest text-purple-300 hover:text-purple-200 transition-colors"
          >
            Open filters &rsaquo;
          </button>
        </div>
      )}
    </section>
  )
}
