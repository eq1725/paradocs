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
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useState, useMemo } from 'react'

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
  const [expandedCaseFiles, setExpandedCaseFiles] = useState<Set<string>>(
    new Set(caseFiles.map((cf) => cf.id))
  )
  const [connectingArtifact, setConnectingArtifact] =
    useState<ConstellationArtifact | null>(null)
  const [selectedTab, setSelectedTab] = useState<'all' | 'unsorted' | string>(
    'all'
  )
  const [isDesktop, setIsDesktop] = useState(true)

  // Compute unsorted artifacts
  const artifactsInCaseFiles = useMemo(() => {
    const ids = new Set<string>()
    caseFiles.forEach((cf) => {
      cf.artifacts?.forEach((a) => ids.add(a.id))
    })
    return ids
  }, [caseFiles])

  const unsortedArtifacts = useMemo(
    () => artifacts.filter((a) => !artifactsInCaseFiles.has(a.id)),
    [artifacts, artifactsInCaseFiles]
  )

  const handleConnectClick = (artifact: ConstellationArtifact) => {
    setConnectingArtifact(artifact)
    onConnect(artifact)
  }

  const handleSelectConnectionTarget = (target: ConstellationArtifact) => {
    if (connectingArtifact && connectingArtifact.id !== target.id) {
      // TODO: Create connection between connectingArtifact and target
      setConnectingArtifact(null)
    }
  }

  const toggleCaseFile = (caseFileId: string) => {
    const newExpanded = new Set(expandedCaseFiles)
    if (newExpanded.has(caseFileId)) {
      newExpanded.delete(caseFileId)
    } else {
      newExpanded.add(caseFileId)
    }
    setExpandedCaseFiles(newExpanded)
  }

  const getConnectionCount = (artifactId: string) => {
    return connections.filter(
      (c) => c.artifact_a_id === artifactId || c.artifact_b_id === artifactId
    ).length
  }

  // Empty state
  if (artifacts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-96 text-center px-4">
        <div className="w-24 h-24 mb-6 rounded-full bg-gray-800/50 flex items-center justify-center">
          <Plus className="w-12 h-12 text-gray-600" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">
          Start your research
        </h2>
        <p className="text-gray-400 mb-6 max-w-sm">
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

  // Desktop view: masonry grid
  if (isDesktop) {
    return (
      <div className="space-y-6">
        {/* Connection mode banner */}
        {connectingArtifact && (
          <div className="flex items-center justify-between p-4 bg-cyan-950/30 border border-cyan-800 rounded-lg">
            <p className="text-cyan-200">
              Select an artifact to connect with{' '}
              <span className="font-medium">{connectingArtifact.title}</span>
            </p>
            <button
              onClick={() => setConnectingArtifact(null)}
              className="p-1 hover:bg-cyan-900/30 rounded-lg text-cyan-300 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* Case files sections */}
        {caseFiles.map((caseFile) => (
          <div key={caseFile.id} className="space-y-4">
            {/* Case file header */}
            <div
              className={classNames(
                'w-full text-left p-4 rounded-lg border transition-colors cursor-pointer',
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
                <div className="flex items-center gap-2">
                  {expandedCaseFiles.has(caseFile.id) ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <h3 className="text-lg font-semibold text-white">
                    {caseFile.title}
                  </h3>
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-700 text-xs text-gray-300">
                    {caseFile.artifact_count}
                  </span>
                </div>
                {onDeleteCaseFile && (
                  <button
                    onClick={function(e) {
                      e.stopPropagation()
                      if (window.confirm('Delete this case file? Artifacts inside will become unsorted.')) {
                        onDeleteCaseFile(caseFile.id)
                      }
                    }}
                    className="p-1.5 rounded-lg hover:bg-red-900/30 text-gray-500 hover:text-red-400 transition-colors"
                    title="Delete case file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
              <p className="text-sm text-gray-500 ml-7">
                {caseFile.visibility === 'private' ? 'Private' : 'Shared'} · Created{' '}
                {new Date(caseFile.created_at).toLocaleDateString('en-US', {
                  year: 'numeric',
                  month: 'short',
                })}
              </p>
            </div>

            {/* Case file artifacts grid */}
            {expandedCaseFiles.has(caseFile.id) && (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 ml-4">
                {caseFile.artifacts?.map((artifact, idx) => (
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
                ))}

                {(caseFile.artifacts || []).length === 0 && (
                  <div className="col-span-full px-3 py-6 text-center text-sm text-gray-500">
                    No artifacts in this case file yet
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Unsorted section */}
        {unsortedArtifacts.length > 0 && (
          <div className="space-y-4">
            {/* Unsorted header */}
            <button
              onClick={() => toggleCaseFile('unsorted')}
              className={classNames(
                'w-full text-left p-4 rounded-lg border transition-colors',
                'hover:border-gray-700 hover:bg-gray-800/50',
                'border-gray-800 bg-gray-800/20'
              )}
              style={{ borderLeftWidth: '4px', borderLeftColor: '#9ca3af' }}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  {expandedCaseFiles.has('unsorted') ? (
                    <ChevronDown className="w-5 h-5 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-gray-400" />
                  )}
                  <h3 className="text-lg font-semibold text-white">
                    Unsorted
                  </h3>
                  <span className="ml-2 px-2 py-0.5 rounded-full bg-gray-700 text-xs text-gray-300">
                    {unsortedArtifacts.length}
                  </span>
                </div>
              </div>
            </button>

            {/* Unsorted artifacts grid */}
            {expandedCaseFiles.has('unsorted') && (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4 ml-4">
                {unsortedArtifacts.map((artifact) => (
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* Floating action buttons */}
        <div className="flex gap-3 fixed bottom-8 right-8">
          <button
            onClick={onCreateCaseFile}
            className={classNames(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium',
              'bg-gray-700 text-white hover:bg-gray-600 transition-colors shadow-lg'
            )}
          >
            <FolderPlus className="w-4 h-4" />
            New Case File
          </button>
          <button
            onClick={onAddArtifact}
            className={classNames(
              'flex items-center gap-2 px-4 py-2 rounded-lg font-medium',
              'bg-blue-600 text-white hover:bg-blue-700 transition-colors shadow-lg'
            )}
          >
            <Plus className="w-4 h-4" />
            Add Artifact
          </button>
        </div>
      </div>
    )
  }

  // Mobile view: tabbed interface
  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex gap-2 overflow-x-auto pb-2 -mx-4 px-4">
        <button
          onClick={() => setSelectedTab('all')}
          className={classNames(
            'px-4 py-2 rounded-full font-medium whitespace-nowrap text-sm transition-colors',
            selectedTab === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          )}
        >
          All ({artifacts.length})
        </button>
        <button
          onClick={() => setSelectedTab('unsorted')}
          className={classNames(
            'px-4 py-2 rounded-full font-medium whitespace-nowrap text-sm transition-colors',
            selectedTab === 'unsorted'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-800 text-gray-400 hover:text-white'
          )}
        >
          Unsorted ({unsortedArtifacts.length})
        </button>
        {caseFiles.map((caseFile) => (
          <button
            key={caseFile.id}
            onClick={() => setSelectedTab(caseFile.id)}
            className={classNames(
              'px-4 py-2 rounded-full font-medium whitespace-nowrap text-sm transition-colors',
              selectedTab === caseFile.id
                ? 'bg-blue-600 text-white'
                : 'bg-gray-800 text-gray-400 hover:text-white'
            )}
          >
            {caseFile.title} ({caseFile.artifact_count})
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="space-y-3">
        {selectedTab === 'all' &&
          artifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
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
          ))}

        {selectedTab === 'unsorted' &&
          unsortedArtifacts.map((artifact) => (
            <ArtifactCard
              key={artifact.id}
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
          ))}

        {selectedTab !== 'all' &&
          selectedTab !== 'unsorted' &&
          caseFiles
            .find((cf) => cf.id === selectedTab)
            ?.artifacts?.map((artifact) => (
              <ArtifactCard
                key={artifact.id}
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
            ))}
      </div>

      {/* Mobile action buttons */}
      <div className="flex gap-2 fixed bottom-8 left-4 right-4">
        <button
          onClick={onCreateCaseFile}
          className={classNames(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm',
            'bg-gray-700 text-white hover:bg-gray-600 transition-colors'
          )}
        >
          <FolderPlus className="w-4 h-4" />
          New Case
        </button>
        <button
          onClick={onAddArtifact}
          className={classNames(
            'flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg font-medium text-sm',
            'bg-blue-600 text-white hover:bg-blue-700 transition-colors'
          )}
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
      </div>
    </div>
  )
}

export default BoardView
