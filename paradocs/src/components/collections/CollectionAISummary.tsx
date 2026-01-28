/**
 * Collection AI Summary Component
 *
 * Displays AI-generated insights about a collection's reports
 */

import { useState } from 'react'
import Link from 'next/link'
import {
  Sparkles,
  Loader2,
  ChevronDown,
  ChevronUp,
  MapPin,
  Calendar,
  Tag,
  TrendingUp,
  Lightbulb,
  FileText,
  RefreshCw,
  AlertCircle
} from 'lucide-react'

interface KeyFindings {
  total_reports: number
  date_range: { earliest: string; latest: string }
  primary_category: string
  geographic_focus: string
  common_patterns: string[]
  notable_reports: Array<{ id: string; title: string; reason: string }>
}

interface SummaryData {
  summary: string
  key_findings: KeyFindings
  patterns_analysis?: string
  recommendations?: string[]
  cached: boolean
  generated_at: string
}

interface CollectionAISummaryProps {
  collectionId: string
  reportCount: number
}

export default function CollectionAISummary({ collectionId, reportCount }: CollectionAISummaryProps) {
  const [summaryData, setSummaryData] = useState<SummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)
  const [showRecommendations, setShowRecommendations] = useState(false)

  const generateSummary = async () => {
    if (reportCount === 0) {
      setError('Add reports to generate an AI summary')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const res = await fetch(`/api/collections/${collectionId}/summarize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary_type: 'overview' })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to generate summary')
      }

      setSummaryData(data)
      setExpanded(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summary')
    } finally {
      setLoading(false)
    }
  }

  const formatCategory = (category: string) => {
    return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  const formatDate = (dateStr: string) => {
    if (dateStr === 'Unknown') return dateStr
    try {
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })
    } catch {
      return dateStr
    }
  }

  // Not yet generated state
  if (!summaryData && !loading) {
    return (
      <div className="bg-gradient-to-r from-purple-900/20 to-primary-900/20 rounded-lg border border-purple-500/30 p-6">
        <div className="flex items-start gap-4">
          <div className="p-3 bg-purple-500/20 rounded-lg">
            <Sparkles className="w-6 h-6 text-purple-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-white mb-2">
              AI Collection Analysis
            </h3>
            <p className="text-gray-400 text-sm mb-4">
              Generate an AI-powered summary of this collection to discover patterns,
              correlations, and research insights across all {reportCount} reports.
            </p>
            {error && (
              <div className="flex items-center gap-2 text-red-400 text-sm mb-4">
                <AlertCircle className="w-4 h-4" />
                {error}
              </div>
            )}
            <button
              onClick={generateSummary}
              disabled={loading || reportCount === 0}
              className="btn btn-primary flex items-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  Generate AI Summary
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Loading state
  if (loading) {
    return (
      <div className="bg-surface-800 rounded-lg border border-surface-600 p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-center">
            <Loader2 className="w-8 h-8 text-purple-400 animate-spin mx-auto mb-4" />
            <p className="text-gray-400">Analyzing {reportCount} reports...</p>
            <p className="text-gray-500 text-sm mt-1">This may take a moment</p>
          </div>
        </div>
      </div>
    )
  }

  // Summary generated
  if (summaryData) {
    const { summary, key_findings, patterns_analysis, recommendations, cached, generated_at } = summaryData

    return (
      <div className="bg-surface-800 rounded-lg border border-surface-600 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between p-4 cursor-pointer hover:bg-surface-700/50 transition-colors"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/20 rounded-lg">
              <Sparkles className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white">AI Collection Summary</h3>
              <p className="text-xs text-gray-500">
                {cached ? 'Cached' : 'Generated'} {new Date(generated_at).toLocaleString()}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => {
                e.stopPropagation()
                setSummaryData(null)
                generateSummary()
              }}
              className="p-2 hover:bg-surface-600 rounded-lg text-gray-400 hover:text-white"
              title="Regenerate summary"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
            {expanded ? (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>

        {/* Expanded content */}
        {expanded && (
          <div className="border-t border-surface-600">
            {/* Key findings grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-surface-700/30">
              <div className="text-center">
                <FileText className="w-5 h-5 text-blue-400 mx-auto mb-1" />
                <p className="text-lg font-bold text-white">{key_findings.total_reports}</p>
                <p className="text-xs text-gray-400">Reports</p>
              </div>
              <div className="text-center">
                <Tag className="w-5 h-5 text-green-400 mx-auto mb-1" />
                <p className="text-sm font-medium text-white">{formatCategory(key_findings.primary_category)}</p>
                <p className="text-xs text-gray-400">Primary Category</p>
              </div>
              <div className="text-center">
                <MapPin className="w-5 h-5 text-amber-400 mx-auto mb-1" />
                <p className="text-sm font-medium text-white">{key_findings.geographic_focus}</p>
                <p className="text-xs text-gray-400">Geographic Focus</p>
              </div>
              <div className="text-center">
                <Calendar className="w-5 h-5 text-purple-400 mx-auto mb-1" />
                <p className="text-xs font-medium text-white">
                  {formatDate(key_findings.date_range.earliest)} - {formatDate(key_findings.date_range.latest)}
                </p>
                <p className="text-xs text-gray-400">Date Range</p>
              </div>
            </div>

            {/* Overview */}
            <div className="p-4">
              <h4 className="text-sm font-medium text-gray-400 mb-2">Overview</h4>
              <div className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap">
                {summary}
              </div>
            </div>

            {/* Common Patterns */}
            {key_findings.common_patterns && key_findings.common_patterns.length > 0 && (
              <div className="p-4 border-t border-surface-600">
                <h4 className="text-sm font-medium text-gray-400 mb-3 flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Common Patterns
                </h4>
                <ul className="space-y-2">
                  {key_findings.common_patterns.map((pattern, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                      <span className="text-purple-400 mt-1">•</span>
                      {pattern}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* Patterns Analysis */}
            {patterns_analysis && (
              <div className="p-4 border-t border-surface-600">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Pattern Analysis</h4>
                <p className="text-gray-300 text-sm leading-relaxed">{patterns_analysis}</p>
              </div>
            )}

            {/* Notable Reports */}
            {key_findings.notable_reports && key_findings.notable_reports.length > 0 && (
              <div className="p-4 border-t border-surface-600">
                <h4 className="text-sm font-medium text-gray-400 mb-3">Notable Reports</h4>
                <div className="space-y-3">
                  {key_findings.notable_reports.map((report, i) => (
                    <div key={i} className="bg-surface-700/50 rounded-lg p-3">
                      <Link
                        href={`/report/${report.id}`}
                        className="font-medium text-white hover:text-primary-400 transition-colors"
                      >
                        {report.title}
                      </Link>
                      <p className="text-sm text-gray-400 mt-1">{report.reason}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Recommendations */}
            {recommendations && recommendations.length > 0 && (
              <div className="p-4 border-t border-surface-600">
                <button
                  onClick={() => setShowRecommendations(!showRecommendations)}
                  className="flex items-center justify-between w-full text-left"
                >
                  <h4 className="text-sm font-medium text-gray-400 flex items-center gap-2">
                    <Lightbulb className="w-4 h-4" />
                    Research Recommendations
                  </h4>
                  {showRecommendations ? (
                    <ChevronUp className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  )}
                </button>
                {showRecommendations && (
                  <ul className="mt-3 space-y-2">
                    {recommendations.map((rec, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <span className="text-amber-400 mt-1">{i + 1}.</span>
                        {rec}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    )
  }

  return null
}
