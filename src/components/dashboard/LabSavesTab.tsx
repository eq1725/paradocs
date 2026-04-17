'use client'

/**
 * LabSavesTab — The Lab's primary surface.
 *
 * Composition top → bottom:
 *   1. Header row (count + Paste URL button)
 *   2. Progress tracker — total saves, streak, 30-day sparkline
 *   3. "New since last visit" strip (conditional)
 *   4. Case files horizontal bar (filter)
 *   5. Category filter pill row
 *   6. AI insights — top 3 inline cards
 *   7. ConstellationListView — the feed
 *
 * Receives pre-loaded data from LabPage via useLabData so tab switches
 * don't trigger refetches.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Map as MapIcon, Sparkles as SparklesIcon, ArrowDown, Bookmark } from 'lucide-react'
import type { EntryNode, UserMapData, CaseFile } from '@/lib/constellation-types'
import type { EmergentConnection, Insight } from '@/lib/constellation-data'
import ConstellationListView from './ConstellationListView'
import NodeDetailPanel from './NodeDetailPanel'
import ConstellationSidebar from './ConstellationSidebar'
import CaseFileBar from './CaseFileBar'
import LabProgressTracker from './LabProgressTracker'
import PasteUrlButton from './PasteUrlButton'
import { InsightCardInline } from './InsightsPanel'
import LabToolbar, { type LabViewMode, type LabSortMode } from './LabToolbar'
import Link from 'next/link'

interface LabSavesTabProps {
  loading: boolean
  userMapData: UserMapData | null
  aiConnections: EmergentConnection[]
  insights: Insight[]
  newInsights: Insight[]
  caseFiles: CaseFile[]
  onRefresh: () => void
}

export default function LabSavesTab({
  loading,
  userMapData,
  aiConnections,
  insights,
  newInsights,
  caseFiles,
  onRefresh,
}: LabSavesTabProps) {
  const [selectedEntry, setSelectedEntry] = useState<EntryNode | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedCaseFileId, setSelectedCaseFileId] = useState<string | null>(null)

  // Toolbar state — persisted to localStorage so preferences stick.
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<LabSortMode>('newest')
  const [viewMode, setViewMode] = useState<LabViewMode>('grid')

  useEffect(() => {
    try {
      const rawSort = localStorage.getItem('paradocs_lab_sort') as LabSortMode | null
      const rawView = localStorage.getItem('paradocs_lab_view') as LabViewMode | null
      if (rawSort && ['newest','oldest','patterns','connections','compelling','alphabetical'].includes(rawSort)) {
        setSort(rawSort)
      }
      if (rawView && ['grid','list','compact'].includes(rawView)) {
        setViewMode(rawView)
      }
    } catch { /* localStorage unavailable, fine */ }
  }, [])
  useEffect(() => { try { localStorage.setItem('paradocs_lab_sort', sort) } catch {} }, [sort])
  useEffect(() => { try { localStorage.setItem('paradocs_lab_view', viewMode) } catch {} }, [viewMode])

  const listRef = useRef<HTMLDivElement | null>(null)
  const scrollToList = useCallback(() => {
    listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  const handleHighlight = useCallback((entryIds: string[]) => {
    if (entryIds.length === 0 || !userMapData) return
    const first = userMapData.entryNodes.find(e => e.id === entryIds[0])
    if (first) setSelectedEntry(first)
  }, [userMapData])

  // ── Filter + sort pipeline (single source of truth for what renders) ──
  // Count AI patterns + connections per entry so we can sort by them.
  const patternsByEntry = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const c of aiConnections) {
      counts[c.source] = (counts[c.source] || 0) + 1
      counts[c.target] = (counts[c.target] || 0) + 1
    }
    return counts
  }, [aiConnections])

  const filteredEntries = useMemo(() => {
    let list = (userMapData?.entryNodes || []).filter(e => !e.isGhost)
    if (selectedCategory) list = list.filter(e => e.category === selectedCategory)
    if (selectedCaseFileId) list = list.filter(e => (e.caseFileIds || []).includes(selectedCaseFileId))
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(e =>
        (e.name && e.name.toLowerCase().includes(q)) ||
        (e.note && e.note.toLowerCase().includes(q)) ||
        (e.summary && e.summary.toLowerCase().includes(q)) ||
        (e.locationName && e.locationName.toLowerCase().includes(q)) ||
        (e.tags || []).some(t => t.toLowerCase().includes(q))
      )
    }
    // Sort — stable-ish (we always have loggedAt as tiebreaker).
    const sorted = [...list]
    sorted.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime()
        case 'patterns':
          return (patternsByEntry[b.id] || 0) - (patternsByEntry[a.id] || 0)
        case 'connections':
          return (patternsByEntry[b.id] || 0) - (patternsByEntry[a.id] || 0)
        case 'compelling': {
          const aVal = a.verdict === 'compelling' ? 0 : a.verdict === 'inconclusive' ? 1 : a.verdict === 'needs_info' ? 2 : 3
          const bVal = b.verdict === 'compelling' ? 0 : b.verdict === 'inconclusive' ? 1 : b.verdict === 'needs_info' ? 2 : 3
          if (aVal !== bVal) return aVal - bVal
          return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
        }
        case 'alphabetical':
          return (a.name || '').localeCompare(b.name || '')
        case 'newest':
        default:
          return new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()
      }
    })
    return sorted
  }, [userMapData, selectedCategory, selectedCaseFileId, search, sort, patternsByEntry])

  // Loading skeleton replaces raw spinner.
  if (loading && !userMapData) {
    return <SavesSkeleton />
  }

  const entryCount = (userMapData?.entryNodes || []).filter(e => !e.isGhost).length
  const categoriesCount = userMapData ? Object.keys(userMapData.categoryStats).length : 0

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-gray-500 min-w-0 text-xs">
          <Bookmark className="w-3.5 h-3.5 text-purple-400 flex-shrink-0" />
          <span className="truncate">
            {entryCount === 0
              ? 'No saves yet — save reports from the feed or paste URLs to get started'
              : entryCount + ' ' + (entryCount === 1 ? 'save' : 'saves')
                + (categoriesCount > 0 ? ' · ' + categoriesCount + ' ' + (categoriesCount === 1 ? 'category' : 'categories') : '')}
          </span>
        </div>
        <PasteUrlButton onArtifactSaved={onRefresh} />
      </div>

      {/* Progress tracker */}
      {userMapData && entryCount > 0 && (
        <LabProgressTracker entries={userMapData.entryNodes} />
      )}

      {/* "New since last visit" strip */}
      {newInsights.length > 0 && (
        <button
          onClick={scrollToList}
          className="w-full flex items-center justify-between gap-2 px-3 sm:px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500/15 via-cyan-500/10 to-transparent border border-cyan-500/30 hover:border-cyan-500/50 text-left transition-colors"
          aria-label={'See ' + newInsights.length + ' new patterns since last visit'}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 rounded-md bg-cyan-500/20 flex-shrink-0">
              <SparklesIcon className="w-3.5 h-3.5 text-cyan-300" />
            </div>
            <div className="min-w-0">
              <div className="text-xs font-semibold text-white leading-tight">
                Since you were last here: {newInsights.length} new pattern{newInsights.length === 1 ? '' : 's'}
              </div>
              <div className="text-[10px] text-cyan-300/80 leading-tight mt-0.5 truncate">
                {newInsights[0].title}{newInsights.length > 1 ? ' · and more' : ''}
              </div>
            </div>
          </div>
          <ArrowDown className="w-4 h-4 text-cyan-300 flex-shrink-0" />
        </button>
      )}

      {/* Case files filter row */}
      {caseFiles.length > 0 && (
        <CaseFileBar
          caseFiles={caseFiles}
          selectedCaseFileId={selectedCaseFileId}
          onSelectCaseFile={setSelectedCaseFileId}
          onMutate={onRefresh}
        />
      )}

      {/* Category filter pill row */}
      {entryCount > 0 && (
        <ConstellationSidebar
          userMapData={userMapData}
          selectedCategory={selectedCategory}
          onCategoryClick={setSelectedCategory}
          layout="pill"
        />
      )}

      {/* Toolbar: search / sort / view mode */}
      {entryCount > 0 && (
        <LabToolbar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          viewMode={viewMode}
          onViewModeChange={setViewMode}
          searchPlaceholder="Search your saves..."
          totalCount={entryCount}
          filteredCount={filteredEntries.length}
        />
      )}

      {/* Top insights */}
      {insights.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-gray-500 font-semibold mb-2 px-1">
            <SparklesIcon className="w-3 h-3 text-cyan-300" />
            AI insights ({insights.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {insights.slice(0, 3).map(ins => (
              <InsightCardInline key={ins.id} insight={ins} onHighlight={handleHighlight} />
            ))}
          </div>
        </div>
      )}

      {/* The feed — filtered + sorted by the toolbar controls */}
      <div ref={listRef}>
        {entryCount === 0 ? (
          <SavesEmptyState />
        ) : filteredEntries.length === 0 ? (
          <SearchEmptyState query={search} onClear={() => setSearch('')} />
        ) : (
          <ConstellationListView
            userMapData={userMapData}
            aiConnections={aiConnections}
            insights={insights}
            selectedCategory={selectedCategory}
            selectedCaseFileId={selectedCaseFileId}
            selectedEntryId={selectedEntry?.id || null}
            onSelectEntry={setSelectedEntry}
            onHighlight={handleHighlight}
            entriesOverride={filteredEntries}
            viewMode={viewMode}
            hideInterleavedInsights={!!search.trim()}
          />
        )}
      </div>

      {/* Detail panel */}
      {selectedEntry && (
        <NodeDetailPanel
          entry={selectedEntry}
          userMapData={userMapData}
          aiConnections={aiConnections}
          caseFiles={caseFiles}
          onClose={() => setSelectedEntry(null)}
          onTagClick={() => {}}
          onEntryClick={(entryId: string) => {
            const e = userMapData?.entryNodes.find(en => en.id === entryId)
            if (e) setSelectedEntry(e)
          }}
          onCaseFilesChanged={onRefresh}
        />
      )}
    </div>
  )
}

function SearchEmptyState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8 text-center">
      <p className="text-sm text-gray-400">
        No saves match <span className="text-white font-medium">&ldquo;{query}&rdquo;</span>
      </p>
      <button
        onClick={onClear}
        className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium text-gray-300 bg-white/5 hover:bg-white/10 transition-colors"
      >
        Clear search
      </button>
    </div>
  )
}

function SavesEmptyState() {
  return (
    <div className="rounded-2xl border border-gray-800 bg-gray-950 p-8 sm:p-12 text-center">
      <div className="inline-flex p-3 bg-primary-500/10 rounded-full mb-3">
        <Bookmark className="w-6 h-6 text-primary-400" />
      </div>
      <h3 className="text-base font-semibold text-white mb-1">
        Your library is empty
      </h3>
      <p className="text-sm text-gray-400 max-w-sm mx-auto mb-4 leading-relaxed">
        Save reports from the feed or paste a YouTube / Reddit / Wikipedia link to start
        building your personal research library. Patterns emerge once you have 5+.
      </p>
      <div className="flex items-center justify-center gap-2">
        <Link
          href="/discover"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-primary-600 hover:bg-primary-500 transition-colors"
        >
          Browse the feed
        </Link>
      </div>
    </div>
  )
}

function SavesSkeleton() {
  return (
    <div className="space-y-4">
      <div className="h-6 w-48 rounded bg-gray-800 animate-pulse" />
      <div className="h-24 rounded-xl bg-gray-900/60 animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <div className="h-20 rounded-lg bg-gray-900/60 animate-pulse" />
        <div className="h-20 rounded-lg bg-gray-900/60 animate-pulse" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl overflow-hidden bg-gray-950 border border-gray-800">
            <div className="aspect-video bg-gray-900 animate-pulse" />
            <div className="p-3 space-y-2">
              <div className="h-4 w-3/4 rounded bg-gray-800 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-gray-800/60 animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
