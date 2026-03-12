'use client'

import type { CaseFile, ConstellationTheory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import { supabase } from '@/lib/supabase'
import { Plus, Zap, Circle, ChevronRight, Sparkles, Loader2, Lightbulb, Globe, Lock, Share2 } from 'lucide-react'
import { useState, useCallback, useEffect } from 'react'

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
  onRefresh?: () => void
  onCreateTheory?: () => void
  onEditTheory?: (theory: ConstellationTheory) => void
  onShareTheory?: (theory: ConstellationTheory) => void
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
  onRefresh,
  onCreateTheory,
  onEditTheory,
  onShareTheory,
}: ResearchHubSidebarProps) {
  var [isAnalyzing, setIsAnalyzing] = useState(false)
  var [analyzeError, setAnalyzeError] = useState<string | null>(null)
  var [analyzeResult, setAnalyzeResult] = useState<string | null>(null)
  var [theories, setTheories] = useState<ConstellationTheory[]>([])
  var [theoriesLoading, setTheoriesLoading] = useState(false)

  // Fetch theories
  useEffect(function() {
    var cancelled = false
    async function loadTheories() {
      setTheoriesLoading(true)
      try {
        var session = await supabase.auth.getSession()
        var token = session.data.session?.access_token
        if (!token) return

        var response = await fetch('/api/research-hub/theories', {
          headers: { 'Authorization': 'Bearer ' + token },
        })
        if (!response.ok) return

        var data = await response.json()
        if (!cancelled) {
          setTheories(data.theories || [])
        }
      } catch (err) {
        // Silently fail — theories are a nice-to-have in sidebar
      } finally {
        if (!cancelled) setTheoriesLoading(false)
      }
    }
    loadTheories()
    return function() { cancelled = true }
  }, [stats])

  var handleDeepScan = useCallback(async function() {
    setIsAnalyzing(true)
    setAnalyzeError(null)
    setAnalyzeResult(null)

    try {
      var session = await supabase.auth.getSession()
      var token = session.data.session?.access_token
      if (!token) {
        setAnalyzeError('Not authenticated')
        return
      }

      var response = await fetch('/api/research-hub/analyze', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
      })

      if (!response.ok) {
        var errorData = await response.json()
        setAnalyzeError(errorData.error || 'Analysis failed')
        return
      }

      var data = await response.json()
      setAnalyzeResult(data.insights_generated + ' new insight' + (data.insights_generated !== 1 ? 's' : '') + ' found')

      // Refresh the hub data to show new insights
      if (onRefresh) onRefresh()
    } catch (err) {
      setAnalyzeError('Network error')
    } finally {
      setIsAnalyzing(false)
    }
  }, [onRefresh])

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

        {/* Theories Section */}
        <div className="px-4 py-4 border-t border-gray-800 mt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase text-gray-400 tracking-wider flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-400" />
              Theories
            </h3>
            {onCreateTheory && (
              <button
                onClick={onCreateTheory}
                className="p-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800 rounded transition-colors"
                title="New Theory"
                aria-label="New Theory"
              >
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>

          {theories.length === 0 && !theoriesLoading && (
            <p className="text-xs text-gray-600 px-1">
              No theories yet. Create one to document your research hypotheses.
            </p>
          )}

          <div className="space-y-1">
            {theories.map(function(theory) {
              return (
                <div key={theory.id} className="group">
                  <button
                    onClick={function() { if (onEditTheory) onEditTheory(theory) }}
                    className={classNames(
                      'w-full text-left px-3 py-2 rounded-lg transition-all duration-200',
                      'flex items-center gap-2 text-sm',
                      'text-gray-300 hover:bg-gray-800/50 hover:text-gray-100'
                    )}
                  >
                    {theory.is_public ? (
                      <Globe className="w-3 h-3 text-green-400 flex-shrink-0" />
                    ) : (
                      <Lock className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    )}
                    <span className="truncate flex-1">{theory.title}</span>
                    {onShareTheory && theory.is_public && (
                      <button
                        onClick={function(e) {
                          e.stopPropagation()
                          onShareTheory(theory)
                        }}
                        className="p-0.5 text-gray-600 hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-all"
                        title="Share"
                      >
                        <Share2 className="w-3 h-3" />
                      </button>
                    )}
                  </button>
                </div>
              )
            })}
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

          {/* Deep Scan Button */}
          {stats.totalArtifacts >= 3 && (
            <div className="mt-3">
              <button
                onClick={handleDeepScan}
                disabled={isAnalyzing}
                className={classNames(
                  'w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200',
                  'flex items-center justify-center gap-2',
                  isAnalyzing
                    ? 'bg-cyan-600/20 text-cyan-300 cursor-wait'
                    : 'bg-gray-800 text-gray-300 hover:bg-gray-700 hover:text-white'
                )}
              >
                {isAnalyzing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isAnalyzing ? 'Analyzing...' : 'Run Deep Scan'}
              </button>

              {analyzeError && (
                <p className="mt-2 text-xs text-red-400 px-1">{analyzeError}</p>
              )}
              {analyzeResult && (
                <p className="mt-2 text-xs text-cyan-400 px-1">{analyzeResult}</p>
              )}
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}

export default ResearchHubSidebar
