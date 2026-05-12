'use client'

/**
 * ReportPhenomenaChips — V10.4 Phase 2
 *
 * Compact 3-chip cluster shown between the meta block and the
 * experience description. Replaces the older Related-Phenomena
 * accordion + the PatternConnections card + the tag cloud.
 *
 * Three chip categories (only show those that have content):
 *   1. Phenomenon type (e.g. "Bigfoot sighting") — tappable to
 *      a phenomenology filter page.
 *   2. Category (e.g. "Cryptids") — tappable to category filter.
 *   3. Up to 3 cross-disciplinary connections (similar_phenomena
 *      AI field) — tappable to phenomenon detail pages.
 *
 * Max 5 chips visible to keep the cluster scannable on mobile.
 */

import React from 'react'
import Link from 'next/link'
import { Sparkles, FolderOpen, Network } from 'lucide-react'

export interface ReportPhenomenaChipsProps {
  /** Friendly phenomenon-type display name. */
  phenomenonTypeName?: string | null
  /** Slug for the phenomenon-type filter page. */
  phenomenonTypeSlug?: string | null
  /** Category slug (e.g. 'cryptids'). */
  category?: string | null
  /** Category friendly label (e.g. 'Cryptids'). */
  categoryLabel?: string | null
  /** AI-generated similar phenomena names. */
  similarPhenomena?: string[]
  className?: string
}

export default function ReportPhenomenaChips(props: ReportPhenomenaChipsProps) {
  const similar = (props.similarPhenomena || [])
    .filter(s => typeof s === 'string' && s.trim().length > 0)
    .slice(0, 3)

  // Bail when there's nothing to render.
  if (!props.phenomenonTypeName && !props.category && similar.length === 0) {
    return null
  }

  return (
    <div className={'flex flex-wrap gap-2 ' + (props.className || '')}>
      {props.phenomenonTypeName && (
        <Chip
          icon={Sparkles}
          tint="purple"
          label={props.phenomenonTypeName}
          href={props.phenomenonTypeSlug ? '/phenomena/' + props.phenomenonTypeSlug : undefined}
        />
      )}
      {props.categoryLabel && props.category && (
        <Chip
          icon={FolderOpen}
          tint="gray"
          label={props.categoryLabel}
          href={'/explore?category=' + encodeURIComponent(props.category)}
        />
      )}
      {similar.length > 0 && (
        <>
          <div className="self-center text-[10px] uppercase tracking-wider text-gray-600 px-1">
            Related
          </div>
          {similar.map((name, i) => (
            <Chip
              key={i}
              icon={Network}
              tint="cyan"
              label={name}
              href={'/search?q=' + encodeURIComponent(name)}
              compact
            />
          ))}
        </>
      )}
    </div>
  )
}

// ── Subcomponents ───────────────────────────────────────────

function Chip(props: {
  icon: React.ComponentType<{ className?: string }>
  tint: 'purple' | 'gray' | 'cyan'
  label: string
  href?: string
  compact?: boolean
}) {
  const tint =
    props.tint === 'purple' ? 'bg-purple-600/15 border-purple-500/40 text-purple-200 hover:bg-purple-600/25' :
    props.tint === 'cyan'   ? 'bg-cyan-600/10 border-cyan-500/30 text-cyan-200 hover:bg-cyan-600/20' :
                              'bg-gray-800/60 border-gray-700 text-gray-200 hover:bg-gray-800'

  const Icon = props.icon
  const padding = props.compact ? 'px-2 py-1' : 'px-2.5 py-1.5'
  const textSize = props.compact ? 'text-[11px]' : 'text-xs'
  const inner = (
    <span className={'inline-flex items-center gap-1.5 rounded-full border ' + padding + ' ' + textSize + ' font-medium transition-colors ' + tint}>
      <Icon className="w-3 h-3" />
      <span className="truncate max-w-[180px]">{props.label}</span>
    </span>
  )
  if (props.href) {
    return <Link href={props.href}>{inner}</Link>
  }
  return inner
}
