'use client'

import type {
  ConstellationArtifact,
  CaseFile,
  ConstellationConnection,
  ArtifactSourceType,
  ArtifactVerdict,
} from '@/lib/database.types'
import { useResearchHub } from '@/lib/hooks/useResearchHub'
import { classNames } from '@/lib/utils'
import { ViewSwitcher } from './ViewSwitcher'
import type { ResearchHubView } from './ViewSwitcher'
import { BoardView } from './BoardView'
import { TimelineView } from './TimelineView'
import { MapView } from './MapView'
import { ResearchHubSidebar } from './ResearchHubSidebar'
import { MobileSidebar } from './MobileSidebar'
import { ArtifactDetailDrawer } from './ArtifactDetailDrawer'
import { ArtifactQuickAdd } from './ArtifactQuickAdd'
import { ConstellationView } from './ConstellationView'
import { Menu, AlertCircle, RefreshCw } from 'lucide-react'
import { useState, useCallback } from 'react'

interface CaseFileWithCount extends CaseFile {
  artifact_count: number
}

export function ResearchHub() {
  const {
    artifacts,
    caseFiles,
    connections,
    insights,
    stats,
    loading,
    error,
    currentView,
    setView,
    addArtifact,
    removeArtifact,
    updateArtifact,
    addCaseFile,
    updateCaseFile,
    removeCaseFile,
    addArtifactToCaseFile,
    removeArtifactFromCaseFile,
    addConnection,
    removeConnection,
    dismissInsight,
    rateInsight,
    refresh,
  } = useResearchHub()

  // Defensive: ensure all data arrays are always arrays even if hook returns undefined
  var safeArtifacts = Array.isArray(artifacts) ? artifacts : []
  var safeCaseFiles = Array.isArray(caseFiles) ? caseFiles : []
  var safeConnections = Array.isArray(connections) ? connections : []
  var safeInsights = Array.isArray(insights) ? insights : []

  const [selectedArtifact, setSelectedArtifact] = useState<ConstellationArtifact | null>(null)
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const [activeCaseFileId, setActiveCaseFileId] = useState<string | null>(null)
  const [isConnectingMode, setIsConnectingMode] = useState(false)
  const [connectingFrom, setConnectingFrom] = useState<ConstellationArtifact | null>(null)

  // Build case file to artifact ID mapping from the hub data
  // The hub-data API returns artifacts grouped; we derive the map here
  const caseFileArtifactMap: Record<string, string[]> = {}
  safeCaseFiles.forEach(function(cf) {
    caseFileArtifactMap[cf.id] = []
  })

  // Group case files with artifact counts
  // Use stats from the API when available, otherwise derive from artifacts
  const caseFilesWithCounts: CaseFileWithCount[] = safeCaseFiles.map(function(cf) {
    var count = caseFileArtifactMap[cf.id] ? caseFileArtifactMap[cf.id].length : 0
    return {
      ...cf,
      artifact_count: count,
    }
  })

  const handleAddArtifact = useCallback(async (data: {
    source_type: ArtifactSourceType
    report_id?: string
    external_url?: string
    title: string
    thumbnail_url?: string
    source_platform?: string
    metadata_json?: Record<string, any>
    user_note?: string
    verdict?: ArtifactVerdict
    tags?: string[]
    case_file_id?: string
  }) => {
    const result = await addArtifact({
      source_type: data.source_type,
      report_id: data.report_id,
      external_url: data.external_url,
      title: data.title,
      thumbnail_url: data.thumbnail_url,
      source_platform: data.source_platform,
      metadata_json: data.metadata_json,
      user_note: data.user_note,
      verdict: data.verdict,
      tags: data.tags || [],
    })

    if (result && data.case_file_id) {
      await addArtifactToCaseFile(data.case_file_id, result.id)
    }
  }, [addArtifact, addArtifactToCaseFile])

  const handleCreateCaseFile = useCallback(async () => {
    const title = window.prompt('New Case File Name:')
    if (!title) return

    const result = await addCaseFile({
      title,
      cover_color: '#4f46e5',
      icon: 'folder',
    })
  }, [addCaseFile])

  const handleSelectArtifact = useCallback((artifact: ConstellationArtifact) => {
    setSelectedArtifact(artifact)
  }, [])

  const handleUpdateArtifact = useCallback(
    async (id: string, data: Partial<{ user_note: string; verdict: ArtifactVerdict; tags: string[] }>) => {
      await updateArtifact(id, data)
    },
    [updateArtifact]
  )

  const handleDeleteArtifact = useCallback(
    async (id: string) => {
      if (confirm('Are you sure you want to delete this artifact?')) {
        await removeArtifact(id)
        setSelectedArtifact(null)
      }
    },
    [removeArtifact]
  )

  const handleConnect = useCallback((artifact: ConstellationArtifact) => {
    setConnectingFrom(artifact)
    setIsConnectingMode(true)
  }, [])

  const handleMoveToCaseFile = useCallback(
    async (artifact: ConstellationArtifact) => {
      const caseFileId = window.prompt('Select Case File ID:')
      if (!caseFileId) return

      await addArtifactToCaseFile(caseFileId, artifact.id)
    },
    [addArtifactToCaseFile]
  )

  const handleRemoveFromCaseFile = useCallback(
    async (caseFileId: string, artifactId: string) => {
      await removeArtifactFromCaseFile(caseFileId, artifactId)
    },
    [removeArtifactFromCaseFile]
  )

  // Skeleton loading state
  if (loading) {
    return (
      <div className="w-full h-screen bg-gray-950 flex items-center justify-center">
        <div className="space-y-4">
          <div className="h-8 w-48 bg-gray-800 rounded-lg animate-pulse" />
          <div className="h-96 w-96 bg-gray-800 rounded-lg animate-pulse" />
          <div className="grid grid-cols-3 gap-4">
            <div className="h-32 w-32 bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-32 w-32 bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-32 w-32 bg-gray-800 rounded-lg animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // Error state
  if (error) {
    return (
      <div className="w-full min-h-screen bg-gray-950 flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">Something went wrong</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button
            onClick={refresh}
            className={classNames(
              'inline-flex items-center gap-2 px-4 py-2 rounded-lg font-medium',
              'bg-indigo-600 text-white hover:bg-indigo-500 transition-colors'
            )}
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full h-screen bg-gray-950 flex">
      {/* Desktop Sidebar */}
      <ResearchHubSidebar
        caseFiles={caseFilesWithCounts}
        activeCaseFileId={activeCaseFileId}
        insightCount={safeInsights.filter(function(i) { return !i.dismissed }).length}
        stats={stats}
        onSelectCaseFile={setActiveCaseFileId}
        onCreateCaseFile={handleCreateCaseFile}
        onAddArtifact={function() { setIsQuickAddOpen(true) }}
        onOpenInsights={function() {}}
      />

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsMobileSidebarOpen(true)}
              className={classNames(
                'lg:hidden p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-gray-200 transition-colors'
              )}
            >
              <Menu className="w-5 h-5" />
            </button>
            <ViewSwitcher activeView={currentView} onViewChange={setView} />
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto">
          {currentView === 'board' && (
            <div className="p-6">
              <BoardView
                artifacts={safeArtifacts}
                caseFiles={caseFilesWithCounts}
                connections={safeConnections}
                insights={safeInsights.filter(i => !i.dismissed)}
                onSelectArtifact={handleSelectArtifact}
                onAddArtifact={() => setIsQuickAddOpen(true)}
                onCreateCaseFile={handleCreateCaseFile}
                onConnect={handleConnect}
                onMoveToCaseFile={handleMoveToCaseFile}
                onRemoveArtifact={handleDeleteArtifact}
                onRemoveFromCaseFile={handleRemoveFromCaseFile}
              />
            </div>
          )}

          {currentView === 'timeline' && (
            <div className="p-6">
              <TimelineView
                artifacts={safeArtifacts}
                caseFiles={caseFiles}
                caseFileArtifactMap={caseFileArtifactMap}
                insights={safeInsights.filter(function(i) { return !i.dismissed })}
                activeCaseFileId={activeCaseFileId}
                onSelectArtifact={handleSelectArtifact}
                onAddArtifact={function() { setIsQuickAddOpen(true) }}
              />
            </div>
          )}

          {currentView === 'map' && (
            <MapView
              artifacts={safeArtifacts}
              caseFiles={caseFiles}
              caseFileArtifactMap={caseFileArtifactMap}
              insights={safeInsights.filter(function(i) { return !i.dismissed })}
              activeCaseFileId={activeCaseFileId}
              onSelectArtifact={handleSelectArtifact}
              onAddArtifact={function() { setIsQuickAddOpen(true) }}
            />
          )}

          {currentView === 'constellation' && (
            <ConstellationView
              artifacts={safeArtifacts}
              caseFiles={safeCaseFiles}
              connections={safeConnections}
              insights={safeInsights.filter(function(i) { return !i.dismissed })}
              onSelectArtifact={handleSelectArtifact}
              onAddArtifact={function() { setIsQuickAddOpen(true) }}
            />
          )}
        </div>
      </div>

      {/* Mobile Sidebar */}
      <MobileSidebar
        isOpen={isMobileSidebarOpen}
        onClose={function() { setIsMobileSidebarOpen(false) }}
        caseFiles={caseFilesWithCounts}
        activeCaseFileId={activeCaseFileId}
        insightCount={safeInsights.filter(function(i) { return !i.dismissed }).length}
        stats={stats}
        onSelectCaseFile={setActiveCaseFileId}
        onCreateCaseFile={handleCreateCaseFile}
        onAddArtifact={function() { setIsQuickAddOpen(true) }}
        onOpenInsights={function() {}}
      />

      {/* Floating Action Button for Mobile */}
      <button
        onClick={() => setIsQuickAddOpen(true)}
        className={classNames(
          'lg:hidden fixed bottom-20 right-4 z-40',
          'w-14 h-14 rounded-full bg-indigo-600 shadow-lg',
          'flex items-center justify-center text-white hover:bg-indigo-500',
          'transition-colors'
        )}
        aria-label="Add Artifact"
      >
        <span className="text-2xl">+</span>
      </button>

      {/* Detail Drawer */}
      <ArtifactDetailDrawer
        artifact={selectedArtifact}
        connections={safeConnections.filter(
          (c) =>
            c.artifact_a_id === selectedArtifact?.id ||
            c.artifact_b_id === selectedArtifact?.id
        )}
        onClose={() => setSelectedArtifact(null)}
        onUpdate={handleUpdateArtifact}
        onDelete={handleDeleteArtifact}
        onConnect={handleConnect}
      />

      {/* Quick Add Modal */}
      <ArtifactQuickAdd
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onSave={handleAddArtifact}
        caseFiles={caseFilesWithCounts}
      />
    </div>
  )
}

export default ResearchHub
