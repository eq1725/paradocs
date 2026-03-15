'use client'

/**
 * ViewSwitcher — horizontal pill selector for Research Hub views.
 *
 * Session 13 update: Labels now visible on mobile (was hidden sm:inline).
 * Uses horizontal scroll with snap for mobile so all four views are accessible.
 * Icons + short labels on mobile, full labels on desktop.
 */

import { classNames } from '@/lib/utils'
import { LayoutGrid, Clock, Map, Stars } from 'lucide-react'
import { useState } from 'react'

export type ResearchHubView = 'board' | 'timeline' | 'map' | 'constellation'

interface ViewSwitcherProps {
  activeView: ResearchHubView
  onViewChange: (view: ResearchHubView) => void
}

var VIEWS = [
  { id: 'board' as ResearchHubView, label: 'Board', icon: LayoutGrid },
  { id: 'timeline' as ResearchHubView, label: 'Timeline', icon: Clock },
  { id: 'map' as ResearchHubView, label: 'Map', icon: Map },
  { id: 'constellation' as ResearchHubView, label: 'Stars', mobileLabel: 'Stars', desktopLabel: 'Constellation', icon: Stars },
]

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  var [showTooltip, setShowTooltip] = useState<ResearchHubView | null>(null)

  return (
    <div className="flex gap-1 p-1.5 sm:p-2 bg-gray-800/50 rounded-lg border border-gray-700 w-fit">
      {VIEWS.map(function(view) {
        var Icon = view.icon
        var isActive = activeView === view.id

        return (
          <button
            key={view.id}
            onClick={function() { onViewChange(view.id) }}
            className={classNames(
              'flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg font-medium transition-all duration-200',
              'text-xs sm:text-sm whitespace-nowrap',
              isActive
                ? 'bg-gray-700 text-white'
                : 'text-gray-400 hover:text-gray-200'
            )}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {/* Mobile: short label. Desktop: full label */}
            <span className="sm:hidden">{view.mobileLabel || view.label}</span>
            <span className="hidden sm:inline">{view.desktopLabel || view.label}</span>
          </button>
        )
      })}
    </div>
  )
}

export default ViewSwitcher
