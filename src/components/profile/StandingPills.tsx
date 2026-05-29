'use client'

/**
 * StandingPills — V11.17.42
 *
 * Two text pills (Catalogue · TIER and Contribution · TIER) plus a
 * single prose progression line. Replaces the placeholder rank
 * Award-pill in profile.tsx.
 *
 * Per panel memo (docs/BADGE_SYSTEM_PANEL.md):
 *   - Inter 10 caps, letter-spaced
 *   - 1px gray-700 border, transparent fill, gray-300 text
 *   - 6px radius, generous padding
 *   - NO icon, NO color, NO progress bar, NO percentage
 *   - Optional 1px brand-purple left rule for Lab subscribers
 *
 * Prose line below pills: "Keeper since March. Next: Archivist at
 * 250 saves and one year on Paradocs." (Maya/Jordan compromise —
 * surfaces progress without a casino-style bar.)
 *
 * SWC compat: var + function() form.
 */

import React from 'react'
import { StandingDisplay, StandingProgress } from '@/lib/standing/types'

interface StandingPillsProps {
  display: StandingDisplay
  progress: {
    catalogue: StandingProgress
    contribution: StandingProgress
  } | null
}

function monthName(iso: string | null): string | null {
  if (!iso) return null
  var d = new Date(iso)
  if (isNaN(d.getTime())) return null
  // "March", "January", etc — full month name in user's locale.
  return d.toLocaleDateString(undefined, { month: 'long' })
}

function progressLine(p: StandingProgress): string {
  // "Keeper since March. Next: Archivist at 250 saves and one year on Paradocs."
  // Falls back gracefully when we don't know the since-date yet.
  var since = monthName(p.since)
  var first = since ? p.current_name + ' since ' + since + '.' : p.current_name + '.'
  if (p.next_name && p.next_requirements) {
    return first + ' Next: ' + p.next_name + ' at ' + p.next_requirements + '.'
  }
  // Top-tier — no "Next: …" follow-up.
  return first
}

function Pill(props: { axis_label: string; tier_name: string; is_lab: boolean }) {
  return (
    <span
      className={
        'inline-flex items-center gap-2 rounded-md border border-gray-700 px-3 py-1.5 ' +
        'text-[10px] font-sans font-semibold uppercase tracking-[0.14em] text-gray-300 ' +
        'bg-transparent relative overflow-hidden'
      }
    >
      {props.is_lab && (
        <span
          aria-hidden="true"
          className="absolute top-0 bottom-0 left-0"
          style={{ width: '1px', background: '#9000F0' }}
        />
      )}
      <span className="text-gray-500">{props.axis_label}</span>
      <span className="text-gray-600">·</span>
      <span>{props.tier_name}</span>
    </span>
  )
}

export function StandingPills(props: StandingPillsProps) {
  var d = props.display
  // Fallback to default names if progress isn't loaded yet.
  var catalogueName = (props.progress && props.progress.catalogue.current_name) || 'Reader'
  var contributionName = (props.progress && props.progress.contribution.current_name) || 'Witness'

  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pill axis_label="Catalogue" tier_name={catalogueName} is_lab={d.is_lab} />
        <Pill axis_label="Contribution" tier_name={contributionName} is_lab={d.is_lab} />
      </div>
      {props.progress && (
        <p className="font-display text-[13.5px] sm:text-[14px] text-gray-400 mt-2 leading-snug max-w-prose">
          {progressLine(props.progress.catalogue)}
          {' '}
          {progressLine(props.progress.contribution)}
        </p>
      )}
    </div>
  )
}

export default StandingPills
