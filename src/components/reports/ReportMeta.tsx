'use client'

/**
 * ReportMeta — V10.4 Phase 2
 *
 * The "Who · Where · When" block under the answer line. Three
 * lines max, friendly precision logic, anonymization-aware.
 *
 * Anonymization gate:
 *   - For directly-submitted reports with anonymous_submission=true
 *     (the default), or any ingested report: Witnesses roll up to
 *     counts ("a hiker", "two witnesses"). Submitter name never
 *     appears. Location resolves to city/region precision.
 *   - For directly-submitted reports with anonymous_submission=false
 *     (opted-in): submitter display name MAY appear. Real names
 *     never — only display names / usernames.
 *
 * Date precision:
 *   - exact day:  "March 12, 1998"
 *   - month:      "March 1998"
 *   - year:       "1998"
 *   - vague:      "Mid-1970s" / "Sometime in the 1990s"
 *   - unknown:    omits the When row entirely
 *
 * Location precision:
 *   - city:       "Phoenix, Arizona"
 *   - region:     "Pennsylvania, USA"
 *   - country:    "United Kingdom"
 *   - unknown:    omits the Where row entirely
 */

import React from 'react'
import { Calendar, MapPin, Users, User as UserIcon } from 'lucide-react'

export interface ReportMetaProps {
  // ── Anonymization gate ──
  /** Default true. False ONLY when a directly-submitted report opts in. */
  anonymizeSubmitter?: boolean
  /** Display name to show when anonymizeSubmitter is false. */
  submitterDisplayName?: string | null

  // ── When ──
  eventDate?: string | null      // YYYY-MM-DD, YYYY-MM, YYYY, or null
  /** Optional free-text date string if event_date wasn't structured. */
  eventDateText?: string | null

  // ── Where ──
  city?: string | null
  stateProvince?: string | null
  country?: string | null
  /** Free-text location_name override when structured fields aren't available. */
  locationName?: string | null

  // ── Who ──
  witnessCount?: number | null
  /** When this is true we explicitly mention the submitter participated. */
  submitterWasWitness?: boolean

  className?: string
}

export default function ReportMeta(props: ReportMetaProps) {
  const whenLine  = formatWhen(props)
  const whereLine = formatWhere(props)
  const whoLine   = formatWho(props)

  // V10.6.24 — Always show the When row, even when no structured date
  // is available. A blank slot in the meta block (as happened on the
  // Kansas psychic experience case where the source said "mid-December"
  // but event_date was null) reads as broken UI. Better to acknowledge
  // the uncertainty with a tiny "Date not given" affordance than to
  // silently drop the row. Mass-ingestion will produce many reports
  // with vague or missing dates; the page should handle that gracefully.
  const whenText  = whenLine || 'Date not given by source'
  const whenMuted = !whenLine

  const lines = [
    { icon: Calendar, label: 'When',  text: whenText, tint: 'text-amber-300/90', muted: whenMuted },
    whereLine && { icon: MapPin,   label: 'Where', text: whereLine, tint: 'text-emerald-300/90', muted: false },
    whoLine   && { icon: whoLine.icon, label: 'Who', text: whoLine.text, tint: 'text-cyan-300/90', muted: false },
  ].filter(Boolean) as Array<{ icon: any; label: string; text: string; tint: string; muted: boolean }>

  if (lines.length === 0) return null

  return (
    <dl className={'space-y-1.5 ' + (props.className || '')}>
      {lines.map((line, i) => {
        const Icon = line.icon
        return (
          <div key={i} className="flex items-start gap-2.5 text-sm leading-snug">
            <span className={'flex items-center gap-1.5 flex-shrink-0 w-16 ' + line.tint}>
              <Icon className="w-3.5 h-3.5" />
              <dt className="text-[10px] uppercase tracking-wider font-semibold">{line.label}</dt>
            </span>
            <dd className={(line.muted ? 'text-gray-500 italic ' : 'text-gray-200 ') + 'flex-1 min-w-0'}>
              {line.text}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}

// ── Formatting helpers ──────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
                'July', 'August', 'September', 'October', 'November', 'December']

function formatWhen(props: ReportMetaProps): string | null {
  // Prefer the structured event_date when present.
  if (props.eventDate) {
    const raw = props.eventDate.trim()
    // YYYY-MM-DD with real day
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      const [y, m, d] = raw.split('-').map(Number)
      // Sentinel placeholders we should strip: -01-01 with no
      // sub-day precision marker usually means "year only".
      if (m === 1 && d === 1) return String(y)
      const month = MONTHS[m - 1] || ''
      return month ? month + ' ' + d + ', ' + y : String(y)
    }
    // YYYY-MM
    if (/^\d{4}-\d{2}$/.test(raw)) {
      const [y, m] = raw.split('-').map(Number)
      const month = MONTHS[m - 1] || ''
      return month ? month + ' ' + y : String(y)
    }
    // Year only
    if (/^\d{4}$/.test(raw)) return raw
    // Anything else is free-form — render as-is, trimmed.
    return raw
  }
  if (props.eventDateText) return props.eventDateText.trim()
  return null
}

function formatWhere(props: ReportMetaProps): string | null {
  const parts: string[] = []
  if (props.city) parts.push(props.city)
  if (props.stateProvince) parts.push(props.stateProvince)
  if (parts.length === 0 && props.country) {
    return props.country
  }
  if (props.country && props.country !== 'United States' && props.country !== 'USA') {
    parts.push(props.country)
  }
  if (parts.length > 0) return parts.join(', ')
  return props.locationName || null
}

function formatWho(props: ReportMetaProps): { icon: any; text: string } | null {
  const wc = typeof props.witnessCount === 'number' ? props.witnessCount : null
  const opted = props.anonymizeSubmitter === false && props.submitterDisplayName

  if (opted) {
    // Direct submission, opted into non-anonymous.
    if (wc && wc > 1) {
      return { icon: UserIcon, text: props.submitterDisplayName + ' and ' + (wc - 1) + ' other' + (wc - 1 === 1 ? '' : 's') }
    }
    return { icon: UserIcon, text: props.submitterDisplayName! }
  }

  // Anonymized rendering — count-only.
  if (wc && wc > 1) {
    return { icon: Users, text: wc + ' witnesses' }
  }
  if (wc === 1 || props.submitterWasWitness) {
    return { icon: UserIcon, text: 'A single witness' }
  }
  return null
}
