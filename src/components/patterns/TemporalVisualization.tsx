'use client'

import React, { useMemo } from 'react'
import { TrendingUp, TrendingDown, Calendar, AlertTriangle } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface WeekData {
  week: string
  count: number
  zScore?: number
  isAnomaly?: boolean
}

interface TemporalVisualizationProps {
  data: WeekData[]
  anomalyWeek?: string
  zScore?: number
  mean?: number
  stdDev?: number
  className?: string
}

export default function TemporalVisualization({
  data,
  anomalyWeek,
  zScore = 0,
  mean = 0,
  stdDev = 0,
  className = ''
}: TemporalVisualizationProps) {
  const { maxCount, chartData, anomalyIndex } = useMemo(() => {
    const max = Math.max(...data.map(d => d.count), 1)
    const idx = anomalyWeek ? data.findIndex(d => d.week === anomalyWeek) : -1

    return {
      maxCount: max,
      chartData: data.slice(-26), // Last 26 weeks
      anomalyIndex: idx >= data.length - 26 ? idx - (data.length - 26) : -1
    }
  }, [data, anomalyWeek])

  const isSpike = zScore > 0

  return (
    <div className={classNames('glass-card p-3 sm:p-4 overflow-hidden', className)}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-5 h-5 text-amber-400 flex-shrink-0" />
          <h3 className="font-medium text-white">Temporal Pattern</h3>
        </div>
        <div className="flex items-center gap-2">
          {isSpike ? (
            <TrendingUp className="w-4 h-4 text-red-400 flex-shrink-0" />
          ) : (
            <TrendingDown className="w-4 h-4 text-blue-400 flex-shrink-0" />
          )}
          <span className={classNames(
            'text-sm font-medium',
            isSpike ? 'text-red-400' : 'text-blue-400'
          )}>
            {isSpike ? 'Activity Spike' : 'Activity Drop'}
          </span>
        </div>
      </div>

      {/* Sparkline Chart */}
      <div className="relative h-28 sm:h-32 mb-4">
        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 w-6 sm:w-8 flex flex-col justify-between text-xs text-gray-500">
          <span>{maxCount}</span>
          <span>{Math.round(maxCount / 2)}</span>
          <span>0</span>
        </div>

        {/* Chart area */}
        <div className="ml-7 sm:ml-10 h-full relative">
          {/* Mean line */}
          {mean > 0 && (
            <div
              className="absolute left-0 right-0 border-t border-dashed border-gray-500"
              style={{ top: `${100 - (mean / maxCount) * 100}%` }}
            >
              <span className="absolute -right-1 -top-3 text-xs text-gray-500">μ</span>
            </div>
          )}

          {/* Standard deviation bands */}
          {stdDev > 0 && (
            <>
              <div
                className="absolute left-0 right-0 border-t border-dotted border-amber-500/30"
                style={{ top: `${100 - ((mean + 2.5 * stdDev) / maxCount) * 100}%` }}
              />
              <div
                className="absolute left-0 right-0 border-t border-dotted border-blue-500/30"
                style={{ top: `${100 - ((mean - 2.5 * stdDev) / maxCount) * 100}%` }}
              />
            </>
          )}

          {/* Bars */}
          <div className="flex items-end h-full gap-0.5">
            {chartData.map((week, i) => {
              const height = (week.count / maxCount) * 100
              const isAnomalyBar = i === anomalyIndex

              return (
                <div
                  key={week.week}
                  className="flex-1 flex flex-col items-center justify-end h-full group relative"
                >
                  <div
                    className={classNames(
                      'w-full rounded-t transition-all duration-200',
                      isAnomalyBar
                        ? isSpike
                          ? 'bg-gradient-to-t from-red-600 to-red-400 shadow-lg shadow-red-500/30'
                          : 'bg-gradient-to-t from-blue-600 to-blue-400 shadow-lg shadow-blue-500/30'
                        : 'bg-gray-600 group-hover:bg-gray-500'
                    )}
                    style={{ height: `${Math.max(height, 2)}%` }}
                  />

                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:block z-10">
                    <div className="bg-gray-900 border border-gray-700 rounded px-2 py-1 text-xs whitespace-nowrap">
                      <div className="text-white font-medium">{week.count} reports</div>
                      <div className="text-gray-400">
                        {new Date(week.week).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </div>
                      {week.zScore !== undefined && (
                        <div className={classNames(
                          'font-mono',
                          week.zScore > 2.5 ? 'text-red-400' : week.zScore < -2.5 ? 'text-blue-400' : 'text-gray-400'
                        )}>
                          z = {week.zScore.toFixed(2)}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
        <div className="p-2 bg-gray-800/50 rounded">
          <p className="text-base sm:text-lg font-bold text-white">{zScore.toFixed(1)}σ</p>
          <p className="text-xs text-gray-400">Z-Score</p>
        </div>
        <div className="p-2 bg-gray-800/50 rounded">
          <p className="text-base sm:text-lg font-bold text-white">{mean.toFixed(0)}</p>
          <p className="text-xs text-gray-400">Mean</p>
        </div>
        <div className="p-2 bg-gray-800/50 rounded">
          <p className="text-base sm:text-lg font-bold text-white">±{stdDev.toFixed(0)}</p>
          <p className="text-xs text-gray-400">Std Dev</p>
        </div>
        <div className="p-2 bg-gray-800/50 rounded">
          <p className="text-base sm:text-lg font-bold text-white">2.5σ</p>
          <p className="text-xs text-gray-400">Threshold</p>
        </div>
      </div>

      {/* Explanation */}
      <div className="mt-4 p-2 sm:p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-gray-300 break-words">
          {isSpike ? (
            <>
              This week&apos;s report count of <span className="text-amber-400 font-medium">
              {chartData[anomalyIndex]?.count || 'N/A'} reports</span> is{' '}
              <span className="text-amber-400 font-medium">{Math.abs(zScore).toFixed(1)} standard deviations</span>{' '}
              above the historical average, indicating an unusual spike in activity.
            </>
          ) : (
            <>
              This week&apos;s report count is{' '}
              <span className="text-blue-400 font-medium">{Math.abs(zScore).toFixed(1)} standard deviations</span>{' '}
              below the historical average, indicating an unusual drop in reported activity.
            </>
          )}
        </p>
      </div>
    </div>
  )
}
