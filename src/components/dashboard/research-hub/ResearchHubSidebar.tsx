'use client'

import type { CaseFile } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { Plus, Zap, Circle, ChevronRight } from 'lucide-react'
import { useState } from 'react'

interface CaseFileWithCount extends CaseFile {
  artifact_count: number
}

interface ResearchHubSidebarProps {
  caseFiles: CaseFileWithCount[]
  activeCaseFileId: string | null
  insightCount: number
  stats: { totalArtifacts: number; totalCaseFiles: number; totalConnections: number }
  onSelectCaseFile: (id: string | null) => void
  onCreateCaseFile: () => void
  onAddArtifact: () => void
  onOpenInsights: () => void
}

export function ResearchHubSidebar({
  caseFiles,
  activeCaseFileId,
  insightCount,
  stats,
  onSelectCaseFile,
  onCreateCaseFile,
  onAddArtifact,
  onOpenInsights,
}: ResearchHubSidebarProps) {
  const unsortedCount = stats.totalArtifacts - caseFiles.reduce((acc, cf) => acc + cf.artifact_count, 0)

  return (
    <aside className="hidden lg:flex flex-col w-80 h-screen bg-gray-900 border-r border-gray-800 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-5 border-b border-gray-800">
        <h2 className="text-lg font-semibold text-white">Research Hub</h2>
        <p className="mt-1 text-sm text-gray-400">
          {stats.totalArtifacts} artifacts · {stats.totalCaseFiles} cases
        </p>
      </div>

      {/* Primary CTA */}
      <div className="px-4 py-4 border-b border-gray-800">
        <button
          onClick={onAddArtifact}
          className={classNames(
            'w-full px-4 py-2.5 rounded-lg font-medium transition-all duration-200',
            'bg-indigo-600 hover:bg-indigo-500 text-white',
            'flex items-center justify-center gap-2'
          )}
        >
          <Plus className="w-4 h-4" />
          <span>Add Artifact</span>
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {/* Case Files Section */}
        <div className="px-4 py-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider">
              Case Files
            </h3>
            <button
              onClick={onCreateCaseFile}
              className="p-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
              title="New Case File"
              aria-label="New Case File"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1">
            {/* All Artifacts */}
            <button
              onClick={() => onSelectCaseFile(null)}
              className={classNames(
                'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200',
                'flex items-center gap-2 text-sm',
                activeCaseFileId === null
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800/50 hover:text-gray-100'
              )}
            >
              <Circle className="w-2 h-2 flex-shrink-0 text-gray-400" fill="currentColor" />
              <span>All Artifacts</span>
              <span className="ml-auto text-xs text-gray-500">({stats.totalArtifacts})</span>
            </button>

            {/* Unsorted */}
            {unsortedCount > 0 && (
              <button
                onClick={() => onSelectCaseFile('unsorted')}
                className={classNames(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200',
                  'flex items-center gap-2 text-sm',
                  activeCaseFileId === 'unsorted'
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800/50 hover:text-gray-100'
                )}
              >
                <Circle className="w-2 h-2 flex-shrink-0 text-gray-400" fill="currentColor" />
                <span>Unsorted</span>
                <span className="ml-auto text-xs text-gray-500">({unsortedCount})</span>
              </button>
            )}

            {/* Divider */}
            {caseFiles.length > 0 && (
              <div className="my-2 h-px bg-gray-800" />
            )}

            {/* Case File Items */}
            {caseFiles.map((caseFile) => (
              <button
                key={caseFile.id}
                onClick={() => onSelectCaseFile(caseFile.id)}
                className={classNames(
                  'w-full text-left px-3 py-2.5 rounded-lg transition-all duration-200',
                  'flex items-center gap-2 text-sm',
                  activeCaseFileId === caseFile.id
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-300 hover:bg-gray-800/50 hover:text-gray-100'
                )}
              >
                <Circle
                  className="w-2 h-2 flex-shrink-0"
                  fill={caseFile.cover_color || '#4B5563'}
                  color={caseFile.cover_color || '#4B5563'}
                />
                <span className="truncate flex-1">{caseFile.title}</span>
                <span className="text-xs text-gray-500 flex-shrink-0">({caseFile.artifact_count})</span>
              </button>
            ))}
          </div>
        </div>

        {/* AI Insights Section */}
        <div className="px-4 py-4 border-t border-gray-800 mt-4">
          <button
            onClick={onOpenInsights}
            className={classNames(
              'w-full text-left px-3 py-3 rounded-lg transition-all duration-200',
              'flex items-center gap-3 text-sm',
              'hover:bg-gray-800 group'
            )}
          >
            <Zap className="w-4 h-4 text-cyan-400 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="font-medium text-white flex items-center gap-2">
                AI Insights
                {insightCount > 0 && (
                  <span className={classNames(
                    'inline-flex items-center justify-center',
                    'w-5 h-5 text-xs font-semibold',
                    'bg-cyan-600/30 text-cyan-400 rounded-full',
                    insightCount > 0 && 'animate-pulse'
                  )}>
                    {insightCount}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">Click to view insights</p>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-gray-400 flex-shrink-0 transition-colors" />
          </button>
        </div>
      </div>
    </aside>
  )
}

export default ResearchHubSidebar
