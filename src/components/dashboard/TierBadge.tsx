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
    // V11.28 — slug stays 'basic' but the single paid tier is branded
    // "Member" everywhere user-facing.
    label: 'Member',
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
  // V9.6 T1.3 — enterprise is admin-only and never surfaced to users
  // (the public tier list filters it out). Internally we still show it
  // in the user card for admin accounts so they know what tier they're
  // on, but we relabel it 'Admin' and tone the badge down so it doesn't
  // scream against the rest of the muted-grey chrome.
  enterprise: {
    label: 'Admin',
    bgColor: 'bg-gray-800',
    textColor: 'text-gray-300',
    borderColor: 'border-gray-700',
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
