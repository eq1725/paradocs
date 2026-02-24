'use client'

/**
 * NodeDetailPanel — Slide-out detail view for a selected constellation entry.
 *
 * Shows report image, verdict, user's note, tags, connections,
 * and links to the full report page.
 */

import React from 'react'
import Link from 'next/link'
import {
  X as XIcon,
  ExternalLink,
  Tag,
  Link2,
  MapPin,
  Calendar,
  ChevronRight,
  Star,
  Stars,
  Lightbulb,
  BookOpen,
} from 'lucide-react'
import type { EntryNode, UserMapData } from '@/pages/dashboard/constellation'

// Category display config
const CATEGORY_CONFIG: Record<string, { label: string; icon: string; color: string }> = {
  ufos_aliens: { label: 'UFOs & Aliens', icon: '🛸', color: 'text-green-400' },
  cryptids: { label: 'Cryptids', icon: '🦶', color: 'text-amber-400' },
  ghosts_hauntings: { label: 'Ghosts & Hauntings', icon: '👻', color: 'text-purple-400' },
  psychic_phenomena: { label: 'Psychic Phenomena', icon: '🔮', color: 'text-blue-400' },
  consciousness_practices: { label: 'Consciousness', icon: '🧘', color: 'text-violet-400' },
  psychological_experiences: { label: 'Psychological', icon: '🧠', color: 'text-pink-400' },
  biological_factors: { label: 'Biological', icon: '🧬', color: 'text-teal-400' },
  perception_sensory: { label: 'Perception', icon: '👁️', color: 'text-cyan-400' },
  religion_mythology: { label: 'Religion & Mythology', icon: '⛩️', color: 'text-orange-400' },
  esoteric_practices: { label: 'Esoteric', icon: '✨', color: 'text-indigo-400' },
  combination: { label: 'Multi-Category', icon: '🌀', color: 'text-gray-400' },
}

const VERDICT_CONFIG: Record<string, { label: string; icon: string; color: string; bgColor: string }> = {
  compelling: { label: 'Compelling', icon: '⭐', color: 'text-amber-400', bgColor: 'bg-amber-500/15' },
  inconclusive: { label: 'Inconclusive', icon: '🔵', color: 'text-blue-400', bgColor: 'bg-blue-500/15' },
  skeptical: { label: 'Skeptical', icon: '⚪', color: 'text-gray-400', bgColor: 'bg-gray-500/15' },
  needs_info: { label: 'Need More Info', icon: '🟣', color: 'text-purple-400', bgColor: 'bg-purple-500/15' },
}

interface NodeDetailPanelProps {
  entry: EntryNode | null
  userMapData: UserMapData | null
  onClose: () => void
  onTagClick: (tag: string) => void
  onEntryClick: (entryId: string) => void
}

export default function NodeDetailPanel({
  entry,
  userMapData,
  onClose,
  onTagClick,
  onEntryClick,
}: NodeDetailPanelProps) {
  if (!entry) return null

  const cat = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.combination
  const verdict = VERDICT_CONFIG[entry.verdict] || VERDICT_CONFIG.needs_info

  // Find connected entries
  const connectedEntries: Array<{ entry: EntryNode; type: 'tag' | 'user'; label: string }> = []
  const seen = new Set<string>()

  // Tag connections
  ;(userMapData?.tagConnections || []).forEach(tc => {
    if (tc.entryIds.includes(entry.id)) {
      tc.entryIds.forEach(eid => {
        if (eid !== entry.id && !seen.has(eid)) {
          seen.add(eid)
          const e = userMapData?.entryNodes.find(n => n.id === eid)
          if (e) connectedEntries.push({ entry: e, type: 'tag', label: `#${tc.tag}` })
        }
      })
    }
  })

  // User-drawn connections
  ;(userMapData?.userConnections || []).forEach(uc => {
    const otherId = uc.entryAId === entry.id ? uc.entryBId : uc.entryBId === entry.id ? uc.entryAId : null
    if (otherId && !seen.has(otherId)) {
      seen.add(otherId)
      const e = userMapData?.entryNodes.find(n => n.id === otherId)
      if (e) connectedEntries.push({ entry: e, type: 'user', label: uc.annotation || 'Connected' })
    }
  })

  // Associated theories
  const theories = (userMapData?.userTheories || []).filter(t =>
    t.entry_ids?.includes(entry.id)
  )

  return (
    <div className="absolute top-0 right-0 bottom-0 w-full sm:w-[340px] bg-gray-900/95 backdrop-blur-md border-l border-gray-800 z-30 overflow-y-auto transition-transform duration-300">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{cat.icon}</span>
          <span className={`text-xs font-medium ${cat.color}`}>{cat.label}</span>
        </div>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-4">
        {/* Report image */}
        {entry.imageUrl && (
          <div className="relative rounded-xl overflow-hidden">
            <img
              src={entry.imageUrl}
              alt={entry.name}
              className="w-full h-40 object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}

        {/* Title + link */}
        <div>
          <h3 className="text-white font-semibold text-base leading-tight">{entry.name}</h3>
          <Link
            href={`/report/${entry.slug}`}
            className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs mt-1.5 transition-colors"
          >
            View full report <ExternalLink className="w-3 h-3" />
          </Link>
        </div>

        {/* Verdict badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${verdict.bgColor}`}>
          <span>{verdict.icon}</span>
          <span className={`text-sm font-medium ${verdict.color}`}>{verdict.label}</span>
        </div>

        {/* User note */}
        {entry.note && (
          <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
            <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-1">Your Notes</div>
            <p className="text-gray-300 text-sm leading-relaxed">{entry.note}</p>
          </div>
        )}

        {/* Meta info */}
        <div className="flex flex-wrap gap-3 text-xs text-gray-500">
          {entry.locationName && (
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" /> {entry.locationName}
            </span>
          )}
          {entry.eventDate && (
            <span className="flex items-center gap-1">
              <Calendar className="w-3 h-3" /> {new Date(entry.eventDate).toLocaleDateString()}
            </span>
          )}
          <span className="flex items-center gap-1">
            <Star className="w-3 h-3" /> Logged {new Date(entry.loggedAt).toLocaleDateString()}
          </span>
        </div>

        {/* Tags */}
        {entry.tags.length > 0 && (
          <div>
            <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {entry.tags.map(tag => (
                <button
                  key={tag}
                  onClick={() => onTagClick(tag)}
                  className="text-xs px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors cursor-pointer"
                >
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Connected entries */}
        {connectedEntries.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">
              <Link2 className="w-3 h-3" /> Connections ({connectedEntries.length})
            </div>
            <div className="space-y-1.5">
              {connectedEntries.slice(0, 6).map(({ entry: conn, type, label }) => {
                const connCat = CATEGORY_CONFIG[conn.category] || CATEGORY_CONFIG.combination
                return (
                  <button
                    key={conn.id}
                    onClick={() => onEntryClick(conn.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 bg-gray-800/50 hover:bg-gray-800 rounded-lg text-left transition-colors group"
                  >
                    <span className="text-sm">{connCat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-200 text-xs font-medium truncate group-hover:text-white transition-colors">
                        {conn.name}
                      </div>
                      <div className="text-gray-600 text-[10px]">
                        {type === 'user' ? '🔗 ' : '#'}{label}
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Associated theories */}
        {theories.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">
              <Lightbulb className="w-3 h-3" /> Theories ({theories.length})
            </div>
            <div className="space-y-1.5">
              {theories.map(theory => (
                <div
                  key={theory.id}
                  className="px-2.5 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg"
                >
                  <div className="text-amber-300 text-xs font-medium">{theory.title}</div>
                  {theory.thesis && (
                    <p className="text-gray-500 text-[10px] mt-0.5 line-clamp-2">{theory.thesis}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Summary if available */}
        {entry.summary && (
          <div>
            <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-1.5">Report Summary</div>
            <p className="text-gray-400 text-xs leading-relaxed line-clamp-4">{entry.summary}</p>
          </div>
        )}
      </div>
    </div>
  )
}
