'use client'

import React from 'react'
import { AlertCircle, CheckCircle, HelpCircle } from 'lucide-react'
import { classNames } from '@/lib/utils'
import type { UncertaintyBounds } from '@/lib/services/pattern-scoring.service'

interface UncertaintyDisplayProps {
  label: string
  bounds: UncertaintyBounds
  className?: string
  variant?: 'bar' | 'badge' | 'detailed'
  showTooltip?: boolean
}

export default function UncertaintyDisplay({
  label,
  bounds,
  className = '',
  variant = 'bar',
  showTooltip = true
}: UncertaintyDisplayProps) {
  const pointPercent = Math.round(bounds.point * 100)
  const lowerPercent = Math.round(bounds.lower * 100)
  const upperPercent = Math.round(bounds.upper * 100)
  const rangeWidth = upperPercent - lowerPercent

  const getConfidenceLevel = () => {
    if (bounds.point >= 0.8) return { level: 'high', color: 'green', icon: CheckCircle }
    if (bounds.point >= 0.6) return { level: 'moderate', color: 'amber', icon: HelpCircle }
    if (bounds.point >= 0.4) return { level: 'low', color: 'orange', icon: AlertCircle }
    return { level: 'very low', color: 'red', icon: AlertCircle }
  }

  const { level, color, icon: Icon } = getConfidenceLevel()

  const colorClasses = {
    green: {
      bg: 'bg-green-500',
      bgLight: 'bg-green-500/20',
      text: 'text-green-400',
      border: 'border-green-500/30'
    },
    amber: {
      bg: 'bg-amber-500',
      bgLight: 'bg-amber-500/20',
      text: 'text-amber-400',
      border: 'border-amber-500/30'
    },
    orange: {
      bg: 'bg-orange-500',
      bgLight: 'bg-orange-500/20',
      text: 'text-orange-400',
      border: 'border-orange-500/30'
    },
    red: {
      bg: 'bg-red-500',
      bgLight: 'bg-red-500/20',
      text: 'text-red-400',
      border: 'border-red-500/30'
    }
  }

  const colors = colorClasses[color as keyof typeof colorClasses]

  if (variant === 'badge') {
    return (
      <div className={classNames('inline-flex items-center gap-1.5', className)}>
        <span className={classNames(
          'px-2 py-1 rounded-lg text-sm font-medium',
          colors.bgLight, colors.text
        )}>
          {pointPercent}%
        </span>
        {rangeWidth > 5 && (
          <span className="text-xs text-gray-500">
            ±{Math.round(rangeWidth / 2)}%
          </span>
        )}
      </div>
    )
  }

  if (variant === 'detailed') {
    return (
      <div className={classNames('p-3 rounded-lg border', colors.bgLight, colors.border, className)}>
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Icon className={classNames('w-4 h-4', colors.text)} />
            <span className="text-sm font-medium text-white">{label}</span>
          </div>
          <span className={classNames('text-lg font-bold', colors.text)}>
            {pointPercent}%
          </span>
        </div>

        {/* Range Bar */}
        <div className="relative h-2 bg-gray-700/50 rounded-full overflow-hidden">
          {/* Uncertainty range */}
          <div
            className={classNames('absolute h-full', colors.bgLight)}
            style={{
              left: `${lowerPercent}%`,
              width: `${rangeWidth}%`
            }}
          />
          {/* Point estimate */}
          <div
            className={classNames('absolute w-1 h-full', colors.bg)}
            style={{ left: `${pointPercent}%` }}
          />
        </div>

        <div className="flex justify-between mt-1 text-xs text-gray-500">
          <span>{lowerPercent}%</span>
          <span className={colors.text}>{level} confidence</span>
          <span>{upperPercent}%</span>
        </div>

        {showTooltip && (
          <p className="mt-2 text-xs text-gray-400">
            95% confidence interval: The true value likely falls between {lowerPercent}% and {upperPercent}%.
          </p>
        )}
      </div>
    )
  }

  // Default: bar variant
  return (
    <div className={classNames('space-y-1', className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-400">{label}</span>
        <div className="flex items-center gap-2">
          <span className={classNames('text-sm font-medium', colors.text)}>
            {pointPercent}%
          </span>
          {rangeWidth > 5 && (
            <span className="text-xs text-gray-500">
              ({lowerPercent}-{upperPercent}%)
            </span>
          )}
        </div>
      </div>

      <div className="relative h-2 bg-gray-700/50 rounded-full overflow-hidden">
        {/* Uncertainty range background */}
        <div
          className="absolute h-full bg-gray-600/50 rounded-full"
          style={{
            left: `${lowerPercent}%`,
            width: `${rangeWidth}%`
          }}
        />
        {/* Filled portion up to point estimate */}
        <div
          className={classNames('h-full rounded-full', colors.bg)}
          style={{ width: `${pointPercent}%` }}
        />
      </div>
    </div>
  )
}
