'use client'

/**
 * IngestedBadge — provenance chip for indexed (non-user-submitted) reports.
 *
 * B0.3 — visual differentiation between user-submitted and ingested
 * reports per the expert panel. The tone is provenance ("indexed from")
 * NOT endorsement. Every ingested report renders this badge on every
 * card / page surface where it appears.
 *
 * Three variants:
 *   - 'compact'  — small chip for card corners, feed items (default)
 *   - 'inline'   — slightly larger, fits inside report headers
 *   - 'header'   — full "Indexed from [source] →" line with source_url link,
 *                  for use on the report-detail page
 *
 * Source-type formatting is keyed off `source_type` + `original_report_id`
 * + optional metadata (e.g. reddit's subreddit name). Unknown source
 * types render a generic "Indexed source" without a link.
 *
 * SWC: var + function() form.
 */

import React from 'react'
import { ExternalLink, Link as LinkIcon } from 'lucide-react'
import { classNames } from '@/lib/utils'

export interface IngestedSource {
  /** Required: matches reports.source_type string */
  source_type: string | null | undefined
  /** Optional: the source's own ID (e.g. NUFORC case #12345) */
  original_report_id?: string | number | null
  /** Optional: deep-link back to the source's canonical entry */
  source_url?: string | null
  /** Optional: free-form label provided by adapter (overrides default formatting) */
  source_label?: string | null
  /** Optional: adapter metadata. Reddit: { subreddit }. YouTube: { channel }. */
  metadata?: Record<string, any> | null
}

interface IngestedBadgeProps extends IngestedSource {
  variant?: 'compact' | 'inline' | 'header'
  className?: string
}

/**
 * Compute the human-readable provenance string for a given source.
 * Exported so tests + other components can use the same formatter.
 */
export function formatProvenance(source: IngestedSource): { label: string; verbose: string } {
  var st = (source.source_type || '').toLowerCase()
  var id = source.original_report_id ? String(source.original_report_id) : null
  var meta = source.metadata || {}

  // Adapter-provided label wins.
  if (source.source_label && source.source_label.trim()) {
    return { label: source.source_label.trim(), verbose: source.source_label.trim() }
  }

  switch (st) {
    case 'nuforc':
      return id
        ? { label: 'NUFORC #' + id, verbose: 'NUFORC case ' + id }
        : { label: 'NUFORC', verbose: 'NUFORC archive' }
    case 'nderf':
      return id
        ? { label: 'NDERF #' + id, verbose: 'NDERF case ' + id }
        : { label: 'NDERF', verbose: 'NDERF archive' }
    case 'oberf':
      return id
        ? { label: 'OBERF #' + id, verbose: 'OBERF case ' + id }
        : { label: 'OBERF', verbose: 'OBERF archive' }
    case 'bfro':
      return id
        ? { label: 'BFRO #' + id, verbose: 'BFRO report ' + id }
        : { label: 'BFRO', verbose: 'BFRO archive' }
    case 'iands':
      return { label: 'IANDS', verbose: 'IANDS publication' }
    case 'reddit': {
      var sub = meta.subreddit || meta.sub || null
      if (sub) {
        var subName = String(sub).replace(/^r\//, '')
        return { label: 'r/' + subName, verbose: 'Reddit · r/' + subName }
      }
      return { label: 'Reddit', verbose: 'Reddit post' }
    }
    case 'youtube': {
      var ch = meta.channel || meta.channel_name || null
      if (ch) {
        return { label: 'YouTube · ' + String(ch), verbose: 'YouTube · ' + String(ch) }
      }
      return { label: 'YouTube', verbose: 'YouTube comment' }
    }
    case 'wikipedia':
      return { label: 'Wikipedia', verbose: 'Wikipedia article' }
    case 'historical_archive':
    case 'historical':
      return { label: 'Historical record', verbose: 'Historical archive' }
    default:
      return { label: 'Indexed source', verbose: 'Indexed source' }
  }
}

export default function IngestedBadge(props: IngestedBadgeProps) {
  var variant = props.variant || 'compact'
  var prov = formatProvenance(props)
  var url = props.source_url && props.source_url.trim() ? props.source_url : null

  if (variant === 'header') {
    // Full-width line for the report-detail page header.
    return (
      <div
        className={classNames(
          'flex items-center gap-2 text-[12px] text-gray-400',
          props.className
        )}
      >
        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.04] border border-white/[0.06]">
          <LinkIcon className="w-3 h-3 text-gray-500" />
          <span className="text-gray-300">Indexed from</span>
          <span className="text-white font-medium">{prov.verbose}</span>
        </span>
        {url && (
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline"
          >
            view source
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
      </div>
    )
  }

  // compact / inline — same chip, slightly different padding.
  var pad = variant === 'inline' ? 'px-2.5 py-0.5 text-[11px]' : 'px-2 py-0.5 text-[10px]'
  var chip = (
    <span
      className={classNames(
        'inline-flex items-center gap-1 rounded-full bg-white/[0.04] border border-white/[0.06] text-gray-300 font-medium tracking-tight',
        pad,
        props.className
      )}
      title={'Indexed from ' + prov.verbose}
    >
      <LinkIcon className="w-2.5 h-2.5 text-gray-500" />
      <span>via {prov.label}</span>
    </span>
  )

  // When a URL is present, make the compact chip a click-through so card
  // surfaces don't need to wire their own link logic.
  if (url && variant !== 'inline') {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={function (e) { e.stopPropagation() }}
        className="hover:opacity-90 transition-opacity"
      >
        {chip}
      </a>
    )
  }
  return chip
}

/**
 * Convenience predicate — render IngestedBadge only when a report is
 * actually ingested. Pass the full report row (or just report_type) to
 * keep call sites declarative:
 *
 *   {isIngested(report) && <IngestedBadge {...report} variant="compact" />}
 */
export function isIngested(report: { report_type?: string | null } | null | undefined): boolean {
  return !!(report && report.report_type === 'ingested')
}
