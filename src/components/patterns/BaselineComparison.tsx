'use client'

import React from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  BarChart3,
  Clock
} from 'lucide-react'
import { classNames } from '@/lib/utils'
import type { BaselineComparison as BaselineComparisonType } from '@/lib/services/pattern-scoring.service'

interface BaselineComparisonProps {
  comparison: BaselineComparisonType
  className?: string
  variant?: 'compact' | 'detailed'
}

export default function BaselineComparison({
  comparison,
  className = '',
  variant = 'detailed'
}: BaselineComparisonProps) {
  const getTrendIcon = () => {
    if (comparison.percentChange > 10) return TrendingUp
    if (comparison.percentChange < -10) return TrendingDown
    return Minus
  }

  const getTrendColor = () => {
    if (comparison.percentChange > 50) return 'text-red-400'
    if (comparison.percentChange > 20) return 'text-amber-400'
    if (comparison.percentChange > 0) return 'text-green-400'
    if (comparison.percentChange < -20) return 'text-blue-400'
    return 'text-gray-400'
  }

  const getMultiplierLabel = () => {
    if (comparison.multiplier >= 5) return 'Exceptional'
    if (comparison.multiplier >= 3) return 'Very High'
    if (comparison.multiplier >= 2) return 'High'
    if (comparison.multiplier >= 1.5) return 'Above Average'
    if (comparison.multiplier >= 0.75) return 'Average'
    if (comparison.multiplier >= 0.5) return 'Below Average'
    return 'Low'
  }

  const TrendIcon = getTrendIcon()
  const trendColor = getTrendColor()

  if (variant === 'compact') {
    return (
      <div className={classNames('flex items-center gap-2', className)}>
        <TrendIcon className={classNames('w-4 h-4', trendColor)} />
        <span className={classNames('text-sm font-medium', trendColor)}>
          {comparison.percentChange > 0 ? '+' : ''}{comparison.percentChange.toFixed(0)}%
        </span>
        <span className="text-xs text-gray-500">vs baseline</span>
      </div>
    )
  }

  return (
    <div className={classNames('glass-card p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-cyan-400" />
        <h3 className="font-medium text-white">Compared to Baseline</h3>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Current vs Baseline */}
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-400">Current</span>
            <span className="text-xs text-gray-400">Baseline</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg sm:text-xl font-bold text-white">
              {comparison.currentValue.toLocaleString()}
            </span>
            <TrendIcon className={classNames('w-5 h-5 mx-2 flex-shrink-0', trendColor)} />
            <span className="text-lg sm:text-xl font-bold text-gray-400">
              {comparison.baselineValue.toLocaleString()}
            </span>
          </div>
          <div className="mt-2 text-center">
            <span className={classNames('text-lg font-semibold', trendColor)}>
              {comparison.multiplier.toFixed(1)}×
            </span>
            <span className="text-xs text-gray-400 ml-1">{getMultiplierLabel()}</span>
          </div>
        </div>

        {/* Ranking */}
        <div className="p-3 bg-gray-800/50 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <Trophy className={classNames(
              'w-4 h-4 flex-shrink-0',
              comparison.historicalRank <= 3 ? 'text-amber-400' : 'text-gray-400'
            )} />
            <span className="text-xs text-gray-400">Historical Rank</span>
          </div>
          <div className="text-center">
            <span className="text-2xl sm:text-3xl font-bold text-white">
              #{comparison.historicalRank}
            </span>
            <p className="text-xs text-gray-400 mt-1">
              of {comparison.totalComparisons} periods
            </p>
          </div>
          {comparison.historicalRank === 1 && (
            <div className="mt-2 px-2 py-1 bg-amber-500/20 rounded text-center">
              <span className="text-xs text-amber-400 font-medium">
                All-Time High
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Change Summary */}
      <div className="mt-4 p-3 bg-gradient-to-r from-gray-800/50 to-transparent rounded-lg">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-gray-400" />
          <span className="text-sm text-gray-300">
            {comparison.percentChange > 0 ? (
              <>
                <span className={trendColor}>+{comparison.percentChange.toFixed(0)}%</span>
                {' '}higher than the {comparison.periodDescription} average
              </>
            ) : comparison.percentChange < 0 ? (
              <>
                <span className={trendColor}>{comparison.percentChange.toFixed(0)}%</span>
                {' '}lower than the {comparison.periodDescription} average
              </>
            ) : (
              <>Consistent with the {comparison.periodDescription} average</>
            )}
          </span>
        </div>
      </div>

      {/* Visual Bar */}
      <div className="mt-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Baseline</span>
          <span>Current ({comparison.multiplier.toFixed(1)}×)</span>
        </div>
        <div className="h-3 bg-gray-700/50 rounded-full overflow-hidden relative">
          {/* Baseline marker */}
          <div
            className="absolute top-0 bottom-0 w-0.5 bg-gray-400"
            style={{
              left: `${Math.min(100 / comparison.multiplier, 100)}%`
            }}
          />
          {/* Current value fill */}
          <div
            className={classNames(
              'h-full rounded-full transition-all duration-500',
              comparison.multiplier >= 2 ? 'bg-gradient-to-r from-cyan-500 to-purple-500' :
              comparison.multiplier >= 1 ? 'bg-cyan-500' : 'bg-blue-500'
            )}
            style={{
              width: `${Math.min(100, comparison.multiplier * 50)}%`
            }}
          />
        </div>
      </div>
    </div>
  )
}
