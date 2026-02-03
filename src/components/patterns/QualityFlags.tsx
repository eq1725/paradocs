'use client'

import React from 'react'
import {
  AlertCircle,
  CheckCircle,
  Info,
  Shield,
  Clock,
  MapPin,
  Layers
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import { getQualityFlagDescription } from '@/lib/services/pattern-scoring.service'

interface QualityFlagsProps {
  flags: string[]
  className?: string
  variant?: 'inline' | 'list'
}

const FLAG_ICONS: Record<string, React.ElementType> = {
  low_sample_size: AlertCircle,
  short_time_window: Clock,
  single_category: Layers,
  no_precise_location: MapPin,
  well_established: CheckCircle,
  multi_phenomenon: Shield
}

export default function QualityFlags({
  flags,
  className = '',
  variant = 'inline'
}: QualityFlagsProps) {
  if (flags.length === 0) return null

  const getIconColor = (severity: 'info' | 'warning' | 'positive') => {
    switch (severity) {
      case 'warning': return 'text-amber-400'
      case 'positive': return 'text-green-400'
      default: return 'text-blue-400'
    }
  }

  const getBgColor = (severity: 'info' | 'warning' | 'positive') => {
    switch (severity) {
      case 'warning': return 'bg-amber-500/10 border-amber-500/20'
      case 'positive': return 'bg-green-500/10 border-green-500/20'
      default: return 'bg-blue-500/10 border-blue-500/20'
    }
  }

  if (variant === 'inline') {
    return (
      <div className={classNames('flex flex-wrap gap-2', className)}>
        {flags.map(flag => {
          const { label, severity } = getQualityFlagDescription(flag)
          const Icon = FLAG_ICONS[flag] || Info

          return (
            <div
              key={flag}
              className={classNames(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs border',
                getBgColor(severity)
              )}
              title={getQualityFlagDescription(flag).description}
            >
              <Icon className={classNames('w-3 h-3', getIconColor(severity))} />
              <span className="text-gray-300">{label}</span>
            </div>
          )
        })}
      </div>
    )
  }

  // List variant
  return (
    <div className={classNames('space-y-2', className)}>
      <h4 className="text-sm font-medium text-gray-400">Data Quality</h4>
      {flags.map(flag => {
        const { label, description, severity } = getQualityFlagDescription(flag)
        const Icon = FLAG_ICONS[flag] || Info

        return (
          <div
            key={flag}
            className={classNames(
              'flex items-start gap-3 p-3 rounded-lg border',
              getBgColor(severity)
            )}
          >
            <Icon className={classNames('w-5 h-5 shrink-0 mt-0.5', getIconColor(severity))} />
            <div>
              <p className="text-sm font-medium text-white">{label}</p>
              <p className="text-xs text-gray-400">{description}</p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
