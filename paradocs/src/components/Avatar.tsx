/**
 * Avatar Component
 *
 * Displays user avatar - can be:
 * - Predefined emoji avatar
 * - Custom uploaded image
 * - Fallback letter
 */

import React from 'react'
import Image from 'next/image'
import { getAvatarDisplay } from '@/lib/avatars'
import { classNames } from '@/lib/utils'

interface AvatarProps {
  avatarUrl: string | null
  name: string // Used for fallback letter
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const sizeClasses = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-sm',
  md: 'w-10 h-10 text-base',
  lg: 'w-12 h-12 text-lg',
  xl: 'w-16 h-16 text-2xl',
}

const emojiSizes = {
  xs: 'text-sm',
  sm: 'text-lg',
  md: 'text-xl',
  lg: 'text-2xl',
  xl: 'text-3xl',
}

export function Avatar({ avatarUrl, name, size = 'sm', className }: AvatarProps) {
  const fallbackLetter = name?.[0] || '?'
  const display = getAvatarDisplay(avatarUrl, fallbackLetter)

  const baseClasses = classNames(
    'rounded-full flex items-center justify-center font-medium overflow-hidden',
    sizeClasses[size],
    className
  )

  if (display.type === 'image') {
    return (
      <div className={classNames(baseClasses, 'relative')}>
        <Image
          src={display.value}
          alt={`${name}'s avatar`}
          fill
          className="object-cover"
        />
      </div>
    )
  }

  if (display.type === 'emoji') {
    return (
      <div className={classNames(baseClasses, 'bg-gray-800')}>
        <span className={emojiSizes[size]}>{display.value}</span>
      </div>
    )
  }

  // Letter fallback
  return (
    <div className={classNames(baseClasses, 'bg-primary-600 text-white')}>
      {display.value}
    </div>
  )
}

export default Avatar
