import React, { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  InsightNarrative,
  Pattern,
  PatternMiniMap,
  MethodologyPanel,
  SkepticMode,
  ExportCitation,
  BaselineComparison,
  UncertaintyDisplay,
  QualityFlags,
  TemporalVisualization,
  SeasonalVisualization
} from '@/components/patterns'
import ReportCard from '@/components/ReportCard'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Eye,
  TrendingUp,
  Loader2,
  AlertCircle,
  Clock,
  Target,
  ChevronRight
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import {
  calculateConfidenceWithUncertainty,
  calculateSignificanceWithUncertainty,
  generateBaselineComparison,
  generateMethodologyData,
  generateAlternativeHypotheses,
  generateQualityFlags,
  type UncertaintyBounds,
  type BaselineComparison as BaselineComparisonType,
  type MethodologyData,
  type AlternativeHypothesis
} from '@/lib/services/pattern-scoring.service'

interface PatternReport {
  id: string
  title: string
  slug: string
  category: string
  event_date: string
  location_description: string
  coordinates: { lat: number; lng: number } | null
  relevance_score: number
}

interface PatternDetail extends Pattern {
  view_count?: number
  pattern_start_date?: string
  pattern_end_date?: string
}

const TYPE_LABELS: Record<string, string> = {
  geographic_cluster: 'Geographic Cluster',
  temporal_anomaly: 'Temporal Anomaly',
  flap_wave: 'Flap Wave',
  characteristic_correlation: 'Characteristic Correlation',
  regional_concentration: 'Regional Concentration',
  seasonal_pattern: 'Seasonal Pattern',
  time_of_day_pattern: 'Time of Day Pattern',
  date_correlation: 'Date Correlation'
}

// Generate sample temporal data for visualization
function generateTemporalData(
  anomalyWeek: string | undefined,
  mean: number,
  stdDev: number,
  anomalyCount: number
): Array<{ week: string; count: number; zScore?: number; isAnomaly?: boolean }> {
  const data: Array<{ week: string; count: number; zScore?: number; isAnomaly?: boolean }> = []
  const anomalyDate = anomalyWeek ? new Date(anomalyWeek) : new Date()

  // Generate 26 weeks of data centered around the anomaly
  for (let i = -20; i < 6; i++) {
    const weekDate = new Date(anomalyDate)
    weekDate.setDate(weekDate.getDate() + (i * 7))
    const weekStr = weekDate.toISOString().split('T')[0]

    // Generate random counts around the mean, except for anomaly week
    const isAnomalyWeek = i === 0
    let count: number
    let zScore: number

    if (isAnomalyWeek) {
      count = anomalyCount
      zScore = stdDev > 0 ? (count - mean) / stdDev : 0
    } else {
      // Generate realistic baseline variation
      const variation = (Math.random() - 0.5) * 2 * stdDev
      count = Math.max(0, Math.round(mean + variation))
      zScore = stdDev > 0 ? (count - mean) / stdDev : 0
    }

    data.push({
      week: weekStr,
      count,
      zScore,
      isAnomaly: isAnomalyWeek
    })
  }

  return data
}

export default function PatternDetailPage() {
  const router = useRouter()
  const { id } = router.query

  const [pattern, setPattern] = useState<PatternDetail | null>(null)
  const [reports, setReports] = useState<PatternReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!id || typeof id !== 'string') return

    async function fetchPattern() {
      setLoading(true)
      setError(null)
      try {
        const response = await fetch(`/api/patterns/${id}`)
        if (!response.ok) throw new Error('Pattern not found')
        const data = await response.json()
        setPattern(data.pattern)
        setReports(data.reports || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load pattern')
      } finally {
        setLoading(false)
      }
    }

    fetchPattern()
  }, [id])

  // Calculate enhanced scores
  const enhancedScores = useMemo(() => {
    if (!pattern) return null

    const metadata = pattern.metadata as Record<string, unknown> || {}
    const density = (metadata.density as number) || 1
    const zScore = metadata.z_score as number | undefined

    // Calculate uncertainty bounds
    const confidenceBounds = calculateConfidenceWithUncertainty(
      pattern.report_count,
      density,
      1000 // Approximate total reports in period
    )

    const significanceBounds = calculateSignificanceWithUncertainty(
      pattern.report_count,
      pattern.categories.length,
      50, // Baseline report count
      pattern.categories.length
    )

    // Generate baseline comparison (mock historical data for now)
    const historicalCounts = [35, 42, 38, 51, 45, 40, 48, 52, 39, 44, 47, 41]
    const baselineComparison = generateBaselineComparison(
      pattern.report_count,
      historicalCounts,
      '12-month'
    )

    // Generate methodology data
    const methodology = generateMethodologyData(
      pattern.pattern_type,
      {
        eps_km: pattern.radius_km || 50,
        min_points: 5,
        z_threshold: 2.5
      },
      {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
        end: new Date().toISOString()
      },
      pattern.report_count
    )

    // Generate alternative hypotheses
    const hypotheses = generateAlternativeHypotheses(pattern.pattern_type, metadata)

    // Generate quality flags
    const firstDate = new Date(pattern.first_detected_at)
    const timeSpanDays = Math.floor((Date.now() - firstDate.getTime()) / (1000 * 60 * 60 * 24))
    const qualityFlags = generateQualityFlags(
      pattern.report_count,
      timeSpanDays,
      pattern.categories.length,
      !!pattern.center_point
    )

    return {
      confidenceBounds,
      significanceBounds,
      baselineComparison,
      methodology,
      hypotheses,
      qualityFlags,
      zScore,
      metadata
    }
  }, [pattern])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    )
  }

  if (error || !pattern || !enhancedScores) {
    return (
      <div className="py-20 text-center">
        <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
        <h1 className="text-xl font-bold text-white mb-2">Pattern Not Found</h1>
        <p className="text-gray-400 mb-6">{error || 'Unable to load pattern details'}</p>
        <Link
          href="/insights"
          className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Insights
        </Link>
      </div>
    )
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const metadata = pattern.metadata as Record<string, unknown> || {}

  // Extract center point coordinates
  const centerPoint = pattern.center_point
    ? {
        lat: (pattern.center_point as any).lat ?? (pattern.center_point as any).coordinates?.[1],
        lng: (pattern.center_point as any).lng ?? (pattern.center_point as any).coordinates?.[0]
      }
    : null

  return (
    <>
      <Head>
        <title>{pattern.ai_title || TYPE_LABELS[pattern.pattern_type]} | ParaDocs Insights</title>
        <meta
          name="description"
          content={pattern.ai_summary || `Explore this ${pattern.pattern_type} pattern with ${pattern.report_count} associated reports.`}
        />
      </Head>

      <div className="py-8">
        {/* Back Navigation */}
        <Link
          href="/insights"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Insights
        </Link>

        {/* Header */}
        <div className="glass-card p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-3">
                <span className={classNames(
                  'inline-block px-3 py-1 rounded-full text-sm font-medium',
                  pattern.status === 'active' ? 'bg-green-500/20 text-green-400' :
                  pattern.status === 'emerging' ? 'bg-amber-500/20 text-amber-400' :
                  'bg-gray-500/20 text-gray-400'
                )}>
                  {pattern.status.charAt(0).toUpperCase() + pattern.status.slice(1)}
                </span>
                <span className="text-sm text-gray-500">
                  {TYPE_LABELS[pattern.pattern_type]}
                </span>
              </div>
              <h1 className="text-2xl md:text-3xl font-display font-bold text-white">
                {pattern.ai_title || TYPE_LABELS[pattern.pattern_type]}
              </h1>
              <p className="text-gray-400 mt-2">
                {pattern.ai_summary || `A ${pattern.pattern_type.replace(/_/g, ' ')} containing ${pattern.report_count} reports.`}
              </p>

              {/* Quality Flags */}
              <div className="mt-4">
                <QualityFlags flags={enhancedScores.qualityFlags} variant="inline" />
              </div>
            </div>

            {/* Mini Map for Geographic Patterns */}
            {centerPoint && (pattern.pattern_type === 'geographic_cluster' || pattern.pattern_type === 'regional_concentration') && (
              <div className="hidden lg:block w-64 shrink-0">
                <PatternMiniMap
                  center={centerPoint}
                  radiusKm={pattern.radius_km}
                  reportCount={pattern.report_count}
                  interactive
                  onExpand={() => router.push(`/map?lat=${centerPoint.lat}&lng=${centerPoint.lng}&zoom=8`)}
                />
              </div>
            )}
          </div>

          {/* Enhanced Stats Grid with Uncertainty */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6 pt-6 border-t border-gray-700/50">
            <div className="text-center p-2 sm:p-0">
              <p className="text-xl sm:text-2xl font-bold text-white">{pattern.report_count}</p>
              <p className="text-xs sm:text-sm text-gray-400">Reports</p>
            </div>
            <div className="text-center p-2 sm:p-0">
              <UncertaintyDisplay
                label=""
                bounds={enhancedScores.confidenceBounds}
                variant="badge"
              />
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Confidence</p>
            </div>
            <div className="text-center p-2 sm:p-0">
              <UncertaintyDisplay
                label=""
                bounds={enhancedScores.significanceBounds}
                variant="badge"
              />
              <p className="text-xs sm:text-sm text-gray-400 mt-1">Significance</p>
            </div>
            <div className="text-center p-2 sm:p-0">
              <p className="text-xl sm:text-2xl font-bold text-white">{pattern.view_count || 0}</p>
              <p className="text-xs sm:text-sm text-gray-400">Views</p>
            </div>
          </div>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Type-Specific Visualization */}
            {pattern.pattern_type === 'temporal_anomaly' && (
              <TemporalVisualization
                data={generateTemporalData(
                  pattern.pattern_start_date,
                  (metadata.mean_baseline as number) || 50,
                  (metadata.std_deviation as number) || 15,
                  pattern.report_count
                )}
                anomalyWeek={pattern.pattern_start_date}
                zScore={enhancedScores.zScore || 0}
                mean={(metadata.mean_baseline as number) || 50}
                stdDev={(metadata.std_deviation as number) || 15}
              />
            )}

            {pattern.pattern_type === 'seasonal_pattern' && (
              <SeasonalVisualization
                data={[]}  // Would be populated from API
                highlightedMonth={(metadata.month as number) || undefined}
              />
            )}

            {/* Baseline Comparison */}
            <BaselineComparison comparison={enhancedScores.baselineComparison} />

            {/* AI Insight */}
            <InsightNarrative patternId={pattern.id} />

            {/* Skeptic Mode */}
            <SkepticMode hypotheses={enhancedScores.hypotheses} />
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Confidence Details */}
            <div className="glass-card p-4">
              <h3 className="font-medium text-white mb-4">Score Details</h3>
              <div className="space-y-4">
                <UncertaintyDisplay
                  label="Confidence"
                  bounds={enhancedScores.confidenceBounds}
                  variant="detailed"
                />
                <UncertaintyDisplay
                  label="Significance"
                  bounds={enhancedScores.significanceBounds}
                  variant="detailed"
                />
              </div>
            </div>

            {/* Pattern Details */}
            <div className="glass-card p-6">
              <h2 className="text-lg font-display font-semibold text-white mb-4">
                Pattern Details
              </h2>
              <dl className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-gray-400">Type</dt>
                  <dd className="text-white">{TYPE_LABELS[pattern.pattern_type]}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">First Detected</dt>
                  <dd className="text-white">{formatDate(pattern.first_detected_at)}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-gray-400">Last Updated</dt>
                  <dd className="text-white">{formatDate(pattern.last_updated_at)}</dd>
                </div>
                {pattern.radius_km && (
                  <div className="flex justify-between">
                    <dt className="text-gray-400">Radius</dt>
                    <dd className="text-white">{pattern.radius_km} km</dd>
                  </div>
                )}
                {pattern.categories.length > 0 && (
                  <div>
                    <dt className="text-gray-400 mb-1">Categories</dt>
                    <dd className="flex flex-wrap gap-1">
                      {pattern.categories.map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 bg-gray-700/50 rounded text-xs text-white"
                        >
                          {cat}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Methodology Panel */}
            <MethodologyPanel methodology={enhancedScores.methodology} />

            {/* Export & Citation */}
            <ExportCitation
              pattern={{
                id: pattern.id,
                title: pattern.ai_title || TYPE_LABELS[pattern.pattern_type],
                patternType: pattern.pattern_type,
                reportCount: pattern.report_count,
                confidence: enhancedScores.confidenceBounds.point,
                significance: enhancedScores.significanceBounds.point,
                firstDetected: pattern.first_detected_at,
                lastUpdated: pattern.last_updated_at,
                categories: pattern.categories,
                centerPoint: centerPoint || undefined
              }}
            />

            {/* Technical Metadata */}
            {Object.keys(metadata).length > 0 && (
              <div className="glass-card p-6">
                <h2 className="text-lg font-display font-semibold text-white mb-4">
                  Technical Data
                </h2>
                <dl className="space-y-2 text-sm">
                  {Object.entries(metadata).slice(0, 8).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-gray-400 truncate">
                        {key.replace(/_/g, ' ')}
                      </dt>
                      <dd className="text-white text-right truncate font-mono text-xs">
                        {typeof value === 'number'
                          ? value.toFixed(2)
                          : typeof value === 'boolean'
                          ? value.toString()
                          : Array.isArray(value)
                          ? value.length + ' items'
                          : String(value).substring(0, 20)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}
          </div>
        </div>

        {/* Associated Reports - Full Width */}
        <div className="glass-card p-6 mt-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-semibold text-white">
              Associated Reports ({reports.length})
            </h2>
            {reports.length > 0 && (
              <Link
                href={`/explore?pattern=${pattern.id}`}
                className="text-sm text-primary-400 hover:text-primary-300 flex items-center gap-1"
              >
                View all <ChevronRight className="w-4 h-4" />
              </Link>
            )}
          </div>
          {reports.length === 0 ? (
            <p className="text-gray-400">No reports linked to this pattern yet.</p>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {reports.slice(0, 12).map((report) => (
                <Link
                  key={report.id}
                  href={`/report/${report.slug}`}
                  className="block glass-card p-4 hover:scale-[1.02] transition-transform"
                >
                  <h3 className="font-medium text-white text-sm line-clamp-2">{report.title}</h3>
                  <div className="flex flex-col gap-1 mt-2 text-xs text-gray-400">
                    <span className="flex items-center gap-1 truncate">
                      <MapPin className="w-3 h-3 flex-shrink-0" />
                      {report.location_description || 'Unknown location'}
                    </span>
                    {report.event_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3 flex-shrink-0" />
                        {formatDate(report.event_date)}
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          )}
          {reports.length > 12 && (
            <div className="text-center mt-4">
              <Link
                href={`/explore?pattern=${pattern.id}`}
                className="text-sm text-primary-400 hover:text-primary-300"
              >
                View all {reports.length} reports →
              </Link>
            </div>
          )}
        </div>
      </div>
    </>
  )
}
