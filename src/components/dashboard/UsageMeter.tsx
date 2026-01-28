/**
 * UsageMeter Component
 *
 * Displays usage progress for a specific limit (reports, API calls, etc.)
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
    if (isUnlimited) return 'bg-green-500'
    if (isAtLimit) return 'bg-red-500'
    if (isNearLimit) return 'bg-amber-500'
    return 'bg-purple-500'
  }

  return (
    <div className={`space-y-1 ${config.gap}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon && <span className="text-gray-400">{icon}</span>}
          <span className={`text-gray-300 ${config.text}`}>{label}</span>
        </div>
        <span className={`text-gray-400 ${config.text}`}>
          {isUnlimited ? (
            <span className="text-green-400">Unlimited</span>
          ) : (
            <>
              <span className={isAtLimit ? 'text-red-400' : 'text-white'}>
                {current.toLocaleString()}
              </span>
              <span className="text-gray-500"> / </span>
              <span>{limit.toLocaleString()}</span>
              {showPercentage && (
                <span className="text-gray-500 ml-2">({percentage}%)</span>
              )}
            </>
          )}
        </span>
      </div>

      <div className={`w-full bg-gray-700 rounded-full ${config.height} overflow-hidden`}>
        <div
          className={`${config.height} rounded-full transition-all duration-300 ${getBarColor()}`}
          style={{ width: isUnlimited ? '100%' : `${percentage}%` }}
        />
      </div>

      {isAtLimit && !isUnlimited && (
        <p className="text-xs text-red-400">
          You've reached your limit. Upgrade to continue.
        </p>
      )}
    </div>
  )
}

export default UsageMeter
