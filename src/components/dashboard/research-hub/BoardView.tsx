'use client'

import type {
  ConstellationArtifact,
  CaseFile,
  AiInsight,
} from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { ArtifactCard } from './ArtifactCard'
import {
  ChevronDown,
  ChevronRight,
  Plus,
  FolderPlus,
  Trash2,
  X,
} from 'lucide-react'
import { useState, useMemo, useEffect, useRef, useCallback } from 'react'

interface ConstellationConnection {
  id: string
  artifact_a_id: string
  artifact_b_id: string
  connection_type: string
}

interface CaseFileWithCount extends CaseFile {
  artifact_count: number
  artifacts?: ConstellationArtifact[]
}

interface BoardViewProps {
  artifacts: ConstellationArtifact[]
  caseFiles: CaseFileWithCount[]
  connections: ConstellationConnection[]
  insights: AiInsight[]
  onSelectArtifact: (artifact: ConstellationArtifact) => void
  onAddArtifact: () => void
  onCreateCaseFile: () => void
  onConnect: (artifact: ConstellationArtifact) => void
  onMoveToCaseFile: (artifact: ConstellationArtifact) => void
  onRemoveArtifact: (id: string) => void
  onRemoveFromCaseFile: (caseFileId: string, artifactId: string) => void
  onDeleteCaseFile?: (id: string) => void
}

// Horizontal swipeable card row for mobile
function SwipeableCardRow({
  artifacts,
  getConnectionCount,
  onSelectArtifact,
  onConnect,
  onMoveToCaseFile,
  onRemoveArtifact,
  connectingArtifact,
}: {
  artifacts: ConstellationArtifact[]
  getConnectionCount: (id: string) => number
  onSelectArtifact: (a: ConstellationArtifact) => void
  onConnect: (a: ConstellationArtifact) => void
  onMoveToCaseFile: (a: ConstellationArtifact) => void
  onRemoveArtifact: (id: string) => void
  connectingArtifact: ConstellationArtifact | null
}) {
  var scrollRef = useRef<HTMLDivElement>(null)
  var [activeIndex, setActiveIndex] = useState(0)

  var handleScroll = useCallback(function() {
    var container = scrollRef.current
    if (!container) return
    var scrollLeft = container.scrollLeft
    var cardWidth = container.offsetWidth * 0.85
    var newIndex = Math.round(scrollLeft / cardWidth)
    setActiveIndex(Math.min(newIndex, artifacts.length - 1))
  }, [artifacts.length])

  if (artifacts.length === 0) {
    return (
      <div className="px-3 py-6 text-center text-sm text-gray-500">
        No artifacts yet
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="swipeable-card-row flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1"
        style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch', touchAction: 'pan-x', overscrollBehaviorX: 'contain' } as any}
      >
        {artifacts.map(function(artifact) {
          return (
            <div
              key={artifact.id}
              className="snap-center flex-shrink-0"
              style={{ width: '85%', minWidth: '280px', maxWidth: '340px' }}
            >
              <ArtifactCard
                artifact={artifact}
                connectionCount={getConnectionCount(artifact.id)}
                onSelect={onSelectArtifact}
                onConnect={onConnect}
                onMove={onMoveToCaseFile}
                onDelete={onRemoveArtifact}
                isConnecting={connectingArtifact?.id === artifact.id}
                isSelected={connectingArtifact !== null}
                compact
              />
            </div>
          )
        })}
      </div>
      {/* Dot indicators */}
      {artifacts.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {artifacts.map(function(_, i) {
            return (
              <div
                key={i}
                className={classNames(
                  'rounded-full transition-all duration-200',
                  i === activeIndex
                    ? 'w-4 h-1.5 bg-indigo-500'
                    : 'w-1.5 h-1.5 bg-gray-600'
                )}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

export function BoardView({
  artifacts,
  caseFiles,
  connections,
  insights,
  onSelectArtifact,
  onAddArtifact,
  onCreateCaseFile,
  onConnect,
  onMoveToCaseFile,
  onRemoveArtifact,
  onRemoveFromCaseFile,
  onDeleteCaseFile,
}: BoardViewProps) {
  var [expandedCaseFiles, setExpandedCaseFiles] = useState<Set<string>>(
    new Set([...caseFiles.map(function(cf) { return cf.id }), 'unsorted'])
  )
  var [connectingArtifact, setConnectingArtifact] =
    useState<ConstellationArtifact | null>(null)
  // Mobile/desktop layout is handled via CSS responsive classes (sm:hidden / hidden sm:grid)

  // Compute unsorted artifacts
  var artifactsInCaseFiles = useMemo(function() {
    var ids = new Set<string>()
    caseFiles.forEach(function(cf) {
      if (cf.artifacts) {
        cf.artifacts.forEach(function(a) { ids.add(a.id) })
      }
    })
    return ids
  }, [caseFiles])

  var unsortedArtifacts = useMemo(
    function() { return artifacts.filter(function(a) { return !artifactsInCaseFiles.has(a.id) }) },
    [artifacts, artifactsInCaseFiles]
  )

  var handleConnectClick = function(artifact: ConstellationArtifact) {
    setConnectingArtifact(artifact)
    onConnect(artifact)
  }

  var toggleCaseFile = function(caseFileId: string) {
    var newExpanded = new Set(expandedCaseFiles)
    if (newExpanded.has(caseFileId)) {
      newExpanded.delete(caseFileId)
    } else {
      newExpanded.add(caseFileId)
    }
    setExpandedCaseFiles(newExpanded)
  }

  var getConnectionCount = function(artifactId: string) {
    return connections.filter(
      function(c) { return c.artifact_a_id === artifactId || c.artifact_b_id === artifactId }
    ).length
  }

  // Empty state
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center px-4">
        <div className="w-20 h-20 sm:w-24 sm:h-24 mb-4 sm:mb-6 rounded-full bg-gray-800/50 flex items-center justify-center">
          <Plus className="w-10 h-10 sm:w-12 sm:h-12 text-gray-600" />
        </div>
        <h2 className="text-xl sm:text-2xl font-bold text-white mb-2">
          Start your research
        </h2>
        <p className="text-gray-400 mb-6 max-w-sm text-sm sm:text-base">
          Add your first artifact to begin building your research network.
        </p>
        <button
          onClick={onAddArtifact}
          className={classNames(
            'px-4 py-2 rounded-lg font-medium text-white',
            'bg-blue-600 hover:bg-blue-700 transition-colors'
          )}
        >
          Add Artifact
        </button>
      </div>
    )
  }

  // Render a case file section (shared between mobile and desktop)
  var renderCaseFileSection = function(caseFile: CaseFileWithCount) {
    var isExpanded = expandedCaseFiles.has(caseFile.id)
    var sectionArtifacts = caseFile.artifacts || []

    return (
      <div key={caseFile.id} className="space-y-3 sm:space-y-4">
        {/* Case file header */}
        <div
          className={classNames(
            'w-full text-left p-3 sm:p-4 rounded-lg border transition-colors cursor-pointer',
            'hover:border-gray-700 hover:bg-gray-800/50',
            'border-gray-800 bg-gray-800/20'
          )}
          style={{
            borderLeftWidth: '4px',
            borderLeftColor: caseFile.cover_color || '#6b7280',
          }}
          onClick={function() { toggleCaseFile(caseFile.id) }}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400 flex-shrink-0" />
              )}
              <h3 className="text-base sm:text-lg font-semibold text-white truncate">
                {caseFile.title}
              </h3>
              <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-700 text-xs text-gray-300 flex-shrink-0">
                {caseFile.artifact_count}
              </span>
            </div>
            {onDeleteCaseFile && (
              <button
                onClick={function(e: React.MouseEvent) {
                  e.stopPropagation()
                  if (window.confirm('Delete this case file? Artifacts inside will become unsorted.')) {
                    onDeleteCaseFile(caseFile.id)
                  }
                }}
                className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors flex-shrink-0 ml-2"
                title="Delete case file"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
          <p className="text-xs sm:text-sm text-gray-500 ml-6 sm:ml-7">
            {caseFile.visibility === 'private' ? 'Private' : 'Shared'}{' \u00B7 '}Created{' '}
            {new Date(caseFile.created_at).toLocaleDateString('en-US', {
              year: 'numeric',
              month: 'short',
            })}
          </p>
        </div>

        {/* Artifacts - Mobile: single column, Desktop: grid */}
        {isExpanded && sectionArtifacts.length > 0 && (
          <>
            {/* Mobile: single-column full-width cards */}
            <div className="sm:hidden space-y-3">
              {sectionArtifacts.map(function(artifact) {
                return (
                  <div key={artifact.id}>
                    <ArtifactCard
                      artifact={artifact}
                      connectionCount={getConnectionCount(artifact.id)}
                      onSelect={onSelectArtifact}
                      onConnect={handleConnectClick}
                      onMove={onMoveToCaseFile}
                      onDelete={onRemoveArtifact}
                      isConnecting={connectingArtifact?.id === artifact.id}
                      isSelected={connectingArtifact !== null}
                      compact
                    />
                  </div>
                )
              })}
            </div>
            {/* Desktop: multi-column grid */}
            <div className="hidden sm:grid grid-cols-2 xl:grid-cols-3 gap-4 ml-4">
              {sectionArtifacts.map(function(artifact) {
                return (
                  <div key={artifact.id}>
                    <ArtifactCard
                      artifact={artifact}
                      connectionCount={getConnectionCount(artifact.id)}
                      onSelect={onSelectArtifact}
                      onConnect={handleConnectClick}
                      onMove={onMoveToCaseFile}
                      onDelete={onRemoveArtifact}
                      isConnecting={connectingArtifact?.id === artifact.id}
                      isSelected={connectingArtifact !== null}
                    />
                  </div>
                )
              })}
            </div>
          </>
        )}
        {isExpanded && sectionArtifacts.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-gray-500">
            No artifacts in this case file yet
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4 sm:space-y-6 pb-20 sm:pb-24">
      {/* Connection mode banner */}
      {connectingArtifact && (
        <div className="flex items-center justify-between p-3 sm:p-4 bg-cyan-950/30 border border-cyan-800 rounded-lg">
          <p className="text-cyan-200 text-sm sm:text-base truncate mr-2">
            Select an artifact to connect with{' '}
            <span className="font-medium">{connectingArtifact.title}</span>
          </p>
          <button
            onClick={function() { setConnectingArtifact(null) }}
            className="p-1 hover:bg-cyan-900/30 rounded-lg text-cyan-300 transition-colors flex-shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Case files sections */}
      {caseFiles.map(function(caseFile) {
        return renderCaseFileSection(caseFile)
      })}

      {/* Unsorted section */}
      {unsortedArtifacts.length > 0 && (
        <div className="space-y-3 sm:space-y-4">
          {/* Unsorted header */}
          <button
            onClick={function() { toggleCaseFile('unsorted') }}
            className={classNames(
              'w-full text-left p-3 sm:p-4 rounded-lg border transition-colors',
              'hover:border-gray-700 hover:bg-gray-800/50',
              'border-gray-800 bg-gray-800/20'
            )}
            style={{ borderLeftWidth: '4px', borderLeftColor: '#9ca3af' }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                {expandedCaseFiles.has('unsorted') ? (
                  <ChevronDown className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                ) : (
                  <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 text-gray-400" />
                )}
                <h3 className="text-base sm:text-lg font-semibold text-white">
                  Unsorted
                </h3>
                <span className="ml-1 sm:ml-2 px-2 py-0.5 rounded-full bg-gray-700 text-xs text-gray-300">
                  {unsortedArtifacts.length}
                </span>
              </div>
            </div>
          </button>

          {/* Unsorted artifacts - Mobile: single column, Desktop: grid */}
          {expandedCaseFiles.has('unsorted') && (
            <>
              {/* Mobile: single-column full-width cards */}
              <div className="sm:hidden space-y-3">
                {unsortedArtifacts.map(function(artifact) {
                  return (
                    <div key={artifact.id}>
                      <ArtifactCard
                        artifact={artifact}
                        connectionCount={getConnectionCount(artifact.id)}
                        onSelect={onSelectArtifact}
                        onConnect={handleConnectClick}
                        onMove={onMoveToCaseFile}
                        onDelete={onRemoveArtifact}
                        isConnecting={connectingArtifact?.id === artifact.id}
                        isSelected={connectingArtifact !== null}
                        compact
                      />
                    </div>
                  )
                })}
              </div>
              {/* Desktop: multi-column grid */}
              <div className="hidden sm:grid grid-cols-2 xl:grid-cols-3 gap-4 ml-4">
                {unsortedArtifacts.map(function(artifact) {
                  return (
                    <div key={artifact.id}>
                      <ArtifactCard
                        artifact={artifact}
                        connectionCount={getConnectionCount(artifact.id)}
                        onSelect={onSelectArtifact}
                        onConnect={handleConnectClick}
                        onMove={onMoveToCaseFile}
                        onDelete={onRemoveArtifact}
                        isConnecting={connectingArtifact?.id === artifact.id}
                        isSelected={connectingArtifact !== null}
                      />
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Floating action buttons - responsive */}
      <div className={classNames(
        'flex gap-2 sm:gap-3 fixed z-30',
        'bottom-6 left-3 right-3',
        'sm:bottom-8 sm:left-auto sm:right-8'
      )}>
        <button
          onClick={onCreateCaseFile}
          className={classNames(
            'flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm',
            'bg-gray-700 text-white hover:bg-gray-600 transition-colors shadow-lg',
            'flex-1 sm:flex-initial'
          )}
        >
          <FolderPlus className="w-4 h-4" />
          <span className="sm:inline">New Case</span>
        </button>
        <button
          onClick={onAddArtifact}
          className={classNames(
            'flex items-center justify-center gap-2 px-3 sm:px-4 py-2.5 sm:py-2 rounded-lg font-medium text-sm',
            'bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg',
            'flex-1 sm:flex-initial'
          )}
        >
          <Plus className="w-4 h-4" />
          <span className="sm:inline">Add Artifact</span>
        </button>
      </div>
    </div>
  )
}

export default BoardView

// Global styles for swipeable card row
if (typeof document !== 'undefined') {
  var styleId = 'swipeable-card-styles'
  if (!document.getElementById(styleId)) {
    var style = document.createElement('style')
    style.id = styleId
    style.textContent = '.swipeable-card-row::-webkit-scrollbar { display: none; } .swipeable-card-row { -ms-overflow-style: none; }'
    document.head.appendChild(style)
  }
}
