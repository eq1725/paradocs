/**
 * MapEmptyState — V11.15.0
 *
 * Centered card shown when the active filters return zero reports.
 * SME panel finding F9: "No empty-state when filters return zero."
 * Without this, the map renders blank and users assume the site is
 * broken. This component explicitly tells them their filters
 * matched nothing AND offers a one-click reset.
 *
 * Mobile-friendly: shrinks padding + text on narrow viewports.
 * Pointer events scoped to button only — clicking the card backdrop
 * doesn't intercept map interaction.
 */

import React from 'react'
import { SearchX, RotateCcw } from 'lucide-react'

interface MapEmptyStateProps {
  /** True when there are zero reports after filtering AND filters are active. */
  visible: boolean
  /** Called when user clicks Reset Filters. */
  onReset: () => void
  /** Optional summary of the active filters for context. */
  filterSummary?: string
}

export default function MapEmptyState({ visible, onReset, filterSummary }: MapEmptyStateProps) {
  if (!visible) return null

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none">
      <div className="pointer-events-auto max-w-sm w-full mx-4 bg-gray-900/95 backdrop-blur-lg border border-white/15 rounded-2xl shadow-2xl p-6 sm:p-8 text-center">
        <div className="flex justify-center mb-4">
          <div className="w-12 h-12 rounded-full bg-purple-500/15 flex items-center justify-center">
            <SearchX size={22} className="text-purple-300" />
          </div>
        </div>
        <h3 className="text-base sm:text-lg font-semibold text-white mb-1.5">
          No reports match your filters
        </h3>
        <p className="text-sm text-gray-400 mb-5 leading-relaxed">
          {filterSummary
            ? 'Nothing matched ' + filterSummary + '. Try widening your filters.'
            : 'Try widening your filters or clearing them to see the full corpus.'}
        </p>
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 hover:bg-purple-500/30 active:bg-purple-500/40 text-purple-100 hover:text-white text-sm font-medium rounded-lg transition-colors"
        >
          <RotateCcw size={14} />
          Reset all filters
        </button>
      </div>
    </div>
  )
}
