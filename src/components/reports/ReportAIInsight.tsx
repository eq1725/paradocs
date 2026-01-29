/**
 * ReportAIInsight Component
 *
 * Displays AI-generated analysis for a report including:
 * - Contextual analysis narrative
 * - Credibility assessment with factors
 * - Mundane explanations
 * - Similar historical cases
 */

import React, { useEffect, useState } from 'react'
import { Sparkles, RefreshCw, Shield, AlertCircle, History, ChevronDown, ChevronUp } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface CredibilityFactor {
  name: string
  impact: 'positive' | 'negative' | 'neutral'
  description: string
}

interface CredibilityAnalysis {
  score: number
  reasoning: string
  factors: CredibilityFactor[]
}

interface MundaneExplanation {
  explanation: string
  likelihood: 'high' | 'medium' | 'low'
  reasoning: string
}

interface SimilarCase {
  title: string
  similarity_reason: string
  year?: number
  location?: string
}

interface ReportInsight {
  id: string
  title: string
  summary: string
  content: string
  credibility_analysis: CredibilityAnalysis | null
  similar_cases: SimilarCase[] | null
  mundane_explanations: MundaneExplanation[] | null
  generated_at: string
}

interface Props {
  reportSlug: string
  className?: string
}

export default function ReportAIInsight({ reportSlug, className }: Props) {
  const [insight, setInsight] = useState<ReportInsight | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [regenerating, setRegenerating] = useState(false)
  const [expandedSections, setExpandedSections] = useState({
    credibility: true,
    mundane: false,
    similar: false
  })

  useEffect(() => {
    fetchInsight()
  }, [reportSlug])

  async function fetchInsight() {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/reports/${reportSlug}/insight`)
      if (!res.ok) {
        throw new Error('Failed to fetch insight')
      }
      const data = await res.json()
      setInsight(data.insight)
    } catch (err) {
      setError('Failed to generate analysis. Please try again.')
      console.error('Error fetching report insight:', err)
    } finally {
      setLoading(false)
    }
  }

  async function handleRegenerate() {
    setRegenerating(true)
    await fetchInsight()
    setRegenerating(false)
  }

  function toggleSection(section: keyof typeof expandedSections) {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }))
  }

  if (loading) {
    return (
      <div className={classNames('glass-card p-6', className)}>
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary-400 animate-pulse" />
          <h3 className="font-medium text-white">AI Analysis</h3>
        </div>
        <div className="flex flex-col items-center justify-center py-8">
          <div className="w-8 h-8 border-2 border-primary-400 border-t-transparent rounded-full animate-spin mb-3" />
          <p className="text-gray-400 text-sm">Generating analysis...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={classNames('glass-card p-6', className)}>
        <div className="flex items-center gap-3 mb-4">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h3 className="font-medium text-white">AI Analysis</h3>
        </div>
        <div className="text-center py-6">
          <p className="text-red-400 mb-4">{error}</p>
          <button
            onClick={handleRegenerate}
            className="btn btn-primary text-sm"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  if (!insight) return null

  const credibility = insight.credibility_analysis
  const credibilityColor = credibility
    ? credibility.score >= 70 ? 'text-green-400'
      : credibility.score >= 40 ? 'text-yellow-400'
        : 'text-red-400'
    : 'text-gray-400'

  return (
    <div className={classNames('glass-card p-6', className)}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Sparkles className="w-5 h-5 text-primary-400" />
          <h3 className="font-medium text-white">AI Analysis</h3>
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>
            {new Date(insight.generated_at).toLocaleDateString()}
          </span>
          <button
            onClick={handleRegenerate}
            disabled={regenerating}
            className="p-1 hover:bg-white/10 rounded transition-colors disabled:opacity-50"
            title="Regenerate analysis"
          >
            <RefreshCw className={classNames('w-4 h-4', regenerating && 'animate-spin')} />
          </button>
        </div>
      </div>

      {/* Title */}
      <h4 className="text-lg font-medium text-white mb-2">
        {insight.title}
      </h4>

      {/* Main Narrative */}
      <div className="prose prose-invert prose-sm max-w-none mb-6">
        <p className="text-gray-300 whitespace-pre-wrap leading-relaxed">
          {insight.content}
        </p>
      </div>

      {/* Credibility Assessment */}
      {credibility && (
        <div className="border-t border-white/10 pt-4 mb-4">
          <button
            onClick={() => toggleSection('credibility')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Credibility Assessment</span>
              <span className={classNames('text-sm font-bold', credibilityColor)}>
                {credibility.score}/100
              </span>
            </div>
            {expandedSections.credibility ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSections.credibility && (
            <div className="mt-3 space-y-3">
              <p className="text-sm text-gray-400">{credibility.reasoning}</p>
              {credibility.factors.length > 0 && (
                <div className="space-y-2">
                  {credibility.factors.map((factor, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <span className={classNames(
                        'w-2 h-2 rounded-full mt-1.5 flex-shrink-0',
                        factor.impact === 'positive' ? 'bg-green-400' :
                          factor.impact === 'negative' ? 'bg-red-400' : 'bg-gray-400'
                      )} />
                      <div>
                        <span className="text-white font-medium">{factor.name}:</span>{' '}
                        <span className="text-gray-400">{factor.description}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Mundane Explanations */}
      {insight.mundane_explanations && insight.mundane_explanations.length > 0 && (
        <div className="border-t border-white/10 pt-4 mb-4">
          <button
            onClick={() => toggleSection('mundane')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Conventional Explanations</span>
            </div>
            {expandedSections.mundane ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSections.mundane && (
            <div className="mt-3 space-y-3">
              {insight.mundane_explanations.map((exp, i) => (
                <div key={i} className="bg-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-white">{exp.explanation}</span>
                    <span className={classNames(
                      'text-xs px-2 py-0.5 rounded-full',
                      exp.likelihood === 'high' ? 'bg-yellow-500/20 text-yellow-400' :
                        exp.likelihood === 'medium' ? 'bg-blue-500/20 text-blue-400' :
                          'bg-gray-500/20 text-gray-400'
                    )}>
                      {exp.likelihood} likelihood
                    </span>
                  </div>
                  <p className="text-sm text-gray-400">{exp.reasoning}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Similar Cases */}
      {insight.similar_cases && insight.similar_cases.length > 0 && (
        <div className="border-t border-white/10 pt-4">
          <button
            onClick={() => toggleSection('similar')}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <History className="w-4 h-4 text-gray-400" />
              <span className="text-sm font-medium text-white">Similar Historical Cases</span>
            </div>
            {expandedSections.similar ? (
              <ChevronUp className="w-4 h-4 text-gray-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-gray-400" />
            )}
          </button>

          {expandedSections.similar && (
            <div className="mt-3 space-y-2">
              {insight.similar_cases.map((case_, i) => (
                <div key={i} className="text-sm">
                  <span className="text-white font-medium">{case_.title}</span>
                  {(case_.year || case_.location) && (
                    <span className="text-gray-500">
                      {' '}({[case_.year, case_.location].filter(Boolean).join(', ')})
                    </span>
                  )}
                  <span className="text-gray-400"> - {case_.similarity_reason}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between text-xs text-gray-500">
        <span>Powered by Claude</span>
      </div>
    </div>
  )
}
