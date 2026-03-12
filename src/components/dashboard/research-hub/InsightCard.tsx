'use client'

import type { AiInsight } from '@/lib/database.types'
import { classNames, truncate } from '@/lib/utils'
import { Sparkles, X, ThumbsUp, ThumbsDown } from 'lucide-react'
import { useState } from 'react'

interface InsightCardProps {
  insight: AiInsight
  onDismiss: (id: string) => void
  onRate: (id: string, helpful: boolean) => void
  onViewArtifacts?: (artifactIds: string[]) => void
}

export function InsightCard({
  insight,
  onDismiss,
  onRate,
  onViewArtifacts,
}: InsightCardProps) {
  const [rated, setRated] = useState<boolean | null>(null)
  const confidencePercent = Math.round((insight.confidence || 0) * 100)

  const handleRate = (helpful: boolean) => {
    setRated(helpful)
    onRate(insight.id, helpful)
  }

  const handleDismiss = () => {
    onDismiss(insight.id)
  }

  return (
    <div className={classNames(
      'rounded-xl border overflow-hidden',
      'bg-gradient-to-r from-cyan-950/30 to-gray-900',
      'border-cyan-800/50 backdrop-blur-sm',
      'p-4 space-y-4'
    )}>
      {/* Header */}
      <div className="flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-cyan-400 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-white text-sm">
            {insight.title}
          </h3>
        </div>
        <button
          onClick={handleDismiss}
          className="p-1 text-gray-400 hover:text-gray-300 hover:bg-gray-800/50 rounded transition-colors flex-shrink-0"
          title="Dismiss"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Body */}
      <p className="text-sm text-gray-300 leading-relaxed">
        {truncate(insight.body, 150)}
      </p>

      {/* Confidence Bar */}
      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-gray-400">
            Confidence
          </span>
          <span className="text-xs text-gray-500">
            {confidencePercent}%
          </span>
        </div>
        <div className="w-full h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className={classNames(
              'h-full rounded-full transition-all duration-300',
              confidencePercent >= 80 ? 'bg-emerald-500' :
              confidencePercent >= 60 ? 'bg-cyan-500' :
              'bg-amber-500'
            )}
            style={{ width: confidencePercent + '%' }}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-2">
        <button
          onClick={() => handleRate(true)}
          className={classNames(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'transition-all duration-200',
            rated === true
              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-emerald-400 hover:bg-gray-800 border border-transparent'
          )}
          title="Mark as helpful"
        >
          <ThumbsUp className="w-3.5 h-3.5" />
          <span>Helpful</span>
        </button>

        <button
          onClick={() => handleRate(false)}
          className={classNames(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium',
            'transition-all duration-200',
            rated === false
              ? 'bg-red-500/20 text-red-400 border border-red-500/30'
              : 'bg-gray-800/50 text-gray-400 hover:text-red-400 hover:bg-gray-800 border border-transparent'
          )}
          title="Mark as not helpful"
        >
          <ThumbsDown className="w-3.5 h-3.5" />
          <span>Not helpful</span>
        </button>

        {insight.artifact_ids && insight.artifact_ids.length > 0 && onViewArtifacts && (
          <button
            onClick={() => onViewArtifacts(insight.artifact_ids)}
            className={classNames(
              'ml-auto px-3 py-1.5 rounded-lg text-xs font-medium',
              'bg-cyan-600/20 text-cyan-400 hover:bg-cyan-600/30',
              'border border-cyan-500/30 hover:border-cyan-500/50',
              'transition-all duration-200'
            )}
          >
            View {insight.artifact_ids.length} artifact{insight.artifact_ids.length !== 1 ? 's' : ''}
          </button>
        )}
      </div>
    </div>
  )
}

export default InsightCard
