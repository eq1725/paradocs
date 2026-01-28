/**
 * TierBadge Component
 *
 * Displays the user's subscription tier as a colored badge.
 */

import React from 'react'
import { User, Star, Zap, Building } from 'lucide-react'
import type { TierName } from '@/lib/subscription'

interface TierBadgeProps {
  tier: TierName
  size?: 'sm' | 'md' | 'lg'
  showIcon?: boolean
}

const tierConfig: Record<TierName, {
  label: string
  bgColor: string
  textColor: string
  borderColor: string
  icon: React.ElementType
}> = {
  free: {
    label: 'Free',
    bgColor: 'bg-gray-800',
    textColor: 'text-gray-300',
    borderColor: 'border-gray-700',
    icon: User
  },
  basic: {
    label: 'Basic',
    bgColor: 'bg-blue-900/50',
    textColor: 'text-blue-300',
    borderColor: 'border-blue-700',
    icon: Star
  },
  pro: {
    label: 'Pro',
    bgColor: 'bg-purple-900/50',
    textColor: 'text-purple-300',
    borderColor: 'border-purple-700',
    icon: Zap
  },
  enterprise: {
    label: 'Enterprise',
    bgColor: 'bg-amber-900/50',
    textColor: 'text-amber-300',
    borderColor: 'border-amber-700',
    icon: Building
  }
}

const sizeConfig = {
  sm: {
    padding: 'px-2 py-0.5',
    text: 'text-xs',
    iconSize: 'w-3 h-3'
  },
  md: {
    padding: 'px-3 py-1',
    text: 'text-sm',
    iconSize: 'w-4 h-4'
  },
  lg: {
    padding: 'px-4 py-1.5',
    text: 'text-base',
    iconSize: 'w-5 h-5'
  }
}

export function TierBadge({ tier, size = 'md', showIcon = true }: TierBadgeProps) {
  const config = tierConfig[tier]
  const sizeStyles = sizeConfig[size]
  const Icon = config.icon

  return (
    <span
      className={`
        inline-flex items-center gap-1.5 rounded-full border font-medium
        ${config.bgColor} ${config.textColor} ${config.borderColor}
        ${sizeStyles.padding} ${sizeStyles.text}
      `}
    >
      {showIcon && <Icon className={sizeStyles.iconSize} />}
      {config.label}
    </span>
  )
}

export default TierBadge
