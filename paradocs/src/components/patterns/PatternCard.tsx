'use client'

import React from 'react'
import Link from 'next/link'
import {
  MapPin,
  TrendingUp,
  Waves,
  Link as LinkIcon,
  Target,
  Calendar,
  Clock,
  Activity,
  AlertCircle,
  CheckCircle2,
  ArrowUp,
  ArrowDown
} from 'lucide-react'
import { classNames } from '@/lib/utils'

export interface Pattern {
  id: string
  pattern_type: string
  status: string
  confidence_score: number
  significance_score: number
  report_count: number
  ai_title?: string
  ai_summary?: string
  center_point?: { lat: number; lng: number }
  radius_km?: number
  categories: string[]
  first_detected_at: string
  last_updated_at: string
  metadata?: Record<string, unknown>
  typeLabel?: string
  typeIcon?: string
}

interface PatternCardProps {
  pattern: Pattern
  variant?: 'default' | 'compact' | 'featured'
}

const PATTERN_TYPE_CONFIG: Record<string, { icon: React.ElementType; color: string; bgColor: string }> = {
  geographic_cluster: { icon: MapPin, color: 'text-emerald-400', bgColor: 'bg-emerald-500/20' },
  temporal_anomaly: { icon: TrendingUp, color: 'text-amber-400', bgColor: 'bg-amber-500/20' },
  flap_wave: { icon: Waves, color: 'text-blue-400', bgColor: 'bg-blue-500/20' },
  characteristic_correlation: { icon: LinkIcon, color: 'text-purple-400', bgColor: 'bg-purple-500/20' },
  regional_concentration: { icon: Target, color: 'text-rose-400', bgColor: 'bg-rose-500/20' },
  seasonal_pattern: { icon: Calendar, color: 'text-cyan-400', bgColor: 'bg-cyan-500/20' },
  time_of_day_pattern: { icon: Clock, color: 'text-orange-400', bgColor: 'bg-orange-500/20' },
  date_correlation: { icon: Activity, color: 'text-indigo-400', bgColor: 'bg-indigo-500/20' }
}

const STATUS_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  active: { icon: CheckCircle2, color: 'text-green-400', label: 'Active' },
  emerging: { icon: ArrowUp, color: 'text-amber-400', label: 'Emerging' },
  declining: { icon: ArrowDown, color: 'text-gray-400', label: 'Declining' },
  historical: { icon: AlertCircle, color: 'text-gray-500', label: 'Historical' }
}

export default function PatternCard({ pattern, variant = 'default' }: PatternCardProps) {
  const typeConfig = PATTERN_TYPE_CONFIG[pattern.pattern_type] || PATTERN_TYPE_CONFIG.geographic_cluster
  const statusConfig = STATUS_CONFIG[pattern.status] || STATUS_CONFIG.active
  const Icon = typeConfig.icon
  const StatusIcon = statusConfig.icon

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const title = pattern.ai_title || pattern.typeLabel || 'Detected Pattern'
  const summary = pattern.ai_summary || `${pattern.report_count} reports identified in this ${pattern.pattern_type.replace(/_/g, ' ')}.`

  if (variant === 'compact') {
    return (
      <Link href={`/insights/patterns/${pattern.id}`} className="block">
        <div className="glass-card p-3 hover:scale-[1.02] transition-transform">
          <div className="flex items-center gap-3">
            <div className={classNames('w-8 h-8 rounded-lg flex items-center justify-center', typeConfig.bgColor)}>
              <Icon className={classNames('w-4 h-4', typeConfig.color)} />
            </div>
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-white truncate">{title}</h4>
              <p className="text-xs text-gray-400">{pattern.report_count} reports</p>
            </div>
            <StatusIcon className={classNames('w-4 h-4 shrink-0', statusConfig.color)} />
          </div>
        </div>
      </Link>
    )
  }

  if (variant === 'featured') {
    return (
      <Link href={`/insights/patterns/${pattern.id}`} className="block group">
        <div className="glass-card overflow-hidden hover:scale-[1.01] transition-transform">
          <div className="h-32 bg-gradient-to-br from-primary-900/50 to-purple-900/50 relative flex items-center justify-center">
            <Icon className={classNames('w-16 h-16 opacity-30 group-hover:scale-110 transition-transform', typeConfig.color)} />
            <div className={classNames(
              'absolute top-3 right-3 px-2 py-0.5 rounded-full text-xs font-medium flex items-center gap-1',
              typeConfig.bgColor, typeConfig.color
            )}>
              <StatusIcon className="w-3 h-3" />
              {statusConfig.label}
            </div>
          </div>
          <div className="p-4">
            <h3 className="font-display font-semibold text-white group-hover:text-primary-400 transition-colors line-clamp-1">
              {title}
            </h3>
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{summary}</p>
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
              <span>{pattern.report_count} reports</span>
              <span>Updated {formatDate(pattern.last_updated_at)}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1 bg-gray-700/50 rounded-full h-1.5">
                <div
                  className={classNames('h-full rounded-full', typeConfig.bgColor.replace('/20', ''))}
                  style={{ width: `${Math.round(pattern.significance_score * 100)}%` }}
                />
              </div>
              <span className="text-xs text-gray-400">
                {Math.round(pattern.significance_score * 100)}% significance
              </span>
            </div>
          </div>
        </div>
      </Link>
    )
  }

  // Default variant
  return (
    <Link href={`/insights/patterns/${pattern.id}`} className="block group">
      <div className="glass-card p-4 hover:scale-[1.01] transition-transform">
        <div className="flex items-start gap-3">
          <div className={classNames('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', typeConfig.bgColor)}>
            <Icon className={classNames('w-5 h-5', typeConfig.color)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-medium text-white group-hover:text-primary-400 transition-colors line-clamp-1">
                {title}
              </h3>
              <span className={classNames(
                'px-2 py-0.5 rounded text-xs font-medium shrink-0 flex items-center gap-1',
                statusConfig.color === 'text-green-400' ? 'bg-green-500/20 text-green-400' :
                statusConfig.color === 'text-amber-400' ? 'bg-amber-500/20 text-amber-400' :
                'bg-gray-500/20 text-gray-400'
              )}>
                <StatusIcon className="w-3 h-3" />
                {statusConfig.label}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-400 line-clamp-2">{summary}</p>
            <div className="mt-2 flex items-center gap-4 text-xs text-gray-500">
              <span>{pattern.report_count} reports</span>
              <span>{Math.round(pattern.confidence_score * 100)}% confidence</span>
              {pattern.categories.length > 0 && (
                <span className="truncate">{pattern.categories.slice(0, 2).join(', ')}</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </Link>
  )
}
