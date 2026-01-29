/**
 * Geographic Hotspots Visualization
 *
 * Shows geographic concentration of reports:
 * - Top countries with report counts
 * - Regional hot-spots with heat intensity
 * - Interactive country breakdown
 */

import React, { useState } from 'react'
import {
  MapPin,
  Globe,
  TrendingUp,
  Flame,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Zap
} from 'lucide-react'
import Link from 'next/link'

interface CountryData {
  country: string
  count: number
}

interface GeographicHotspotsProps {
  countryData: CountryData[]
  totalReports: number
}

// Country flag emoji mapping (common countries)
const COUNTRY_FLAGS: Record<string, string> = {
  'United States': '🇺🇸',
  'USA': '🇺🇸',
  'United Kingdom': '🇬🇧',
  'UK': '🇬🇧',
  'Canada': '🇨🇦',
  'Australia': '🇦🇺',
  'Germany': '🇩🇪',
  'France': '🇫🇷',
  'Brazil': '🇧🇷',
  'Mexico': '🇲🇽',
  'Japan': '🇯🇵',
  'India': '🇮🇳',
  'Italy': '🇮🇹',
  'Spain': '🇪🇸',
  'Netherlands': '🇳🇱',
  'Argentina': '🇦🇷',
  'South Africa': '🇿🇦',
  'Russia': '🇷🇺',
  'China': '🇨🇳',
  'New Zealand': '🇳🇿',
  'Ireland': '🇮🇪',
  'Poland': '🇵🇱',
  'Sweden': '🇸🇪',
  'Norway': '🇳🇴',
  'Finland': '🇫🇮',
  'Denmark': '🇩🇰',
  'Belgium': '🇧🇪',
  'Austria': '🇦🇹',
  'Switzerland': '🇨🇭',
  'Portugal': '🇵🇹',
  'Chile': '🇨🇱',
  'Colombia': '🇨🇴',
  'Peru': '🇵🇪',
  'Philippines': '🇵🇭',
  'Indonesia': '🇮🇩',
  'Malaysia': '🇲🇾',
  'Singapore': '🇸🇬',
  'Thailand': '🇹🇭',
  'South Korea': '🇰🇷',
  'Israel': '🇮🇱',
  'Egypt': '🇪🇬',
  'Turkey': '🇹🇷',
  'Greece': '🇬🇷',
}

// Get heat intensity class based on percentage
function getHeatIntensity(percentage: number): { bg: string; text: string; label: string } {
  if (percentage >= 30) return { bg: 'bg-red-500/30', text: 'text-red-400', label: 'Extreme' }
  if (percentage >= 20) return { bg: 'bg-orange-500/30', text: 'text-orange-400', label: 'Very High' }
  if (percentage >= 10) return { bg: 'bg-amber-500/30', text: 'text-amber-400', label: 'High' }
  if (percentage >= 5) return { bg: 'bg-yellow-500/30', text: 'text-yellow-400', label: 'Moderate' }
  return { bg: 'bg-blue-500/20', text: 'text-blue-400', label: 'Low' }
}

export default function GeographicHotspots({
  countryData,
  totalReports,
}: GeographicHotspotsProps) {
  const [showAll, setShowAll] = useState(false)
  const [selectedCountry, setSelectedCountry] = useState<string | null>(null)

  // Calculate statistics
  const topCountries = showAll ? countryData : countryData.slice(0, 8)
  const topCountry = countryData[0]
  const topPercentage = topCountry && totalReports > 0
    ? Math.round((topCountry.count / totalReports) * 100)
    : 0

  // Calculate global distribution metrics
  const totalCountries = countryData.length
  const top3Count = countryData.slice(0, 3).reduce((sum, c) => sum + c.count, 0)
  const top3Percentage = totalReports > 0 ? Math.round((top3Count / totalReports) * 100) : 0
  const concentrationLevel = top3Percentage > 70 ? 'Highly Concentrated' : top3Percentage > 50 ? 'Moderately Concentrated' : 'Widely Distributed'

  return (
    <div className="glass-card overflow-hidden">
      {/* Header */}
      <div className="p-6 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500/20 to-teal-500/20 flex items-center justify-center">
            <Globe className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-white">Geographic Hotspots</h2>
            <p className="text-sm text-gray-400">Report distribution by region</p>
          </div>
        </div>
      </div>

      {/* Global Stats Summary */}
      <div className="px-6 py-4 border-b border-white/10 bg-white/[0.02]">
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-emerald-400 mb-1">
              <Globe className="w-4 h-4" />
              <span className="text-lg font-bold">{totalCountries}</span>
            </div>
            <span className="text-xs text-gray-400">Countries</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-amber-400 mb-1">
              <Flame className="w-4 h-4" />
              <span className="text-lg font-bold">{top3Percentage}%</span>
            </div>
            <span className="text-xs text-gray-400">Top 3 Share</span>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1 text-blue-400 mb-1">
              <Zap className="w-4 h-4" />
              <span className="text-lg font-bold">{topCountry?.count.toLocaleString() || 0}</span>
            </div>
            <span className="text-xs text-gray-400">#1 Reports</span>
          </div>
        </div>
      </div>

      {/* Distribution indicator */}
      <div className="px-6 py-3 border-b border-white/10">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-400">Distribution Pattern</span>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
            top3Percentage > 70
              ? 'bg-red-500/20 text-red-400'
              : top3Percentage > 50
                ? 'bg-amber-500/20 text-amber-400'
                : 'bg-green-500/20 text-green-400'
          }`}>
            {concentrationLevel}
          </span>
        </div>
      </div>

      {/* Country List */}
      <div className="p-6">
        <div className="space-y-2">
          {topCountries.map((country, index) => {
            const percentage = totalReports > 0
              ? Math.round((country.count / totalReports) * 100)
              : 0
            const heat = getHeatIntensity(percentage)
            const flag = COUNTRY_FLAGS[country.country] || '🌍'
            const isSelected = selectedCountry === country.country
            const isTop3 = index < 3

            return (
              <div
                key={country.country}
                className={`relative overflow-hidden rounded-lg transition-all cursor-pointer ${
                  isSelected ? 'ring-1 ring-primary-500' : ''
                }`}
                onClick={() => setSelectedCountry(isSelected ? null : country.country)}
              >
                {/* Background bar */}
                <div
                  className={`absolute inset-0 ${heat.bg} transition-all`}
                  style={{ width: `${Math.min(percentage * 2, 100)}%` }}
                />

                {/* Content */}
                <div className="relative p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{flag}</span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-white">
                          {country.country}
                        </span>
                        {isTop3 && (
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            index === 0
                              ? 'bg-amber-500/30 text-amber-400'
                              : index === 1
                                ? 'bg-gray-500/30 text-gray-300'
                                : 'bg-orange-800/30 text-orange-400'
                          }`}>
                            #{index + 1}
                          </span>
                        )}
                      </div>
                      {isSelected && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs ${heat.text}`}>{heat.label} activity</span>
                          <Link
                            href={`/explore?country=${encodeURIComponent(country.country)}`}
                            className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1"
                            onClick={(e) => e.stopPropagation()}
                          >
                            Explore <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-white">
                      {country.count.toLocaleString()}
                    </div>
                    <div className={`text-xs ${heat.text}`}>
                      {percentage}%
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Show more/less button */}
        {countryData.length > 8 && (
          <button
            onClick={() => setShowAll(!showAll)}
            className="w-full mt-4 py-2 flex items-center justify-center gap-2 text-sm text-primary-400 hover:text-primary-300 transition-colors"
          >
            {showAll ? (
              <>
                Show less <ChevronUp className="w-4 h-4" />
              </>
            ) : (
              <>
                Show all {countryData.length} countries <ChevronDown className="w-4 h-4" />
              </>
            )}
          </button>
        )}

        {/* Empty state */}
        {countryData.length === 0 && (
          <div className="text-center py-8 text-gray-500">
            <Globe className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No geographic data available</p>
          </div>
        )}
      </div>

      {/* Heat Legend */}
      <div className="px-6 py-4 border-t border-white/10 bg-white/[0.02]">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Activity Level:</span>
          <div className="flex items-center gap-3">
            {[
              { label: 'Low', color: 'bg-blue-500' },
              { label: 'Mod', color: 'bg-yellow-500' },
              { label: 'High', color: 'bg-amber-500' },
              { label: 'V.High', color: 'bg-orange-500' },
              { label: 'Extreme', color: 'bg-red-500' },
            ].map((level) => (
              <div key={level.label} className="flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${level.color}`} />
                <span className="text-xs text-gray-400">{level.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
