import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { Loader2, Sparkles, MapPin, Calendar } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { formatDate } from '@/lib/utils'

interface SimilarReport {
  id: string
  title: string
  slug: string
  category: string
  location_name: string | null
  event_date: string | null
  similarity_score: number
  matching_factors: string[]
}

interface SimilarReportsProps {
  reportId: string
  limit?: number
}

export default function SimilarReports({ reportId, limit = 5 }: SimilarReportsProps) {
  const [reports, setReports] = useState<SimilarReport[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchSimilarReports()
  }, [reportId])

  async function fetchSimilarReports() {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`/api/reports/${reportId}/similar?limit=${limit}`)
      if (response.ok) {
        const data = await response.json()
        setReports(data.similar_reports || [])
      } else {
        setError('Failed to load similar reports')
      }
    } catch (err) {
      console.error('Error fetching similar reports:', err)
      setError('Failed to load similar reports')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="glass-card p-6">
        <h3 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary-400" />
          Similar Reports
        </h3>
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
        </div>
      </div>
    )
  }

  if (error || reports.length === 0) {
    return null // Don't show section if no similar reports
  }

  return (
    <div className="glass-card p-6">
      <h3 className="text-lg font-display font-semibold text-white mb-4 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-primary-400" />
        Similar Reports
      </h3>
      <div className="space-y-3">
        {reports.map((report) => {
          const categoryConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG]

          return (
            <Link
              key={report.id}
              href={`/report/${report.slug}`}
              className="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <div className="text-2xl">{categoryConfig?.icon || '📋'}</div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-white group-hover:text-primary-400 transition-colors line-clamp-1">
                    {report.title}
                  </h4>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-xs text-gray-400">
                    {report.location_name && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {report.location_name}
                      </span>
                    )}
                    {report.event_date && (
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(report.event_date, 'MMM yyyy')}
                      </span>
                    )}
                  </div>
                  {report.matching_factors.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {report.matching_factors.slice(0, 3).map((factor, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded text-xs bg-primary-500/20 text-primary-400"
                        >
                          {factor}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-primary-400">
                    {Math.round(report.similarity_score * 100)}%
                  </div>
                  <div className="text-xs text-gray-500">match</div>
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
