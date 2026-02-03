'use client'

import React from 'react'
import { Sun, Cloud, Snowflake, Flower2 } from 'lucide-react'
import { classNames } from '@/lib/utils'

interface MonthData {
  month: number
  monthName: string
  reportCount: number
  seasonalIndex: number
  isPeak?: boolean
}

interface SeasonalVisualizationProps {
  data: MonthData[]
  highlightedMonth?: number
  className?: string
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const SEASON_ICONS: Record<string, React.ElementType> = {
  winter: Snowflake,
  spring: Flower2,
  summer: Sun,
  fall: Cloud
}

const getSeason = (month: number): string => {
  if (month >= 3 && month <= 5) return 'spring'
  if (month >= 6 && month <= 8) return 'summer'
  if (month >= 9 && month <= 11) return 'fall'
  return 'winter'
}

export default function SeasonalVisualization({
  data,
  highlightedMonth,
  className = ''
}: SeasonalVisualizationProps) {
  // Ensure we have 12 months of data
  const fullYearData = MONTH_NAMES.map((name, i) => {
    const existing = data.find(d => d.month === i + 1)
    return existing || {
      month: i + 1,
      monthName: name,
      reportCount: 0,
      seasonalIndex: 1
    }
  })

  const maxIndex = Math.max(...fullYearData.map(d => d.seasonalIndex), 2)
  const minIndex = Math.min(...fullYearData.map(d => d.seasonalIndex), 0)

  // Calculate SVG path for the circular chart
  const centerX = 150
  const centerY = 150
  const outerRadius = 120
  const innerRadius = 60

  const polarToCartesian = (angle: number, radius: number) => {
    const rad = (angle - 90) * (Math.PI / 180)
    return {
      x: centerX + radius * Math.cos(rad),
      y: centerY + radius * Math.sin(rad)
    }
  }

  return (
    <div className={classNames('glass-card p-4', className)}>
      <div className="flex items-center gap-2 mb-4">
        <Sun className="w-5 h-5 text-cyan-400" />
        <h3 className="font-medium text-white">Seasonal Pattern</h3>
      </div>

      {/* Circular Chart */}
      <div className="relative mx-auto" style={{ width: 300, height: 300 }}>
        <svg viewBox="0 0 300 300" className="w-full h-full">
          {/* Background circles */}
          <circle cx={centerX} cy={centerY} r={outerRadius} fill="none" stroke="#374151" strokeWidth="1" />
          <circle cx={centerX} cy={centerY} r={(outerRadius + innerRadius) / 2} fill="none" stroke="#374151" strokeWidth="0.5" strokeDasharray="4 4" />
          <circle cx={centerX} cy={centerY} r={innerRadius} fill="none" stroke="#374151" strokeWidth="1" />

          {/* Month segments */}
          {fullYearData.map((month, i) => {
            const startAngle = (i * 30) - 15
            const endAngle = startAngle + 30

            // Calculate radius based on seasonal index
            const normalizedIndex = (month.seasonalIndex - minIndex) / (maxIndex - minIndex)
            const segmentRadius = innerRadius + (outerRadius - innerRadius) * normalizedIndex

            const start1 = polarToCartesian(startAngle, innerRadius)
            const end1 = polarToCartesian(endAngle, innerRadius)
            const start2 = polarToCartesian(startAngle, segmentRadius)
            const end2 = polarToCartesian(endAngle, segmentRadius)

            const isHighlighted = month.month === highlightedMonth
            const isPeak = month.seasonalIndex > 1.5
            const isLow = month.seasonalIndex < 0.5

            const pathD = `
              M ${start1.x} ${start1.y}
              L ${start2.x} ${start2.y}
              A ${segmentRadius} ${segmentRadius} 0 0 1 ${end2.x} ${end2.y}
              L ${end1.x} ${end1.y}
              A ${innerRadius} ${innerRadius} 0 0 0 ${start1.x} ${start1.y}
            `

            const labelPos = polarToCartesian((startAngle + endAngle) / 2, outerRadius + 15)

            return (
              <g key={month.month}>
                <path
                  d={pathD}
                  fill={
                    isHighlighted
                      ? isPeak ? '#ef4444' : isLow ? '#3b82f6' : '#8b5cf6'
                      : isPeak
                        ? 'rgba(239, 68, 68, 0.3)'
                        : isLow
                          ? 'rgba(59, 130, 246, 0.3)'
                          : 'rgba(107, 114, 128, 0.3)'
                  }
                  stroke={isHighlighted ? '#fff' : '#4b5563'}
                  strokeWidth={isHighlighted ? 2 : 0.5}
                  className="transition-all duration-200 hover:opacity-80 cursor-pointer"
                />
                <text
                  x={labelPos.x}
                  y={labelPos.y}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className={classNames(
                    'text-xs',
                    isHighlighted ? 'fill-white font-medium' : 'fill-gray-400'
                  )}
                >
                  {MONTH_NAMES[i]}
                </text>
              </g>
            )
          })}

          {/* Center label */}
          <text
            x={centerX}
            y={centerY - 10}
            textAnchor="middle"
            className="fill-white text-sm font-medium"
          >
            Seasonal
          </text>
          <text
            x={centerX}
            y={centerY + 10}
            textAnchor="middle"
            className="fill-gray-400 text-xs"
          >
            Index
          </text>
        </svg>

        {/* Season icons */}
        {['winter', 'spring', 'summer', 'fall'].map((season, i) => {
          const Icon = SEASON_ICONS[season]
          const positions = [
            { top: 5, left: '50%', transform: 'translateX(-50%)' },
            { top: '50%', right: 5, transform: 'translateY(-50%)' },
            { bottom: 5, left: '50%', transform: 'translateX(-50%)' },
            { top: '50%', left: 5, transform: 'translateY(-50%)' }
          ]
          return (
            <div
              key={season}
              className="absolute"
              style={positions[i] as React.CSSProperties}
            >
              <Icon className="w-4 h-4 text-gray-500" />
            </div>
          )
        })}
      </div>

      {/* Legend */}
      <div className="flex justify-center gap-6 mt-4 text-xs">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-red-500/50" />
          <span className="text-gray-400">Peak (&gt;1.5×)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-gray-500/50" />
          <span className="text-gray-400">Average</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded bg-blue-500/50" />
          <span className="text-gray-400">Low (&lt;0.5×)</span>
        </div>
      </div>

      {/* Highlighted month stats */}
      {highlightedMonth && (
        <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/20 rounded-lg text-center">
          {(() => {
            const monthData = fullYearData.find(m => m.month === highlightedMonth)
            if (!monthData) return null
            return (
              <>
                <p className="text-sm text-white font-medium">
                  {monthData.monthName}
                </p>
                <p className="text-2xl font-bold text-purple-400">
                  {monthData.seasonalIndex.toFixed(2)}×
                </p>
                <p className="text-xs text-gray-400">
                  {monthData.seasonalIndex > 1.5
                    ? 'Peak season - significantly above average'
                    : monthData.seasonalIndex < 0.5
                      ? 'Low season - significantly below average'
                      : 'Near average activity'}
                </p>
              </>
            )
          })()}
        </div>
      )}
    </div>
  )
}
