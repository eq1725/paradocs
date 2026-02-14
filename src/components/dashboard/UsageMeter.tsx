/**
 * UsageMeter Component
 *
 * Displays usage progress for a specific limit (reports, API calls, etc.)
 * For unlimited tiers, shows a clear "no cap" indicator instead of a full bar.
 */

import React from 'react'

interface UsageMeterProps {
  label: string
  current: number
  limit: number
  icon?: React.ReactNode
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function UsageMeter({
  label,
  current,
  limit,
  icon,
  showPercentage = true,
  size = 'md'
}: UsageMeterProps) {
  const isUnlimited = limit === -1
  const percentage = isUnlimited ? 0 : Math.min(100, Math.round((current / limit) * 100))
  const isNearLimit = percentage >= 80
  const isAtLimit = percentage >= 100

  const sizeConfig = {
    sm: {
      height: 'h-1.5',
      text: 'text-xs',
      gap: 'gap-1'
    },
    md: {
      height: 'h-2',
      text: 'text-sm',
      gap: 'gap-2'
    },
    lg: {
      height: 'h-3',
      text: 'text-base',
      gap: 'gap-3'
    }
  }

  const config = sizeConfig[size]

  const getBarColor = () => {
    if (isAtLimit) return 'bg-red-500'
    if (isNearLimit) return 'bg-amber-500'
    return 'bg-purple-500'
  }

  // Unlimited tier: show usage count with infinity badge, no progress bar
  if (isUnlimited) {
    return (
      <div className={`space-y-1 ${config.gap}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon && <span className="text-gray-400">{icon}</span>}
            <span className={`text-gray-300 ${config.text}`}>{label}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className={`text-white ${config.text} font-medium`}>
              {current.toLocaleString()} used
            </span>
            <span className="text-[10px] font-medium text-green-400 bg-green-400/10 border border-green-500/20 rounded-full px-2 py-0.5">
              ∞ No limit
            </span>
          </div>
        </div>
        {/* Subtle unfilled bar with dashed style to indicate "no cap" */}
        <div className={`w-full rounded-full ${config.height} border border-dashed border-gray-700 bg-transparent`} />
      </div>
    )
  }

  return (
    <div className={`space-y-1 ${config.gap}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          <span className={`text-gray-300 ${config.text}`}>{label}</span>
        </div>
        <span className={`text-gray-400 ${config.text}`}>
          <span className={isAtLimit ? 'text-red-400' : 'text-white'}>
            {current.toLocaleString()}
          </span>
          <span className="text-gray-500"> / </span>
          <span>{limit.toLocaleString()}</span>
          {showPercentage && (
            <span className="text-gray-500 ml-2">({percentage}%)</span>
          )}
        </span>
      </div>

      <div className={`w-full bg-gray-700 rounded-full ${config.height} overflow-hidden`}>
        <div
          className={`${config.height} rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: `${percentage}%` }}
        />
      </div>

      {isAtLimit && (
        <p className="text-xs text-red-400">
          You've reached your limit. Upgrade to continue.
        </p>
      )}
    </div>
  )
}

export default UsageMeter
