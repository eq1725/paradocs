'use client'

import { classNames } from '@/lib/utils'
import { LayoutGrid, Clock, Map, Stars } from 'lucide-react'
import { useState } from 'react'

export type ResearchHubView = 'board' | 'timeline' | 'map' | 'constellation'

interface ViewSwitcherProps {
  activeView: ResearchHubView
  onViewChange: (view: ResearchHubView) => void
}

const VIEWS = [
  { id: 'board' as ResearchHubView, label: 'Board', icon: LayoutGrid },
  { id: 'timeline' as ResearchHubView, label: 'Timeline', icon: Clock },
  { id: 'map' as ResearchHubView, label: 'Map', icon: Map },
  { id: 'constellation' as ResearchHubView, label: 'Constellation', icon: Stars },
]

export function ViewSwitcher({ activeView, onViewChange }: ViewSwitcherProps) {
  const [showTooltip, setShowTooltip] = useState<ResearchHubView | null>(null)

  return (
    <div className="flex gap-1 p-2 bg-gray-800/50 rounded-lg border border-gray-700 w-fit">
      {VIEWS.map((view) => {
        const Icon = view.icon
        const isActive = activeView === view.id
        const isComingSoon = view.comingSoon

        return (
          <div key={view.id} className="relative">
            <button
              onClick={() => !isComingSoon && onViewChange(view.id)}
              onMouseEnter={() => isComingSoon && setShowTooltip(view.id)}
              onMouseLeave={() => setShowTooltip(null)}
              className={classNames(
                'flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all duration-200',
                'text-sm',
                isActive
                  ? 'bg-gray-700 text-white'
                  : 'text-gray-400 hover:text-gray-200',
                isComingSoon && 'opacity-60'
              )}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{view.label}</span>
            </button>

            {/* Coming Soon tooltip */}
            {isComingSoon && showTooltip === view.id && (
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-xs text-gray-400 whitespace-nowrap pointer-events-none z-50">
                Coming Soon
                <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-l-transparent border-r-transparent border-t-gray-700" />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export default ViewSwitcher
