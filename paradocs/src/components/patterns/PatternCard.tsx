'use client'

import React from 'react'
import Link from 'next/link'
import { MapPin, TrendingUp, Waves, Target, Calendar, Clock, CheckCircle2, ArrowUp, ArrowDown, AlertCircle } from 'lucide-react'

export interface Pattern {
    id: string
    pattern_type: string
    status: string
    confidence_score: number
    significance_score: number
    report_count: number
    ai_title?: string
    ai_summary?: string
    categories: string[]
    first_detected_at: string
    last_updated_at: string
}

interface PatternCardProps {
    pattern: Pattern
    variant?: 'default' | 'compact' | 'featured'
}

const ICONS: Record<string, React.ElementType> = {
    geographic_cluster: MapPin,
    temporal_anomaly: TrendingUp,
    flap_wave: Waves,
    seasonal_pattern: Calendar,
  default: Target
}

export default function PatternCard({ pattern, variant = 'default' }: PatternCardProps) {
    const Icon = ICONS[pattern.pattern_type] || ICONS.default
    const title = pattern.ai_title || 'Detected Pattern'
    const summary = pattern.ai_summary || pattern.report_count + ' reports in this pattern'

  if (variant === 'compact') {
        return (
                <Link href={'/insights/patterns/' + pattern.id} className="block glass-card p-3 hover:scale-102">
                        <div className="flex items-center gap-3">
                                  <Icon className="w-4 h-4 text-primary-400" />
                                  <div className="flex-1 min-w-0">
                                              <h4 className="text-sm font-medium text-white truncate">{title}</h4>h4>
                                              <p className="text-xs text-gray-400">{pattern.report_count} reports</p>p>
                                  </div>div>
                        </div>div>
                </Link>Link>
              )
  }
  
    return (
          <Link href={'/insights/patterns/' + pattern.id} className="block glass-card p-4 hover:scale-101">
                <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-xl bg-primary-500/20 flex items-center justify-center">
                                  <Icon className="w-5 h-5 text-primary-400" />
                        </div>div>
                        <div className="flex-1">
                                  <h3 className="font-medium text-white">{title}</h3>h3>
                                  <p className="mt-1 text-sm text-gray-400 line-clamp-2">{summary}</p>p>
                                  <div className="mt-2 text-xs text-gray-500">{pattern.report_count} reports</div>div>
                        </div>div>
                </div>div>
          </Link>Link>
        )
}</Link>
