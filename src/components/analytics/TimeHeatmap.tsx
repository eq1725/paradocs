/**
 * Time Heatmap Component
 *
 * Visualizes temporal patterns showing when phenomena occur:
 * - Time of day distribution (24-hour heatmap)
 * - Day of week distribution
 */

import React, { useState } from 'react'
import { Clock, Calendar, Sun, Moon, Sunrise, Sunset } from 'lucide-react'

interface TimeOfDayData {
  hour: number
  label: string
  count: number
  byCategory: Record<string, number>
}

interface DayOfWeekData {
  day: number
  name: string
  shortName: string
  count: number
  byCategory: Record<string, number>
}

interface TimeHeatmapProps {
  timeOfDayData: TimeOfDayData[]
  dayOfWeekData: DayOfWeekData[]
}

export default function TimeHeatmap({ timeOfDayData, dayOfWeekData }: TimeHeatmapProps) {
  // Check if we have any hour data (event_time is rarely populated)
  const hasHourData = timeOfDayData.some(d => d.count > 0)

  // Default to 'day' view since hour data requires event_time which is often missing
  const [activeView, setActiveView] = useState<'hour' | 'day'>('day')

  // Calculate max values for scaling
  const maxHourCount = Math.max(...timeOfDayData.map(d => d.count), 1)
  const maxDayCount = Math.max(...dayOfWeekData.map(d => d.count), 1)

  // Get intensity color based on count
  const getIntensity = (count: number, max: number) => {
    const ratio = count / max
    if (ratio === 0) return 'bg-gray-800'
    if (ratio < 0.2) return 'bg-primary-900/50'
    if (ratio < 0.4) return 'bg-primary-800/60'
    if (ratio < 0.6) return 'bg-primary-700/70'
    if (ratio < 0.8) return 'bg-primary-600/80'
    return 'bg-primary-500'
  }

  // Time period labels
  const getTimePeriod = (hour: number) => {
    if (hour >= 5 && hour < 12) return { label: 'Morning', icon: Sunrise, color: 'text-amber-400' }
    if (hour >= 12 && hour < 17) return { label: 'Afternoon', icon: Sun, color: 'text-yellow-400' }
    if (hour >= 17 && hour < 21) return { label: 'Evening', icon: Sunset, color: 'text-orange-400' }
    return { label: 'Night', icon: Moon, color: 'text-blue-400' }
  }

  // Calculate period totals
  const periodTotals = {
    morning: timeOfDayData.filter(d => d.hour >= 5 && d.hour < 12).reduce((sum, d) => sum + d.count, 0),
    afternoon: timeOfDayData.filter(d => d.hour >= 12 && d.hour < 17).reduce((sum, d) => sum + d.count, 0),
    evening: timeOfDayData.filter(d => d.hour >= 17 && d.hour < 21).reduce((sum, d) => sum + d.count, 0),
    night: timeOfDayData.filter(d => d.hour >= 21 || d.hour < 5).reduce((sum, d) => sum + d.count, 0),
  }

  const totalReports = Object.values(periodTotals).reduce((a, b) => a + b, 0)

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-medium text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary-400" />
            Temporal Patterns
          </h3>
          <p className="text-sm text-gray-400 mt-1">When do sightings occur?</p>
        </div>

        {/* View Toggle */}
        <div className="flex rounded-lg bg-white/5 p-1">
          <button
            onClick={() => setActiveView('hour')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              activeView === 'hour'
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            By Hour
          </button>
          <button
            onClick={() => setActiveView('day')}
            className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
              activeView === 'day'
                ? 'bg-primary-500/20 text-primary-400'
                : 'text-gray-400 hover:text-white'
            }`}
          >
            By Day
          </button>
        </div>
      </div>

      {activeView === 'hour' ? (
        hasHourData ? (
        <>
          {/* Time period summary */}
          <div className="grid grid-cols-4 gap-2 mb-6">
            {[
              { key: 'morning', icon: Sunrise, color: 'amber', label: 'Morning', hours: '5am-12pm' },
              { key: 'afternoon', icon: Sun, color: 'yellow', label: 'Afternoon', hours: '12pm-5pm' },
              { key: 'evening', icon: Sunset, color: 'orange', label: 'Evening', hours: '5pm-9pm' },
              { key: 'night', icon: Moon, color: 'blue', label: 'Night', hours: '9pm-5am' },
            ].map(period => {
              const count = periodTotals[period.key as keyof typeof periodTotals]
              const percentage = totalReports > 0 ? Math.round((count / totalReports) * 100) : 0
              const Icon = period.icon

              return (
                <div key={period.key} className="text-center p-3 rounded-lg bg-white/5">
                  <Icon className={`w-5 h-5 mx-auto mb-1 text-${period.color}-400`} />
                  <div className="text-lg font-bold text-white">{percentage}%</div>
                  <div className="text-xs text-gray-400">{period.label}</div>
                  <div className="text-xs text-gray-500">{count} reports</div>
                </div>
              )
            })}
          </div>

          {/* 24-hour heatmap grid */}
          <div className="mb-4">
            <div className="flex items-center gap-1 mb-2">
              <span className="text-xs text-gray-500 w-12">Time</span>
              <div className="flex-1 grid grid-cols-24 gap-0.5">
                {timeOfDayData.map(d => (
                  <div
                    key={d.hour}
                    className="text-center text-[10px] text-gray-500"
                  >
                    {d.hour % 6 === 0 ? d.hour : ''}
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <span className="text-xs text-gray-500 w-12">Reports</span>
              <div className="flex-1 grid grid-cols-24 gap-0.5">
                {timeOfDayData.map(d => {
                  const period = getTimePeriod(d.hour)
                  return (
                    <div
                      key={d.hour}
                      className={`h-10 rounded-sm ${getIntensity(d.count, maxHourCount)} transition-all hover:scale-110 cursor-pointer group relative`}
                      title={`${d.label}: ${d.count} reports`}
                    >
                      {/* Tooltip */}
                      <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded bg-gray-900 text-xs text-white opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
                        {d.label}: {d.count} reports
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-2 text-xs text-gray-400">
            <span>Less</span>
            <div className="flex gap-0.5">
              <div className="w-4 h-4 rounded-sm bg-gray-800" />
              <div className="w-4 h-4 rounded-sm bg-primary-900/50" />
              <div className="w-4 h-4 rounded-sm bg-primary-700/70" />
              <div className="w-4 h-4 rounded-sm bg-primary-500" />
            </div>
            <span>More</span>
          </div>
        </>
        ) : (
          /* No hour data available */
          <div className="text-center py-12">
            <Clock className="w-10 h-10 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-2">No time-of-day data available</p>
            <p className="text-sm text-gray-500">
              Reports don't have specific event times recorded.
              <br />
              Try the "By Day" view to see day-of-week patterns.
            </p>
          </div>
        )
      ) : (
        <>
          {/* Day of week distribution */}
          <div className="space-y-3">
            {dayOfWeekData.map(d => {
              const percentage = maxDayCount > 0 ? (d.count / maxDayCount) * 100 : 0

              return (
                <div key={d.day} className="flex items-center gap-3">
                  <span className="w-12 text-sm text-gray-400">{d.shortName}</span>
                  <div className="flex-1">
                    <div className="h-8 bg-gray-800 rounded-lg overflow-hidden relative">
                      <div
                        className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-lg transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                      <span className="absolute inset-0 flex items-center px-3 text-sm text-white font-medium">
                        {d.count} reports
                      </span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Weekend vs Weekday insight */}
          <div className="mt-6 p-4 rounded-lg bg-white/5">
            <div className="flex items-center justify-between">
              <div className="text-center flex-1">
                <div className="text-lg font-bold text-white">
                  {dayOfWeekData.filter(d => d.day >= 1 && d.day <= 5).reduce((sum, d) => sum + d.count, 0)}
                </div>
                <div className="text-xs text-gray-400">Weekday Reports</div>
              </div>
              <div className="text-gray-500">vs</div>
              <div className="text-center flex-1">
                <div className="text-lg font-bold text-white">
                  {dayOfWeekData.filter(d => d.day === 0 || d.day === 6).reduce((sum, d) => sum + d.count, 0)}
                </div>
                <div className="text-xs text-gray-400">Weekend Reports</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
