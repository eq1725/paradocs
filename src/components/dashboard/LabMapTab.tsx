'use client'

/**
 * LabMapTab — Geographic view of the user's saves.
 *
 * Header: category + case file filter chips.
 * Body: dark-themed Leaflet map with clustered pins, dynamic-imported so
 * browser-only Leaflet code never hits the Next.js server.
 * Tap a pin → NodeDetailPanel opens.
 */

import React, { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Map as MapIcon, MapPin as MapPinIcon } from 'lucide-react'
import type { EntryNode, UserMapData, CaseFile } from '@/lib/constellation-types'
import type { EmergentConnection } from '@/lib/constellation-data'
import NodeDetailPanel from './NodeDetailPanel'
import ConstellationSidebar from './ConstellationSidebar'
import CaseFileBar from './CaseFileBar'

// Leaflet pulls in `window` at module eval time — dynamic import with
// ssr:false is the only safe way to use it inside a Next.js pages app.
const LabGeoMap = dynamic(() => import('./LabGeoMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-[60vh] sm:h-[70vh] rounded-2xl bg-gray-950 border border-gray-800 flex items-center justify-center">
      <div className="text-center">
        <MapPinIcon className="w-6 h-6 text-gray-600 mx-auto mb-2 animate-pulse" />
        <p className="text-xs text-gray-500">Loading map...</p>
      </div>
    </div>
  ),
})

interface LabMapTabProps {
  loading: boolean
  userMapData: UserMapData | null
  aiConnections: EmergentConnection[]
  caseFiles: CaseFile[]
  onRefresh: () => void
}

export default function LabMapTab({
  loading,
  userMapData,
  aiConnections,
  caseFiles,
  onRefresh,
}: LabMapTabProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const [selectedCaseFileId, setSelectedCaseFileId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<EntryNode | null>(null)

  // Keep the selected entry in sync with the latest userMapData so the
  // detail panel reflects case-file changes / note edits immediately
  // after the parent refetches.
  useEffect(() => {
    if (!userMapData) return
    setSelectedEntry(current => {
      if (!current) return current
      const fresh = userMapData.entryNodes.find(e => e.id === current.id)
      return fresh ?? current
    })
  }, [userMapData])

  if (loading && !userMapData) {
    return (
      <div className="space-y-3">
        <div className="h-6 w-40 rounded bg-gray-800 animate-pulse" />
        <div className="h-[60vh] sm:h-[70vh] rounded-2xl bg-gray-900 animate-pulse" />
      </div>
    )
  }

  const geocodedCount = (userMapData?.entryNodes || [])
    .filter(e => !e.isGhost && ((e as any).latitude || (e as any).lat || (e as any).coordinates))
    .length

  return (
    <div className="space-y-3">
      {/* Header row: count + legend hint */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2 text-gray-500 min-w-0 text-xs">
          <MapIcon className="w-3.5 h-3.5 text-sky-400 flex-shrink-0" />
          <span className="truncate">
            Geographic view · pins colored by category, clusters when zoomed out
          </span>
        </div>
      </div>

      {/* Case files + category filter chips */}
      {caseFiles.length > 0 && (
        <CaseFileBar
          caseFiles={caseFiles}
          selectedCaseFileId={selectedCaseFileId}
          onSelectCaseFile={setSelectedCaseFileId}
          onMutate={onRefresh}
        />
      )}
      {userMapData && userMapData.entryNodes.filter(e => !e.isGhost).length > 0 && (
        <ConstellationSidebar
          userMapData={userMapData}
          selectedCategory={selectedCategory}
          onCategoryClick={setSelectedCategory}
          layout="pill"
        />
      )}

      {/* Leaflet map */}
      <LabGeoMap
        userMapData={userMapData}
        selectedCategory={selectedCategory}
        selectedCaseFileId={selectedCaseFileId}
        onSelectEntry={setSelectedEntry}
      />

      {/* Detail panel floats over the viewport */}
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
