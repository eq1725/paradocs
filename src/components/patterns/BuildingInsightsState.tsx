/**
 * Empty state shown when pattern detection doesn't have enough data yet
 * Displays progress toward having enough data for meaningful patterns
 */
import React from 'react'
import { Sparkles, Clock, FileText, TrendingUp } from 'lucide-react'

interface BuildingInsightsStateProps {
  reportCount?: number
  weeksSinceStart?: number
  minReports?: number
  minWeeks?: number
}

export function BuildingInsightsState({
  reportCount = 0,
  weeksSinceStart = 0,
  minReports = 10,
  minWeeks = 4
}: BuildingInsightsStateProps) {
  const reportProgress = Math.min((reportCount / minReports) * 100, 100)
  const timeProgress = Math.min((weeksSinceStart / minWeeks) * 100, 100)
  const overallProgress = Math.min((reportProgress + timeProgress) / 2, 100)

  return (
    <div className="glass-card p-8 text-center max-w-2xl mx-auto">
      {/* Animated icon */}
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div className="absolute inset-0 bg-gradient-to-r from-primary-500/20 to-accent-500/20 rounded-full animate-pulse" />
        <div className="absolute inset-2 bg-gray-900 rounded-full flex items-center justify-center">
          <Sparkles className="w-8 h-8 text-primary-400" />
        </div>
      </div>

      <h3 className="text-xl font-display font-semibold text-white mb-3">
        Building Pattern Intelligence
      </h3>

      <p className="text-gray-400 mb-8 max-w-md mx-auto">
        We're collecting reports to establish baseline patterns. Once we have enough
        data, our AI will automatically detect geographic clusters, temporal anomalies,
        and other meaningful patterns.
      </p>

      {/* Progress indicators */}
      <div className="grid sm:grid-cols-2 gap-4 mb-8">
        {/* Reports progress */}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <FileText className="w-5 h-5 text-emerald-400" />
            <span className="text-sm text-gray-300">Reports Collected</span>
          </div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-white">{reportCount}</span>
            <span className="text-sm text-gray-500">/ {minReports} needed</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
              style={{ width: `${reportProgress}%` }}
            />
          </div>
        </div>

        {/* Time progress */}
        <div className="bg-gray-800/50 rounded-lg p-4">
          <div className="flex items-center gap-3 mb-3">
            <Clock className="w-5 h-5 text-cyan-400" />
            <span className="text-sm text-gray-300">Data Collection Period</span>
          </div>
          <div className="flex items-end justify-between mb-2">
            <span className="text-2xl font-bold text-white">
              {weeksSinceStart} {weeksSinceStart === 1 ? 'week' : 'weeks'}
            </span>
            <span className="text-sm text-gray-500">/ {minWeeks} needed</span>
          </div>
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 rounded-full transition-all duration-500"
              style={{ width: `${timeProgress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Overall progress */}
      <div className="bg-gray-800/30 rounded-lg p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-gray-400">Overall Progress</span>
          <span className="text-sm font-medium text-primary-400">
            {Math.round(overallProgress)}%
          </span>
        </div>
        <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary-500 to-accent-500 rounded-full transition-all duration-500"
            style={{ width: `${overallProgress}%` }}
          />
        </div>
      </div>

      {/* Help text */}
      <div className="mt-8 pt-6 border-t border-gray-800">
        <div className="flex items-start gap-3 text-left">
          <TrendingUp className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-gray-300 font-medium mb-1">
              How can I help?
            </p>
            <p className="text-sm text-gray-500">
              Submit your own sightings and experiences to contribute to our
              pattern detection. Every report helps build a more complete picture
              of unexplained phenomena.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BuildingInsightsState
