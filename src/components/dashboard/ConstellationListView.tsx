'use client'

/**
 * ConstellationListView — scrollable cards view of the user's saves.
 *
 * The research-book mode: instead of a cosmic galaxy to explore, this is a
 * reading surface. Each card shows the star's thumbnail, title, source type,
 * verdict, tags, note preview, and the count of AI-detected patterns touching
 * it. Tap a card → opens the same NodeDetailPanel as the Galaxy view.
 *
 * Insight cards interleave every few rows so library-wide patterns ("5 of
 * your saves share #military") surface in-flow, not as a separate screen.
 *
 * Casual mobile users read this. Power users toggle to Galaxy. Same data.
 */

import React, { useMemo } from 'react'
import {
  ExternalLink, MapPin, Calendar, Sparkles, ChevronRight, Link2, Bookmark, FileText,
} from 'lucide-react'
import type { EntryNode, UserMapData } from '@/lib/constellation-types'
import type { Insight } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'
import { InsightCardInline } from './InsightsPanel'

const VERDICT_CONFIG: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  compelling:   { label: 'Compelling',   icon: '✦', color: 'text-amber-400', bg: 'bg-amber-500/15' },
  inconclusive: { label: 'Inconclusive', icon: '◐', color: 'text-blue-400',  bg: 'bg-blue-500/15' },
  skeptical:    { label: 'Skeptical',    icon: '⊘', color: 'text-gray-400', bg: 'bg-gray-500/15' },
  needs_info:   { label: 'Needs info',   icon: '?', color: 'text-purple-400',bg: 'bg-purple-500/15' },
}

const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  ufos_aliens: { label: 'UFOs', icon: '🛸' },
  cryptids: { label: 'Cryptids', icon: '🦶' },
  ghosts_hauntings: { label: 'Ghosts', icon: '👻' },
  psychic_phenomena: { label: 'Psychic', icon: '🔮' },
  consciousness_practices: { label: 'Consciousness', icon: '🧘' },
  psychological_experiences: { label: 'Psychological', icon: '🧠' },
  biological_factors: { label: 'Biological', icon: '🧬' },
  perception_sensory: { label: 'Perception', icon: '👁️' },
  religion_mythology: { label: 'Religion', icon: '⚡' },
  esoteric_practices: { label: 'Esoteric', icon: '✨' },
  combination: { label: 'Multi', icon: '🔄' },
}

interface ConstellationListViewProps {
  userMapData: UserMapData | null
  aiConnections: Array<{ source: string; target: string; strength: number; reasons: string[] }>
  insights: Insight[]
  selectedCategory: string | null
  selectedEntryId?: string | null
  onSelectEntry: (entry: EntryNode | null) => void
  onHighlight: (entryIds: string[]) => void
}

/** Insert an insight card every INSIGHT_SPACING entries in the feed. */
const INSIGHT_SPACING = 5

export default function ConstellationListView({
  userMapData,
  aiConnections,
  insights,
  selectedCategory,
  selectedEntryId,
  onSelectEntry,
  onHighlight,
}: ConstellationListViewProps) {
  // Filter by category if one is selected. Ghost entries are NOT rendered in
  // the list view — this is reading material, not atmosphere.
  const entries = useMemo(() => {
    const raw = (userMapData?.entryNodes || []).filter(e => !e.isGhost)
    if (!selectedCategory) return raw
    return raw.filter(e => e.category === selectedCategory)
  }, [userMapData, selectedCategory])

  // Count AI patterns per entry — shows as a small badge on each card so
  // users can spot the "richest" items at a glance.
  const patternsByEntry = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of aiConnections) {
      counts[c.source] = (counts[c.source] || 0) + 1
      counts[c.target] = (counts[c.target] || 0) + 1
    }
    return counts
  }, [aiConnections])

  // Empty state
  if (entries.length === 0) {
    return (
      <div className="bg-gray-950 border border-gray-800 rounded-2xl p-8 sm:p-12 text-center">
        <div className="text-4xl mb-3">📓</div>
        <h3 className="text-white font-semibold text-base mb-1">
          {selectedCategory ? 'No saves in this category yet' : 'Your research library is empty'}
        </h3>
        <p className="text-gray-400 text-sm max-w-md mx-auto">
          {selectedCategory
            ? 'Clear the category filter or save sources tagged with this phenomenon.'
            : 'Save Paradocs reports or paste external URLs to build your personal research book.'}
        </p>
      </div>
    )
  }

  // Build an interleaved feed: [entry, entry, entry, entry, insight, entry, ...]
  // We copy the top insights into a pool and pop one every N entries.
  const insightPool = insights.slice(0, Math.ceil(entries.length / INSIGHT_SPACING))
  let insightIdx = 0
  const feed: Array<
    | { kind: 'entry'; entry: EntryNode }
    | { kind: 'insight'; insight: Insight }
  > = []
  for (let i = 0; i < entries.length; i++) {
    feed.push({ kind: 'entry', entry: entries[i] })
    if ((i + 1) % INSIGHT_SPACING === 0 && insightIdx < insightPool.length) {
      feed.push({ kind: 'insight', insight: insightPool[insightIdx++] })
    }
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {feed.map((item, i) => {
        if (item.kind === 'insight') {
          // Insights span all columns
          return (
            <div key={'ins-' + item.insight.id} className="sm:col-span-2 lg:col-span-3">
              <InsightCardInline insight={item.insight} onHighlight={onHighlight} />
            </div>
          )
        }
        const entry = item.entry
        const isSelected = selectedEntryId === entry.id
        const verdict = VERDICT_CONFIG[entry.verdict] || VERDICT_CONFIG.needs_info
        const cat = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.combination
        const isExternal = !!entry.sourceType && entry.sourceType !== 'paradocs_report'
        const patternCount = patternsByEntry[entry.id] || 0

        return (
          <button
            key={entry.id}
            onClick={() => onSelectEntry(entry)}
            className={classNames(
              'group text-left bg-gray-950 border rounded-xl overflow-hidden transition-all',
              isSelected
                ? 'border-primary-500/60 ring-1 ring-primary-500/40'
                : 'border-gray-800 hover:border-gray-700 hover:bg-gray-900'
            )}
          >
            {/* Thumbnail (when available) */}
            {entry.imageUrl ? (
              <div className="relative w-full aspect-video bg-gray-900">
                <img
                  src={entry.imageUrl}
                  alt=""
                  className="absolute inset-0 w-full h-full object-cover"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
                {/* Source badge overlay */}
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span className={classNames(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded backdrop-blur-sm',
                    isExternal
                      ? 'bg-white/10 text-white'
                      : 'bg-primary-600/80 text-white'
                  )}>
                    {isExternal
                      ? (entry.sourcePlatform || 'External')
                      : (cat.icon + ' ' + cat.label)}
                  </span>
                </div>
              </div>
            ) : (
              <div className="relative w-full h-20 bg-gradient-to-br from-gray-900 to-gray-950 flex items-center justify-center">
                <span className="text-3xl opacity-40">{cat.icon}</span>
                <div className="absolute top-2 left-2">
                  <span className={classNames(
                    'text-[10px] font-semibold px-1.5 py-0.5 rounded',
                    isExternal ? 'bg-white/10 text-gray-200' : 'bg-primary-600/80 text-white'
                  )}>
                    {isExternal ? (entry.sourcePlatform || 'External') : cat.label}
                  </span>
                </div>
              </div>
            )}

            {/* Body */}
            <div className="p-3 space-y-2">
              {/* Title + external badge */}
              <div className="flex items-start gap-2">
                <h3 className="flex-1 text-sm font-semibold text-white leading-snug line-clamp-2 group-hover:text-primary-200 transition-colors">
                  {entry.name || 'Untitled source'}
                </h3>
                {isExternal && (
                  <ExternalLink className="w-3.5 h-3.5 text-gray-500 flex-shrink-0 mt-0.5" />
                )}
              </div>

              {/* Verdict + patterns row */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className={classNames(
                  'inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded',
                  verdict.color, verdict.bg
                )}>
                  <span>{verdict.icon}</span>
                  <span>{verdict.label}</span>
                </span>
                {patternCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-cyan-300/90 bg-cyan-500/10 border border-cyan-500/20 rounded px-1.5 py-0.5">
                    <Sparkles className="w-2.5 h-2.5" />
                    {patternCount} pattern{patternCount === 1 ? '' : 's'}
                  </span>
                )}
              </div>

              {/* Note preview */}
              {entry.note && (
                <div className="flex items-start gap-1.5 text-xs text-gray-400 leading-snug">
                  <FileText className="w-3 h-3 text-gray-600 flex-shrink-0 mt-0.5" />
                  <p className="line-clamp-2">{entry.note}</p>
                </div>
              )}

              {/* Tags row */}
              {entry.tags && entry.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {entry.tags.slice(0, 4).map(tag => (
                    <span key={tag} className="text-[10px] text-purple-300/80 bg-purple-500/10 rounded px-1.5 py-0.5">
                      #{tag}
                    </span>
                  ))}
                  {entry.tags.length > 4 && (
                    <span className="text-[10px] text-gray-500">+{entry.tags.length - 4}</span>
                  )}
                </div>
              )}

              {/* Metadata footer */}
              <div className="flex items-center gap-3 text-[10px] text-gray-600">
                {entry.locationName && (
                  <span className="flex items-center gap-1 truncate">
                    <MapPin className="w-2.5 h-2.5" />
                    <span className="truncate">{entry.locationName}</span>
                  </span>
                )}
                <span className="flex items-center gap-1 flex-shrink-0">
                  <Calendar className="w-2.5 h-2.5" />
                  Saved {new Date(entry.loggedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                </span>
              </div>
            </div>
          </button>
        )
      })}
    </div>
  )
}
