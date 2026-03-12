'use client'

import type { AiInsight } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
import {
  X, Zap, ThumbsUp, ThumbsDown, XCircle, Clock,
  MapPin, Users, GitBranch, Lightbulb, AlertTriangle, TrendingUp,
} from 'lucide-react'
import { useState, useCallback } from 'react'

interface InsightsDrawerProps {
  isOpen: boolean
  onClose: () => void
  insights: AiInsight[]
  onDismiss: (id: string) => Promise<boolean>
  onRate: (id: string, helpful: boolean) => Promise<boolean>
}

var INSIGHT_TYPE_CONFIG: Record<string, { icon: any; color: string; label: string }> = {
  spatial_cluster: { icon: MapPin, color: 'text-green-400', label: 'Spatial Pattern' },
  temporal_pattern: { icon: Clock, color: 'text-blue-400', label: 'Temporal Pattern' },
  witness_overlap: { icon: Users, color: 'text-purple-400', label: 'Witness Overlap' },
  source_correlation: { icon: GitBranch, color: 'text-cyan-400', label: 'Source Correlation' },
  cross_case_pattern: { icon: TrendingUp, color: 'text-amber-400', label: 'Cross-Case Pattern' },
  anomaly: { icon: AlertTriangle, color: 'text-red-400', label: 'Anomaly' },
  suggestion: { icon: Lightbulb, color: 'text-yellow-400', label: 'Suggestion' },
  community_convergence: { icon: Users, color: 'text-indigo-400', label: 'Community Signal' },
}

export function InsightsDrawer({
  isOpen,
  onClose,
  insights,
  onDismiss,
  onRate,
}: InsightsDrawerProps) {
  var [ratedIds, setRatedIds] = useState<Set<string>>(new Set())

  var handleRate = useCallback(function(id: string, helpful: boolean) {
    onRate(id, helpful)
    setRatedIds(function(prev) {
      var next = new Set(prev)
      next.add(id)
      return next
    })
  }, [onRate])

  var activeInsights = insights.filter(function(i) { return !i.dismissed })

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-md bg-gray-900 border-l border-gray-800 h-full flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <Zap className="w-4 h-4 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-white">AI Insights</h2>
              <p className="text-xs text-gray-500">
                {activeInsights.length + ' active insight' + (activeInsights.length !== 1 ? 's' : '')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Insights List */}
        <div className="flex-1 overflow-y-auto">
          {activeInsights.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <Zap className="w-10 h-10 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium mb-1">No active insights</p>
              <p className="text-gray-600 text-sm">
                Add more artifacts and run a Deep Scan to generate AI-powered insights about your research.
              </p>
            </div>
          ) : (
            <div className="p-4 space-y-3">
              {activeInsights.map(function(insight) {
                var config = INSIGHT_TYPE_CONFIG[insight.insight_type] || INSIGHT_TYPE_CONFIG.suggestion
                var IconComponent = config.icon
                var isRated = ratedIds.has(insight.id)
                var confidencePct = Math.round(insight.confidence * 100)

                return (
                  <div
                    key={insight.id}
                    className="bg-gray-800 border border-gray-700 rounded-xl p-4 space-y-3"
                  >
                    {/* Type badge + confidence */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <IconComponent className={classNames('w-3.5 h-3.5', config.color)} />
                        <span className={classNames('text-xs font-medium', config.color)}>
                          {config.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1">
                          <div className="w-12 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={classNames(
                                'h-full rounded-full',
                                confidencePct >= 80 ? 'bg-green-500' :
                                confidencePct >= 50 ? 'bg-amber-500' : 'bg-gray-500'
                              )}
                              style={{ width: confidencePct + '%' }}
                            />
                          </div>
                          <span className="text-xs text-gray-500">{confidencePct + '%'}</span>
                        </div>
                      </div>
                    </div>

                    {/* Title + Body */}
                    <div>
                      <h3 className="text-sm font-medium text-white mb-1">{insight.title}</h3>
                      <p className="text-xs text-gray-400 leading-relaxed">{insight.body}</p>
                    </div>

                    {/* Related artifacts count */}
                    {insight.artifact_ids && insight.artifact_ids.length > 0 && (
                      <p className="text-xs text-gray-600">
                        {insight.artifact_ids.length + ' related artifact' + (insight.artifact_ids.length !== 1 ? 's' : '')}
                      </p>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-700/50">
                      <div className="flex items-center gap-1">
                        {isRated ? (
                          <span className="text-xs text-gray-500">Thanks for the feedback</span>
                        ) : (
                          <>
                            <button
                              onClick={function() { handleRate(insight.id, true) }}
                              className="p-1.5 text-gray-500 hover:text-green-400 hover:bg-green-500/10 rounded transition-colors"
                              title="Helpful"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={function() { handleRate(insight.id, false) }}
                              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                              title="Not helpful"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                      <button
                        onClick={function() { onDismiss(insight.id) }}
                        className="flex items-center gap-1 px-2 py-1 text-xs text-gray-500 hover:text-gray-300 hover:bg-gray-700 rounded transition-colors"
                      >
                        <XCircle className="w-3 h-3" />
                        Dismiss
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default InsightsDrawer
