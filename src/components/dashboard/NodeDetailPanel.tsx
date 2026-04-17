'use client'

/**
 * NodeDetailPanel — Slide-out detail view for a selected constellation entry.
 *
 * Shows report image, verdict, user's note, tags, connections,
 * and links to the full report page.
 */

import React, { useState } from 'react'
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
  Sparkles,
  FolderOpen,
  Plus,
  Check,
  Loader2,
  Edit3,
} from 'lucide-react'
import type { EntryNode, UserMapData, CaseFile } from '@/lib/constellation-types'
import { supabase } from '@/lib/supabase'
import { renderMarkdown, normalizeWikilinkKey, extractWikilinkTargets } from '@/lib/markdown-lite'
import NoteEditorModal from './NoteEditorModal'
import ReaderView from './ReaderView'

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

/** AI-detected emergent connection — narrow shape the panel actually needs */
export interface AiConnection {
  source: string
  target: string
  strength: number
  reasons: string[]
}

interface NodeDetailPanelProps {
  entry: EntryNode | null
  userMapData: UserMapData | null
  /** AI-detected connections for the whole library (filtered inside). Optional. */
  aiConnections?: AiConnection[]
  /** Parent-level list of case files (same payload as userMapData.caseFiles). */
  caseFiles?: CaseFile[]
  onClose: () => void
  onTagClick: (tag: string) => void
  onEntryClick: (entryId: string) => void
  /** Called after case-file linkage changes so the parent can refetch. */
  onCaseFilesChanged?: () => void
}

export default function NodeDetailPanel({
  entry,
  userMapData,
  aiConnections = [],
  caseFiles = [],
  onClose,
  onTagClick,
  onEntryClick,
  onCaseFilesChanged,
}: NodeDetailPanelProps) {
  const [noteEditorOpen, setNoteEditorOpen] = useState(false)
  const [readerMode, setReaderMode] = useState<'preview' | 'reader'>('preview')
  if (!entry) return null

  const cat = CATEGORY_CONFIG[entry.category] || CATEGORY_CONFIG.combination
  const verdict = VERDICT_CONFIG[entry.verdict] || VERDICT_CONFIG.needs_info
  const isExternal = !!entry.sourceType && entry.sourceType !== 'paradocs_report'

  // Wikilinks resolver — maps normalized title → {id, displayLabel} so
  // [[Some Title]] inside a note can link to another save.
  const wikilinkMap = new Map<string, { id: string; displayLabel: string }>()
  for (const n of (userMapData?.entryNodes || [])) {
    if (!n.name) continue
    wikilinkMap.set(normalizeWikilinkKey(n.name), { id: n.id, displayLabel: n.name })
  }

  // Backlinks: scan every other user note for [[this entry's title]] references.
  // O(N) over entries, cheap for reasonable libraries.
  const backlinks: EntryNode[] = []
  if (entry.name) {
    const myKey = normalizeWikilinkKey(entry.name)
    for (const n of (userMapData?.entryNodes || [])) {
      if (n.id === entry.id || !n.note) continue
      const targets = extractWikilinkTargets(n.note).map(normalizeWikilinkKey)
      if (targets.includes(myKey)) backlinks.push(n)
    }
  }

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
    <div className={[
      // Fixed positioning (viewport-anchored) so the panel escapes the canvas
      // container's height/clipping. Only intercepts clicks within its own
      // bounds — taps on the uncovered canvas area still select new stars.
      'fixed z-40 bg-gray-900/95 backdrop-blur-md overflow-y-auto transition-transform duration-300 shadow-2xl',
      'bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl border-t border-gray-800',
      'sm:top-[8%] sm:right-4 sm:left-auto sm:bottom-4 sm:max-h-none sm:rounded-2xl sm:border sm:border-gray-800 sm:w-[360px]',
    ].join(' ')}>
      {/* Mobile drag handle */}
      <div className="flex justify-center pt-2 pb-1 sm:hidden">
        <div className="w-10 h-1 rounded-full bg-gray-700" />
      </div>

      {/* Header */}
      <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-lg">{cat.icon}</span>
          <span className={`text-xs font-medium ${cat.color}`}>{cat.label}</span>
        </div>
        <button
          onClick={onClose}
          className="w-8 h-8 sm:w-7 sm:h-7 flex items-center justify-center rounded-lg hover:bg-gray-800 text-gray-500 hover:text-gray-300 transition-colors"
        >
          <XIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="px-4 py-4 space-y-4 pb-6 sm:pb-4">
        {/* Source-type-aware preview with optional Reader View tab.
            Reader mode is only offered for external artifacts whose source
            supports article extraction (news, blogs, Wikipedia, Substack,
            Medium). Video / social platforms stay in Preview. */}
        {isExternal ? (
          <>
            {readerModeApplicable(entry) && entry.externalUrl && (
              <div className="inline-flex items-center rounded-lg bg-white/[0.04] border border-white/10 p-0.5 text-[11px]" role="group" aria-label="View mode">
                <button
                  onClick={() => setReaderMode('preview')}
                  aria-pressed={readerMode === 'preview'}
                  className={[
                    'px-2.5 py-1 rounded-md transition-colors',
                    readerMode === 'preview' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'
                  ].join(' ')}
                >
                  Preview
                </button>
                <button
                  onClick={() => setReaderMode('reader')}
                  aria-pressed={readerMode === 'reader'}
                  className={[
                    'px-2.5 py-1 rounded-md transition-colors flex items-center gap-1',
                    readerMode === 'reader' ? 'bg-white/10 text-white' : 'text-gray-400 hover:text-gray-200'
                  ].join(' ')}
                >
                  <BookOpen className="w-3 h-3" />
                  Reader
                </button>
              </div>
            )}
            {readerMode === 'reader' && entry.externalUrl ? (
              <ReaderView url={entry.externalUrl} sourcePlatform={entry.sourcePlatform} />
            ) : (
              <ExternalSourcePreview entry={entry} />
            )}
          </>
        ) : (
          entry.imageUrl && (
            <div className="relative rounded-xl overflow-hidden">
              <img
                src={entry.imageUrl}
                alt={entry.name}
                className="w-full h-40 object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            </div>
          )
        )}

        {/* Title + link (Paradocs report link vs. external link) */}
        <div>
          <h3 className="text-white font-semibold text-base leading-tight">{entry.name}</h3>
          {isExternal && entry.externalUrl ? (
            <a
              href={entry.externalUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs mt-1.5 transition-colors"
            >
              Open on {entry.sourcePlatform || 'source'} <ExternalLink className="w-3 h-3" />
            </a>
          ) : entry.slug ? (
            <Link
              href={`/report/${entry.slug}`}
              className="inline-flex items-center gap-1 text-primary-400 hover:text-primary-300 text-xs mt-1.5 transition-colors"
            >
              View full report <ExternalLink className="w-3 h-3" />
            </Link>
          ) : null}
        </div>

        {/* Verdict badge */}
        <div className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg ${verdict.bgColor}`}>
          <span>{verdict.icon}</span>
          <span className={`text-sm font-medium ${verdict.color}`}>{verdict.label}</span>
        </div>

        {/* Case files — only supported on external artifacts for now
            (Paradocs-report entries don't expose artifactId yet). Shows
            chips for every case file this entry is in + a "+ Add" button. */}
        {entry.artifactId && (
          <CaseFilesSection
            artifactId={entry.artifactId}
            memberIds={entry.caseFileIds || []}
            allCaseFiles={caseFiles}
            onChanged={onCaseFilesChanged}
          />
        )}

        {/* User note — rendered as markdown with inline [[Wikilinks]] that
            navigate to other saves. Pattern borrowed from Obsidian.
            An Edit button opens NoteEditorModal; for entries without a note,
            the section collapses to a single CTA. */}
        <div className="bg-gray-800/50 rounded-lg px-3 py-2.5">
          <div className="flex items-center justify-between mb-1">
            <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider">Your notes</div>
            <button
              onClick={() => setNoteEditorOpen(true)}
              className="inline-flex items-center gap-1 text-[10px] text-primary-300 hover:text-primary-200 transition-colors"
              title="Edit these notes"
            >
              <Edit3 className="w-3 h-3" />
              {entry.note ? 'Edit' : 'Add'}
            </button>
          </div>
          {entry.note ? (
            <div className="text-sm leading-relaxed">
              {renderMarkdown(entry.note, {
                wikilinks: wikilinkMap,
                onWikilinkClick: onEntryClick,
              })}
            </div>
          ) : (
            <p className="text-[11px] text-gray-500 italic leading-relaxed">
              No notes yet. Capture what stood out, link to other saves with <span className="font-mono text-cyan-300/80">[[Wikilinks]]</span>, and build your case.
            </p>
          )}
        </div>

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

        {/* AI-detected patterns — every ambient cyan filament touching this
            star becomes a readable row here, with the reasons that triggered
            the match. Tap → switch selection to the matched star. */}
        {(() => {
          const relevant = aiConnections.filter(
            c => c.source === entry.id || c.target === entry.id
          )
          if (relevant.length === 0) return null
          // Sort by strength descending, cap at 6 to prevent the panel from
          // becoming a scroll-hell on well-connected stars.
          relevant.sort((a, b) => b.strength - a.strength)
          const shown = relevant.slice(0, 6)
          return (
            <div>
              <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">
                <Sparkles className="w-3 h-3 text-cyan-400" />
                AI-detected patterns ({relevant.length})
              </div>
              <div className="space-y-1.5">
                {shown.map(conn => {
                  const otherId = conn.source === entry.id ? conn.target : conn.source
                  const other = userMapData?.entryNodes.find(n => n.id === otherId)
                  if (!other) return null
                  const otherCat = CATEGORY_CONFIG[other.category] || CATEGORY_CONFIG.combination
                  return (
                    <button
                      key={otherId}
                      onClick={() => onEntryClick(otherId)}
                      className="w-full flex items-start gap-2 px-2.5 py-2 bg-cyan-500/5 border border-cyan-500/15 hover:bg-cyan-500/10 hover:border-cyan-500/30 rounded-lg text-left transition-colors group"
                    >
                      <span className="text-sm mt-0.5">{otherCat.icon}</span>
                      <div className="min-w-0 flex-1">
                        <div className="text-gray-200 text-xs font-medium truncate group-hover:text-white transition-colors">
                          {other.name}
                        </div>
                        <div className="text-cyan-300/80 text-[10px] mt-0.5 leading-snug">
                          {conn.reasons.join(' · ')}
                        </div>
                      </div>
                      <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-cyan-300 shrink-0 mt-1" />
                    </button>
                  )
                })}
              </div>
              {relevant.length > shown.length && (
                <div className="text-[10px] text-gray-600 mt-1.5 pl-1">
                  {relevant.length - shown.length} more pattern{relevant.length - shown.length === 1 ? '' : 's'} on this star
                </div>
              )}
            </div>
          )
        })()}

        {/* Backlinks — other saves whose notes reference this one via
            [[Wikilink]]. Obsidian-style "mentioned in..." navigation aid. */}
        {backlinks.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">
              <Link2 className="w-3 h-3 text-primary-300" />
              Mentioned in {backlinks.length} {backlinks.length === 1 ? 'save' : 'saves'}
            </div>
            <div className="space-y-1.5">
              {backlinks.slice(0, 6).map(bl => {
                const blCat = CATEGORY_CONFIG[bl.category] || CATEGORY_CONFIG.combination
                return (
                  <button
                    key={bl.id}
                    onClick={() => onEntryClick(bl.id)}
                    className="w-full flex items-center gap-2 px-2.5 py-2 bg-primary-500/5 border border-primary-500/15 hover:bg-primary-500/10 hover:border-primary-500/30 rounded-lg text-left transition-colors group"
                  >
                    <span className="text-sm">{blCat.icon}</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-200 text-xs font-medium truncate group-hover:text-white transition-colors">
                        {bl.name}
                      </div>
                    </div>
                    <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-primary-300 shrink-0" />
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
            <div className="text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-1.5">
              {isExternal ? 'Source summary' : 'Report Summary'}
            </div>
            <p className="text-gray-400 text-xs leading-relaxed line-clamp-4">{entry.summary}</p>
          </div>
        )}
      </div>

      {/* Note editor modal — renders over the entire viewport via its own
          fixed overlay. Only mounted when the user clicks Edit/Add notes. */}
      {noteEditorOpen && (
        <NoteEditorModal
          entry={entry}
          allEntries={userMapData?.entryNodes || []}
          onClose={() => setNoteEditorOpen(false)}
          onSaved={() => {
            setNoteEditorOpen(false)
            // Reuse the existing "case files changed" callback as a generic
            // data-refresh trigger. The parent refetches user-map either way.
            onCaseFilesChanged?.()
          }}
        />
      )}
    </div>
  )
}

/**
 * Is reader-view extraction likely to produce a useful result for this
 * artifact? Text-first sources (news, blogs, Wikipedia, Substack, Medium)
 * get a Reader tab. Video / social / image-first sources don't — the
 * existing Preview is what users actually want for those.
 */
function readerModeApplicable(entry: EntryNode): boolean {
  const readerSources = new Set([
    'news', 'website', 'substack', 'medium', 'wikipedia', 'archive',
    'mufon', 'nuforc', 'blackvault', 'coasttocoast',
  ])
  return !!entry.sourceType && readerSources.has(entry.sourceType)
}

// ─────────────────────────────────────────────────────────────────
// Platform-specific preview for external sources
// ─────────────────────────────────────────────────────────────────
//
// Rendering policy: we deep-link to the source and preview metadata (thumbnail,
// title, short excerpt). We do NOT host the full source content. This matches
// the same link-preview pattern Twitter/LinkedIn/Discord use, and it's what
// lets us stay inside fair use / EU "very short extract" allowances.

interface ExternalSourcePreviewProps {
  entry: EntryNode
}

function youtubeVideoId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '').toLowerCase()
    if (host === 'youtu.be') {
      return u.pathname.slice(1).split('/')[0] || null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const v = u.searchParams.get('v')
      if (v) return v
      const shorts = u.pathname.match(/^\/shorts\/([^/]+)/)
      if (shorts) return shorts[1]
    }
  } catch {/* fall through */}
  return null
}

function ExternalSourcePreview({ entry }: ExternalSourcePreviewProps) {
  const sourceType = entry.sourceType || 'website'
  const url = entry.externalUrl || ''
  const platform = entry.sourcePlatform || 'source'
  const thumbnail = entry.imageUrl
  const description = entry.sourceMetadata?.description as string | undefined

  // YouTube embed: privacy-enhanced youtube-nocookie host. Lightweight —
  // we don't autoplay, just render the player at first interaction.
  if (sourceType === 'youtube') {
    const vid = youtubeVideoId(url)
    if (vid) {
      return (
        <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${vid}`}
            title={entry.name}
            className="absolute inset-0 w-full h-full"
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      )
    }
    // Fall through to thumbnail card if we can't parse the video ID.
  }

  // Wikipedia: show the REST summary with a subtle attribution.
  if (sourceType === 'wikipedia' && description) {
    return (
      <div className="rounded-xl overflow-hidden border border-gray-800">
        {thumbnail && (
          <div className="relative w-full aspect-video bg-gray-900">
            <img
              src={thumbnail}
              alt={entry.name}
              className="absolute inset-0 w-full h-full object-cover"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
          </div>
        )}
        <div className="p-3 bg-gray-900/60">
          <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">
            Wikipedia summary
          </div>
          <p className="text-gray-300 text-sm leading-relaxed line-clamp-6">{description}</p>
        </div>
      </div>
    )
  }

  // Generic link preview card: thumbnail + platform badge + description.
  // Used for Reddit, news, podcasts, everything else.
  return (
    <div className="rounded-xl overflow-hidden border border-gray-800 bg-gray-900/40">
      {thumbnail && (
        <div className="relative w-full aspect-video bg-gray-900">
          <img
            src={thumbnail}
            alt={entry.name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        </div>
      )}
      <div className="p-3 space-y-2">
        <div className="flex items-center gap-1.5 text-[10px] text-gray-500">
          <span className="px-1.5 py-0.5 rounded bg-gray-800 text-primary-300 font-medium">
            {platform}
          </span>
          {entry.sourceMetadata?.author && typeof entry.sourceMetadata.author === 'string' && (
            <span className="truncate">{entry.sourceMetadata.author}</span>
          )}
        </div>
        {description && (
          <p className="text-gray-400 text-xs leading-relaxed line-clamp-4">{description}</p>
        )}
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────
// Case file membership section
// ─────────────────────────────────────────────────────────────────

interface CaseFilesSectionProps {
  artifactId: string
  memberIds: string[]
  allCaseFiles: CaseFile[]
  onChanged?: () => void
}

function CaseFilesSection({ artifactId, memberIds, allCaseFiles, onChanged }: CaseFilesSectionProps) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pendingId, setPendingId] = useState<string | null>(null) // id being added/removed
  const currentMemberIds = new Set(memberIds)
  const memberFiles = allCaseFiles.filter(cf => currentMemberIds.has(cf.id))
  const availableFiles = allCaseFiles.filter(cf => !currentMemberIds.has(cf.id))

  const toggleMembership = async (caseFileId: string, shouldAdd: boolean) => {
    setPendingId(caseFileId)
    try {
      const sess = await supabase.auth.getSession()
      const token = sess.data.session?.access_token
      if (!token) return
      const url = `/api/constellation/case-files/${caseFileId}/artifacts`
      if (shouldAdd) {
        await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ artifact_id: artifactId }),
        })
      } else {
        await fetch(url + '?aid=' + encodeURIComponent(artifactId), {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        })
      }
      onChanged?.()
    } catch (err) {
      console.error('[detail-panel:case-file-toggle]', err)
    } finally {
      setPendingId(null)
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] font-medium uppercase tracking-wider mb-2">
        <FolderOpen className="w-3 h-3" />
        Case files ({memberFiles.length})
      </div>

      {/* Chips of current memberships */}
      {memberFiles.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mb-2">
          {memberFiles.map(cf => (
            <button
              key={cf.id}
              onClick={() => toggleMembership(cf.id, false)}
              disabled={pendingId === cf.id}
              className="group inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white/5 border border-white/10 text-xs text-gray-200 hover:bg-white/10 transition-colors disabled:opacity-50"
              title="Remove from this case file"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: cf.cover_color }}
              />
              <span className="truncate max-w-[140px]">{cf.title}</span>
              {pendingId === cf.id
                ? <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                : <XIcon className="w-3 h-3 text-gray-500 group-hover:text-red-400 transition-colors" />}
            </button>
          ))}
        </div>
      )}

      {/* Add-to-case-file picker */}
      {allCaseFiles.length === 0 ? (
        <p className="text-[10px] text-gray-600">
          Create a case file from the <Link href="/lab?tab=cases" className="text-primary-300 hover:text-primary-200 underline">Cases tab</Link> to organize this save.
        </p>
      ) : !pickerOpen ? (
        availableFiles.length > 0 && (
          <button
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1.5 text-[11px] text-primary-300 hover:text-primary-200 transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add to case file
          </button>
        )
      ) : (
        <div className="bg-black/40 border border-white/10 rounded-lg p-2 space-y-0.5">
          {availableFiles.length === 0 ? (
            <p className="text-[10px] text-gray-500 px-2 py-1">Already in every case file.</p>
          ) : availableFiles.map(cf => (
            <button
              key={cf.id}
              onClick={async () => {
                await toggleMembership(cf.id, true)
                setPickerOpen(false)
              }}
              disabled={pendingId === cf.id}
              className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 text-left transition-colors disabled:opacity-50"
            >
              <span
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: cf.cover_color }}
              />
              <span className="text-xs text-gray-200 truncate flex-1">{cf.title}</span>
              {pendingId === cf.id
                ? <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                : <Check className="w-3 h-3 text-gray-500" />}
            </button>
          ))}
          <button
            onClick={() => setPickerOpen(false)}
            className="w-full px-2 py-1 text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
          >
            Done
          </button>
        </div>
      )}
    </div>
  )
}
