'use client'

import React, { useEffect, useState } from 'react'
import { Sparkles, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface PatternInsight {
  id: string
  title: string
  content: string
  summary: string
  generated_at: string
  model_used: string
}

interface InsightNarrativeProps {
  patternId: string
  className?: string
}

export default function InsightNarrative({ patternId, className }: InsightNarrativeProps) {
  const [insight, setInsight] = useState<PatternInsight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchInsight = async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/patterns/${patternId}/insight`)
      if (!response.ok) throw new Error('Failed to fetch insight')
      const data = await response.json()
      setInsight(data.insight)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load insight')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchInsight()
  }, [patternId])

  if (loading) {
    return (
      <div className={classNames('glass-card p-6', className)}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h3 className="font-display font-semibold text-white">AI Analysis</h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin mx-auto mb-2" />
            <p className="text-gray-400 text-sm">Generating insight...</p>
          </div>
        </div>
      </div>
    )
  }

  if (error || !insight) {
    return (
      <div className={classNames('glass-card p-6', className)}>
        <div className="flex items-center gap-2 mb-4">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h3 className="font-display font-semibold text-white">AI Analysis</h3>
        </div>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <AlertCircle className="w-8 h-8 text-gray-500 mx-auto mb-2" />
            <p className="text-gray-400 text-sm mb-4">
              {error || 'Unable to generate insight'}
            </p>
            <button
              onClick={fetchInsight}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white text-sm rounded-lg transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              Try Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={classNames('glass-card p-6', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h3 className="font-display font-semibold text-white">AI Analysis</h3>
        </div>
        <span className="text-xs text-gray-500">
          Generated {new Date(insight.generated_at).toLocaleDateString()}
        </span>
      </div>

      <div className="prose prose-invert prose-sm max-w-none">
        <h4 className="text-lg font-medium text-white mt-0 mb-3">{insight.title}</h4>
        <div className="text-gray-300 leading-relaxed whitespace-pre-wrap">
          {insight.content}
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-700/50 flex items-center justify-end text-xs text-gray-500">
        <button
          onClick={fetchInsight}
          className="flex items-center gap-1 text-gray-400 hover:text-primary-400 transition-colors"
        >
          <RefreshCw className="w-3 h-3" />
          Regenerate
        </button>
      </div>
    </div>
  )
}
