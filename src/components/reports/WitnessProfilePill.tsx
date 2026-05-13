'use client'

/**
 * WitnessProfilePill — V10.7.A.2
 *
 * Compact pill row beneath the credibility band on /report/[slug].
 * Renders the AI-extracted witness_profile JSONB (set by V10.7.A.1
 * during ingestion) as a horizontal sequence of clickable chips.
 *
 * Example:
 *   👤  19 · Female · Student · Meditating · Alone
 *
 * Each chip links to /explore?<dimension>=<value> so the user can
 * pivot to "show me all reports with this dimension". The /explore
 * filters don't exist yet for every dimension — this is
 * forward-compatible the same way V10.6.28's lens chips were.
 *
 * Display rules:
 *   - Hide the whole component when profile is null
 *   - Hide the whole component when confidence < 0.4 (too speculative)
 *   - Hide individual chips when their value is 'unspecified' / null
 *   - Hide when ZERO chips would render (all fields unspecified)
 *
 * No PII surfaces here — all values are bucketed enums from the
 * V10.7.A.0 schema. Even the labels are display strings, never raw
 * source text.
 */

import React from 'react'
import Link from 'next/link'
import { User } from 'lucide-react'
import type { WitnessProfile } from '@/lib/services/witness-profile.service'

interface Props {
  profile?: WitnessProfile | null
  className?: string
}

// ── Display mappings ────────────────────────────────────────
//
// The raw enum values from the JSONB are lowercase snake_case
// (machine-friendly). The UI surfaces a human-readable label.
// Anything not in these maps is dropped — extra safety against
// future schema drift sneaking into the UI.

const AGE_LABELS: Record<string, string> = {
  'child': 'Child',
  'teen': 'Teen',
  '18-29': '18–29',
  '30-49': '30–49',
  '50-69': '50–69',
  '70+': '70+',
}

const GENDER_LABELS: Record<string, string> = {
  'female': 'Female',
  'male': 'Male',
  'nonbinary': 'Nonbinary',
}

const OCCUPATION_LABELS: Record<string, string> = {
  'student': 'Student',
  'military_vet': 'Military / veteran',
  'medical': 'Medical',
  'first_responder': 'First responder',
  'aviation': 'Aviation',
  'tradesperson': 'Tradesperson',
  'office': 'Office worker',
  'retired': 'Retired',
  'other': 'Other occupation',
}

const STATE_LABELS: Record<string, string> = {
  'awake_alert': 'Awake & alert',
  'meditation': 'Meditating',
  'drowsy_falling_asleep': 'Drowsy / falling asleep',
  'sleeping': 'Sleeping',
  'driving': 'Driving',
  'physical_activity': 'Active',
  'intoxicated': 'Intoxicated',
}

// V10.7 — confidence floor below which we suppress display.
// 0.4 was the V10.7.A.0 plan threshold; backfill spot-check
// showed most rows landing 0.65+, so this only catches the
// "very sparse source, AI guessing" tail.
const CONFIDENCE_FLOOR = 0.4

interface Chip {
  label: string
  href: string | null
  title: string
}

function buildChips(profile: WitnessProfile): Chip[] {
  const chips: Chip[] = []

  if (profile.age_range && profile.age_range !== 'unspecified' && AGE_LABELS[profile.age_range]) {
    chips.push({
      label: AGE_LABELS[profile.age_range],
      href: '/explore?witness_age=' + encodeURIComponent(profile.age_range),
      title: 'Show reports from witnesses in this age range',
    })
  }

  if (profile.gender && profile.gender !== 'unspecified' && GENDER_LABELS[profile.gender]) {
    chips.push({
      label: GENDER_LABELS[profile.gender],
      href: '/explore?witness_gender=' + encodeURIComponent(profile.gender),
      title: 'Show reports from witnesses of this gender',
    })
  }

  if (profile.occupation_category && profile.occupation_category !== 'unspecified' && OCCUPATION_LABELS[profile.occupation_category]) {
    chips.push({
      label: OCCUPATION_LABELS[profile.occupation_category],
      href: '/explore?witness_occupation=' + encodeURIComponent(profile.occupation_category),
      title: 'Show reports from witnesses with this occupation',
    })
  }

  if (profile.state_at_event && profile.state_at_event !== 'unspecified' && STATE_LABELS[profile.state_at_event]) {
    chips.push({
      label: STATE_LABELS[profile.state_at_event],
      href: '/explore?witness_state=' + encodeURIComponent(profile.state_at_event),
      title: 'Show reports where the witness was in this state',
    })
  }

  // with_others is a chip but not (yet) a filter — the binary
  // dimension is more useful as a within-corpus stat than a
  // discrete filter. Render without href.
  if (profile.with_others === true) {
    chips.push({
      label: 'With others',
      href: null,
      title: 'The source describes other witnesses present at the experience',
    })
  } else if (profile.with_others === false) {
    chips.push({
      label: 'Alone',
      href: null,
      title: 'The source describes the witness as alone during the experience',
    })
  }

  return chips
}

export default function WitnessProfilePill({ profile, className }: Props) {
  if (!profile) return null
  if (typeof profile.confidence === 'number' && profile.confidence < CONFIDENCE_FLOOR) return null

  const chips = buildChips(profile)
  if (chips.length === 0) return null

  return (
    <div
      className={
        'mb-5 flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[12px] leading-tight ' +
        (className || '')
      }
      aria-label="Witness profile"
    >
      <span className="inline-flex items-center justify-center w-5 h-5 rounded-md bg-purple-600/15 border border-purple-500/30 flex-shrink-0">
        <User className="w-3 h-3 text-purple-200/90" aria-hidden="true" />
      </span>
      {chips.map((chip, i) => {
        const inner = (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-gray-800/60 border border-gray-700 text-gray-300 hover:text-white transition-colors">
            {chip.label}
          </span>
        )
        if (chip.href) {
          return (
            <Link
              key={i}
              href={chip.href}
              title={chip.title}
              className="hover:no-underline"
            >
              {inner}
            </Link>
          )
        }
        return (
          <span key={i} title={chip.title}>
            {inner}
          </span>
        )
      })}
    </div>
  )
}
