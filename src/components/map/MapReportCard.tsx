/**
 * MapReportCard — Selected report detail card
 * Used in both desktop right panel and mobile bottom sheet
 */

import React from 'react'
import Link from 'next/link'
import { X, MapPin, Calendar, Users, ExternalLink, Shield } from 'lucide-react'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG } from '@/lib/constants'
import { formatDate } from '@/lib/utils'
import { ReportProperties, CATEGORY_ICONS } from './mapStyles'

interface MapReportCardProps {
  report: ReportProperties
  onClose: () => void
  compact?: boolean
}

export default function MapReportCard({ report, onClose, compact = false }: MapReportCardProps) {
  const catConfig = CATEGORY_CONFIG[report.category]
  const credConfig = CREDIBILITY_CONFIG[report.credibility as keyof typeof CREDIBILITY_CONFIG]
  const icon = CATEGORY_ICONS[report.category]

  return (
    <div className="bg-gray-900/95 backdrop-blur-sm border border-gray-700/50 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 p-4 pb-2">
        <div className="text-2xl flex-shrink-0 mt-0.5">{icon}</div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${catConfig?.bgColor} ${catConfig?.color}`}>
              {catConfig?.label}
            </span>
            {credConfig && (
              <span className={`text-xs font-medium ${credConfig.color}`}>
                {credConfig.label}
              </span>
            )}
          </div>
          <h3 className="text-white font-semibold text-sm leading-tight line-clamp-2">
            {report.title}
          </h3>
        </div>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-white p-1 -mt-1 -mr-1 transition-colors"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Summary */}
      {report.summary && !compact && (
        <p className="text-gray-400 text-xs leading-relaxed px-4 line-clamp-3">
          {report.summary}
        </p>
      )}

      {/* Metadata */}
      <div className="px-4 py-3 space-y-1.5">
        {report.location_name && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <MapPin size={13} className="text-gray-500 flex-shrink-0" />
            <span className="truncate">{report.location_name}</span>
          </div>
        )}
        {report.event_date && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Calendar size={13} className="text-gray-500 flex-shrink-0" />
            <span>{formatDate(report.event_date)}</span>
          </div>
        )}
        {report.witness_count && report.witness_count > 0 && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Users size={13} className="text-gray-500 flex-shrink-0" />
            <span>{report.witness_count} witness{report.witness_count !== 1 ? 'es' : ''}</span>
          </div>
        )}
        {(report.has_physical_evidence || report.has_photo_video) && (
          <div className="flex items-center gap-2 text-xs text-gray-400">
            <Shield size={13} className="text-gray-500 flex-shrink-0" />
            <span>
              {[
                report.has_photo_video && 'Photo/Video',
                report.has_physical_evidence && 'Physical evidence',
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
          </div>
        )}
      </div>

      {/* CTA */}
      <div className="px-4 pb-4">
        <Link
          href={`/report/${report.slug}`}
          className="flex items-center justify-center gap-2 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          <ExternalLink size={14} />
          View Full Report
        </Link>
      </div>
    </div>
  )
}
