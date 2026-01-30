/**
 * Correlation Explorer
 *
 * Interactive tool that lets users discover unexpected relationships
 * between different phenomena, times, locations, and other factors.
 */

import React, { useState, useMemo } from 'react'
import {
  Sparkles,
  ArrowRight,
  Moon,
  Sun,
  Calendar,
  MapPin,
  Tag,
  TrendingUp,
  Percent,
  ChevronDown,
  Lightbulb
} from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'

interface CorrelationExplorerProps {
  timeOfDayData: { hour: number; count: number; byCategory: Record<string, number> }[]
  dayOfWeekData: { day: number; name: string; count: number; byCategory: Record<string, number> }[]
  categoryData: { category: string; count: number }[]
  credibilityData: { name: string; value: number }[]
}

interface CorrelationInsight {
  title: string
  description: string
  strength: 'strong' | 'moderate' | 'weak'
  icon: typeof Moon
  color: string
}

export default function CorrelationExplorer({
  timeOfDayData,
  dayOfWeekData,
  categoryData,
  credibilityData,
}: CorrelationExplorerProps) {
  const [selectedCategory, setSelectedCategory] = useState<string>('all')
  const [isExpanded, setIsExpanded] = useState(false)

  // Calculate correlations and insights - filtered by selected category
  const insights = useMemo(() => {
    const results: CorrelationInsight[] = []

    // Helper to get count for current filter
    const getCount = (hourData: { count: number; byCategory: Record<string, number> }) => {
      if (selectedCategory === 'all') return hourData.count
      return hourData.byCategory[selectedCategory] || 0
    }

    const getDayCount = (dayData: { count: number; byCategory: Record<string, number> }) => {
      if (selectedCategory === 'all') return dayData.count
      return dayData.byCategory[selectedCategory] || 0
    }

    // Calculate total based on filter
    const totalReports = selectedCategory === 'all'
      ? categoryData.reduce((sum, c) => sum + c.count, 0)
      : categoryData.find(c => c.category === selectedCategory)?.count || 0

    if (totalReports === 0) return results

    const categoryLabel = selectedCategory === 'all'
      ? ''
      : CATEGORY_CONFIG[selectedCategory as PhenomenonCategory]?.label || selectedCategory

    // Night vs Day analysis
    const nightHours = timeOfDayData.filter(d => d.hour >= 21 || d.hour < 5)
    const dayHours = timeOfDayData.filter(d => d.hour >= 5 && d.hour < 21)
    const nightCount = nightHours.reduce((sum, d) => sum + getCount(d), 0)
    const dayCount = dayHours.reduce((sum, d) => sum + getCount(d), 0)
    const nightPercentage = totalReports > 0 ? Math.round((nightCount / totalReports) * 100) : 0

    if (nightPercentage > 60) {
      results.push({
        title: `Nighttime Dominance${categoryLabel ? ` (${categoryLabel})` : ''}`,
        description: `${nightPercentage}% of ${categoryLabel || 'all'} sightings occur at night (9pm-5am). This aligns with darker skies making aerial phenomena more visible.`,
        strength: 'strong',
        icon: Moon,
        color: '#3b82f6',
      })
    } else if (nightPercentage > 40) {
      results.push({
        title: `Evening Peak Activity${categoryLabel ? ` (${categoryLabel})` : ''}`,
        description: `${categoryLabel || 'All'} sightings are fairly distributed, with ${nightPercentage}% at night. Peak activity often occurs during twilight hours.`,
        strength: 'moderate',
        icon: Sun,
        color: '#f59e0b',
      })
    }

    // Weekend vs Weekday analysis
    const weekendDays = dayOfWeekData.filter(d => d.day === 0 || d.day === 6)
    const weekdayDays = dayOfWeekData.filter(d => d.day >= 1 && d.day <= 5)
    const weekendCount = weekendDays.reduce((sum, d) => sum + getDayCount(d), 0)
    const weekdayCount = weekdayDays.reduce((sum, d) => sum + getDayCount(d), 0)

    const weekendExpected = totalReports * (2 / 7) // Expected if uniform
    const weekendRatio = weekendExpected > 0 ? weekendCount / weekendExpected : 1

    if (weekendRatio > 1.2) {
      results.push({
        title: `Weekend Spike${categoryLabel ? ` (${categoryLabel})` : ''}`,
        description: `${categoryLabel || 'All'} reports are ${Math.round((weekendRatio - 1) * 100)}% higher on weekends. More people are outdoors and have time to observe and report.`,
        strength: weekendRatio > 1.4 ? 'strong' : 'moderate',
        icon: Calendar,
        color: '#22c55e',
      })
    }

    // Category concentration - only show when viewing all categories
    if (selectedCategory === 'all' && categoryData.length > 0) {
      const allTotal = categoryData.reduce((sum, c) => sum + c.count, 0)
      const topCategory = categoryData[0]
      const topPercentage = allTotal > 0 ? Math.round((topCategory.count / allTotal) * 100) : 0
      const categoryConfig = CATEGORY_CONFIG[topCategory.category as PhenomenonCategory]

      if (topPercentage > 50) {
        results.push({
          title: `${categoryConfig?.label || topCategory.category} Dominance`,
          description: `${topPercentage}% of all reports are ${categoryConfig?.label || topCategory.category} sightings. This category significantly outweighs others.`,
          strength: 'strong',
          icon: Tag,
          color: categoryConfig?.color || '#6b7280',
        })
      }
    }

    // Credibility distribution insight
    const highCredibility = credibilityData.find(c => c.name === 'high' || c.name === 'confirmed')
    const totalCred = credibilityData.reduce((sum, c) => sum + c.value, 0)
    if (highCredibility && totalCred > 0) {
      const highPercentage = Math.round((highCredibility.value / totalCred) * 100)
      if (highPercentage > 20) {
        results.push({
          title: 'High Credibility Rate',
          description: `${highPercentage}% of reports have high or confirmed credibility, indicating quality submissions with supporting evidence.`,
          strength: highPercentage > 30 ? 'strong' : 'moderate',
          icon: TrendingUp,
          color: '#a855f7',
        })
      }
    }

    // Peak hour analysis - filtered by category
    if (timeOfDayData.length > 0) {
      const hourDataFiltered = timeOfDayData.map(d => ({ ...d, filteredCount: getCount(d) }))
      const peakHour = hourDataFiltered.reduce((max, d) => d.filteredCount > max.filteredCount ? d : max, hourDataFiltered[0])
      const avgCount = totalReports / 24
      const peakRatio = avgCount > 0 ? peakHour.filteredCount / avgCount : 1

      if (peakRatio > 2 && peakHour.filteredCount > 0) {
        const hour = peakHour.hour
        const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`
        results.push({
          title: `${timeLabel} Peak Hour${categoryLabel ? ` (${categoryLabel})` : ''}`,
          description: `${categoryLabel || 'All'} activity spikes ${Math.round(peakRatio)}x above average at ${timeLabel}. This is the most active hour for ${categoryLabel || 'reported'} sightings.`,
          strength: peakRatio > 3 ? 'strong' : 'moderate',
          icon: TrendingUp,
          color: '#ef4444',
        })
      }
    }

    return results
  }, [timeOfDayData, dayOfWeekData, categoryData, credibilityData, selectedCategory])

  // Category-specific time analysis
  const categoryTimeCorrelation = useMemo(() => {
    if (selectedCategory === 'all') return null

    const categoryHourData = timeOfDayData.map(h => ({
      hour: h.hour,
      count: h.byCategory[selectedCategory] || 0
    }))

    const totalCatReports = categoryHourData.reduce((sum, h) => sum + h.count, 0)
    if (totalCatReports === 0) return null

    const nightCount = categoryHourData.filter(h => h.hour >= 21 || h.hour < 5).reduce((sum, h) => sum + h.count, 0)
    const nightPercent = Math.round((nightCount / totalCatReports) * 100)

    const peakHour = categoryHourData.reduce((max, h) => h.count > max.count ? h : max, categoryHourData[0])
    const hour = peakHour.hour
    const timeLabel = hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`

    const config = CATEGORY_CONFIG[selectedCategory as PhenomenonCategory]

    return {
      category: config?.label || selectedCategory,
      nightPercent,
      peakHour: timeLabel,
      peakCount: peakHour.count,
      total: totalCatReports,
    }
  }, [selectedCategory, timeOfDayData])

  const getStrengthColor = (strength: string) => {
    switch (strength) {
      case 'strong': return 'bg-green-500/20 text-green-400'
      case 'moderate': return 'bg-amber-500/20 text-amber-400'
      default: return 'bg-gray-500/20 text-gray-400'
    }
  }

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
            <Sparkles className="w-5 h-5 text-purple-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Correlation Explorer</h2>
            <p className="text-sm text-gray-400">Discover hidden patterns in the data</p>
          </div>
        </div>
      </div>

      {/* Category Filter */}
      <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <label className="text-sm text-gray-400 mb-2 block">Analyze by category:</label>
        <div className="relative">
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2 text-white appearance-none cursor-pointer focus:outline-none focus:border-primary-500"
          >
            <option value="all">All Categories</option>
            {categoryData.map(cat => {
              const config = CATEGORY_CONFIG[cat.category as PhenomenonCategory]
              return (
                <option key={cat.category} value={cat.category}>
                  {config?.label || cat.category} ({cat.count})
                </option>
              )
            })}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      {/* Category-specific analysis */}
      {categoryTimeCorrelation && (
        <div className="p-6 border-b border-white/10">
          <div className="flex items-center gap-2 mb-3">
            <Tag className="w-4 h-4 text-primary-400" />
            <span className="text-sm font-medium text-white">{categoryTimeCorrelation.category} Analysis</span>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-white/5 text-center">
              <div className="text-lg font-bold text-white">{categoryTimeCorrelation.nightPercent}%</div>
              <div className="text-xs text-gray-400">Nighttime</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5 text-center">
              <div className="text-lg font-bold text-white">{categoryTimeCorrelation.peakHour}</div>
              <div className="text-xs text-gray-400">Peak Hour</div>
            </div>
            <div className="p-3 rounded-lg bg-white/5 text-center">
              <div className="text-lg font-bold text-white">{categoryTimeCorrelation.total}</div>
              <div className="text-xs text-gray-400">Total Reports</div>
            </div>
          </div>
        </div>
      )}

      {/* Discovered Insights */}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-4">
          <Lightbulb className="w-4 h-4 text-amber-400" />
          <span className="text-sm font-medium text-white">Discovered Correlations</span>
        </div>

        <div className="space-y-3">
          {(isExpanded ? insights : insights.slice(0, 3)).map((insight, index) => {
            const Icon = insight.icon
            return (
              <div
                key={index}
                className="p-4 rounded-lg bg-white/5 border border-white/5 hover:border-white/10 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{ backgroundColor: `${insight.color}20` }}
                  >
                    <Icon className="w-4 h-4" style={{ color: insight.color }} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="text-sm font-medium text-white">{insight.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getStrengthColor(insight.strength)}`}>
                        {insight.strength}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400">{insight.description}</p>
                  </div>
                </div>
              </div>
            )
          })}

          {insights.length > 3 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="w-full py-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
            >
              {isExpanded ? 'Show less' : `Show ${insights.length - 3} more insights`}
            </button>
          )}

          {insights.length === 0 && (
            <div className="text-center py-6 text-gray-500">
              <Sparkles className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Not enough data to generate correlations</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
