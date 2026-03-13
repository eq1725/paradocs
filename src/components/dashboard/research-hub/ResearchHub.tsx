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
import { CaseFilePicker } from './CaseFilePicker'
import { InsightsDrawer } from './InsightsDrawer'
import { TheoryComposer } from './TheoryComposer'
import { SharePanel } from './SharePanel'
import { Menu, AlertCircle, RefreshCw } from 'lucide-react'
import { useState, useCallback, useRef } from 'react'
import type { ConstellationTheory } from '@/lib/database.types'

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
  const [isInsightsOpen, setIsInsightsOpen] = useState(false)
  const [isTheoryOpen, setIsTheoryOpen] = useState(false)
  const [editingTheory, setEditingTheory] = useState<ConstellationTheory | null>(null)
  const [moveArtifact, setMoveArtifact] = useState<ConstellationArtifact | null>(null)
  var moveArtifactRef = useRef<ConstellationArtifact | null>(null)
  const [shareState, setShareState] = useState<{
    isOpen: boolean
    type: 'theory' | 'case_file' | 'profile'
    title: string
    url: string
    embedId?: string
  }>({ isOpen: false, type: 'theory', title: '', url: '' })

  // Case files are enriched with artifacts array and artifact_count by the hook
  const caseFilesWithCounts: CaseFileWithCount[] = safeCaseFiles.map(function(cf: any) {
    return {
      ...cf,
      artifact_count: cf.artifacts ? cf.artifacts.length : (cf.artifact_count || 0),
    }
  })

  // Build case file to artifact ID mapping for timeline/map views
  var caseFileArtifactMap: Record<string, string[]> = {}
  safeCaseFiles.forEach(function(cf: any) {
    caseFileArtifactMap[cf.id] = (cf.artifacts || []).map(function(a: any) { return a.id })
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
      await refresh()
    }
  }, [addArtifact, addArtifactToCaseFile, refresh])

  const handleCreateCaseFile = useCallback(async function() {
    var title = window.prompt('New Case File Name:')
    if (!title) return

    // Capture the artifact being moved (if any) before state changes
    var artifactToMove = moveArtifactRef.current

    var result = await addCaseFile({
      title,
      cover_color: '#4f46e5',
      icon: 'folder',
    })

    // If we were in the move-to-case-file flow, auto-move the artifact
    if (result && artifactToMove) {
      moveArtifactRef.current = null
      setMoveArtifact(null)
      await addArtifactToCaseFile(result.id, artifactToMove.id)
      refresh()
    }
  }, [addCaseFile, addArtifactToCaseFile, refresh])

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

  const handleDeleteCaseFile = useCallback(
    async function(id: string) {
      await removeCaseFile(id)
      await refresh()
    },
    [removeCaseFile, refresh]
  )

  const handleConnect = useCallback((artifact: ConstellationArtifact) => {
    setConnectingFrom(artifact)
    setIsConnectingMode(true)
  }, [])

  const handleMoveToCaseFile = useCallback(function(artifact: ConstellationArtifact) {
    moveArtifactRef.current = artifact
    setMoveArtifact(artifact)
  }, [])

  const handleMoveToSelected = useCallback(async function(caseFileId: string) {
    // Read from ref to avoid stale closure issues
    var artifact = moveArtifactRef.current
    if (!artifact) return
    moveArtifactRef.current = null
    setMoveArtifact(null)
    await addArtifactToCaseFile(caseFileId, artifact.id)
    refresh()
  }, [addArtifactToCaseFile, refresh])

  const handleRemoveFromCaseFile = useCallback(
    async (caseFileId: string, artifactId: string) => {
      await removeArtifactFromCaseFile(caseFileId, artifactId)
    },
    [removeArtifactFromCaseFile]
  )

  const handleCreateTheory = useCallback(function() {
    setEditingTheory(null)
    setIsTheoryOpen(true)
  }, [])

  const handleEditTheory = useCallback(function(theory: ConstellationTheory) {
    setEditingTheory(theory)
    setIsTheoryOpen(true)
  }, [])

  const handleShareTheory = useCallback(function(theory: ConstellationTheory) {
    setShareState({
      isOpen: true,
      type: 'theory',
      title: theory.title,
      url: 'https://beta.discoverparadocs.com/theory/' + theory.id,
      embedId: theory.id,
    })
  }, [])

  const handleTheorySaved = useCallback(function() {
    refresh()
  }, [refresh])

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
        onOpenInsights={function() { setIsInsightsOpen(true) }}
        onRefresh={refresh}
        onCreateTheory={handleCreateTheory}
        onEditTheory={handleEditTheory}
        onShareTheory={handleShareTheory}
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
                onDeleteCaseFile={handleDeleteCaseFile}
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
        onOpenInsights={function() { setIsInsightsOpen(true) }}
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

      {/* Theory Composer */}
      <TheoryComposer
        isOpen={isTheoryOpen}
        onClose={function() { setIsTheoryOpen(false); setEditingTheory(null) }}
        artifacts={safeArtifacts}
        caseFiles={safeCaseFiles}
        connections={safeConnections}
        editingTheory={editingTheory}
        onSaved={handleTheorySaved}
      />

      {/* Case File Picker */}
      <CaseFilePicker
        isOpen={moveArtifact !== null}
        onClose={function() { setMoveArtifact(null) }}
        caseFiles={caseFilesWithCounts}
        onSelect={handleMoveToSelected}
        onCreateNew={handleCreateCaseFile}
      />

      {/* Insights Drawer */}
      <InsightsDrawer
        isOpen={isInsightsOpen}
        onClose={function() { setIsInsightsOpen(false) }}
        insights={safeInsights}
        onDismiss={dismissInsight}
        onRate={rateInsight}
      />

      {/* Share Panel */}
      <SharePanel
        isOpen={shareState.isOpen}
        onClose={function() { setShareState(function(prev) { return { ...prev, isOpen: false } }) }}
        shareType={shareState.type}
        title={shareState.title}
        shareUrl={shareState.url}
        embedId={shareState.embedId}
      />
    </div>
  )
}

export default ResearchHub
