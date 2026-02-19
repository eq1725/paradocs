'use client'

import React from 'react'
import Link from 'next/link'
import { MapPin, Calendar, Eye, MessageCircle, ThumbsUp, Award } from 'lucide-react'
import { Report, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG } from '@/lib/constants'
import { formatRelativeDate, formatDate, truncate, classNames } from '@/lib/utils'
import SourceBadge from './SourceBadge'

interface ReportCardProps {
  report: Report & {
    phenomenon_type?: PhenomenonType | null;
    source_label?: string | null;
    source_url?: string | null;
  }
  variant?: 'default' | 'compact' | 'featured'
}

export default function ReportCard({ report, variant = 'default' }: ReportCardProps) {
  const categoryConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  const credibilityConfig = CREDIBILITY_CONFIG[report.credibility]

  if (variant === 'compact') {
    return (
      <Link href={`/report/${report.slug}`} className="block">
        <div className="glass-card p-4 hover:scale-[1.02] transition-transform">
          <div className="flex items-start gap-3">
            <span className="text-2xl">{categoryConfig.icon}</span>
            <div className="flex-1 min-w-0">
              <h3 className="font-medium text-white truncate">{report.title}</h3>
              <div className="flex items-center gap-2 mt-1">
                <p className="text-sm text-gray-400 truncate">
                  {report.location_name || 'Unknown location'}
                </p>
                {report.source_type && report.source_type !== 'user' && (
                  <SourceBadge
                    sourceType={report.source_type}
                    sourceLabel={report.source_label || undefined}
                    variant="minimal"
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <Link href={`/report/${report.slug}`} className="block group">
        <div className="glass-card overflow-hidden hover:scale-[1.01] transition-transform">
          <div className="aspect-video bg-gradient-to-br from-primary-900/50 to-purple-900/50 relative">
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl opacity-50 group-hover:scale-110 transition-transform">
                {categoryConfig.icon}
              </span>
            </div>
            {report.featured && (
              <div className="absolute top-4 left-4 flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/30 rounded-full text-amber-400 text-xs font-medium">
                <Award className="w-3 h-3" />
                Featured
              </div>
            )}
            <div className={classNames(
              'absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-medium border',
              categoryConfig.bgColor,
              categoryConfig.color,
              'border-current/30'
            )}>
              {categoryConfig.label}
            </div>
          </div>
          <div className="p-6">
            <h2 className="text-xl font-display font-semibold text-white group-hover:text-primary-400 transition-colors line-clamp-1">
              {report.title}
            </h2>
            <p className="mt-2 text-gray-400 text-sm line-clamp-2">
              {report.summary}
            </p>
            <div className="mt-4 flex items-center gap-4 text-sm text-gray-500">
              {report.location_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-4 h-4" />
                  {truncate(report.location_name, 20)}
                </span>
              )}
              {report.event_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {formatDate(report.event_date)}
                </span>
              )}
            </div>
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className={classNames(
                  'px-2 py-0.5 rounded text-xs font-medium',
                  credibilityConfig.bgColor,
                  credibilityConfig.color
                )}>
                  {credibilityConfig.label}
                </div>
                {report.source_type && report.source_type !== 'user' && (
                  <SourceBadge
                    sourceType={report.source_type}
                    sourceLabel={report.source_label || undefined}
                    variant="compact"
                  />
                )}
              </div>
              <div className="flex items-center gap-3 text-gray-500 text-sm">
                <span className="flex items-center gap-1">
                  <Eye className="w-4 h-4" />
                  {report.view_count}
                </span>
                <span className="flex items-center gap-1">
                  <ThumbsUp className="w-4 h-4" />
                  {report.upvotes}
                </span>
                <span className="flex items-center gap-1">
                  <MessageCircle className="w-4 h-4" />
                  {report.comment_count}
                </span>
              </div>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Default variant
  return (
    <Link href={`/report/${report.slug}`} className="block group">
      <div className="glass-card p-5 hover:scale-[1.01] transition-transform">
        <div className="flex items-start gap-4">
          <div className={classNames(
            'w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0',
            categoryConfig.bgColor
          )}>
            {categoryConfig.icon}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-white group-hover:text-primary-400 transition-colors line-clamp-1">
                {report.title}
              </h3>
              <span className={classNames(
                'px-2 py-0.5 rounded text-xs font-medium shrink-0',
                categoryConfig.bgColor,
                categoryConfig.color
              )}>
                {categoryConfig.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">
              {report.summary}
            </p>
            <div className="mt-3 flex items-center flex-wrap gap-x-4 gap-y-1 text-xs text-gray-500">
              {report.location_name && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {truncate(report.location_name, 25)}
                </span>
              )}
              {report.event_date && (
                <span className="flex items-center gap-1">
                  <Calendar className="w-3 h-3" />
                  {formatDate(report.event_date)}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Eye className="w-3 h-3" />
                {report.view_count}
              </span>
              <span className="flex items-center gap-1">
                <ThumbsUp className="w-3 h-3" />
                {report.upvotes}
              </span>
              {report.source_type && report.source_type !== 'user' && (
                <SourceBadge
                  sourceType={report.source_type}
                  sourceLabel={report.source_label || undefined}
                  variant="minimal"
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
