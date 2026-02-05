'use client'

import React, { useState } from 'react'
import { Check, X } from 'lucide-react'
import { classNames } from '@/lib/utils'

// Paranormal-themed emoji options
const AVATAR_EMOJIS = [
  // Paranormal
  '👽', '🛸', '👻', '🦇', '🌙', '⭐', '🔮', '🪬',
  // Creatures
  '🐺', '🦉', '🐙', '🦑', '🐍', '🕷️', '🦂', '🐉',
  // Mystical
  '✨', '💫', '🌟', '🔥', '❄️', '⚡', '🌀', '💎',
  // Nature
  '🌲', '🌊', '🏔️', '🌋', '🌑', '🌕', '☄️', '🌌',
  // Misc
  '🎭', '🗿', '🏛️', '🔭', '📡', '🧬', '🧿', '⚗️',
]

// Color options for background
const AVATAR_COLORS = [
  { name: 'Purple', value: 'bg-primary-600', textColor: 'text-white' },
  { name: 'Blue', value: 'bg-blue-600', textColor: 'text-white' },
  { name: 'Green', value: 'bg-emerald-600', textColor: 'text-white' },
  { name: 'Red', value: 'bg-red-600', textColor: 'text-white' },
  { name: 'Orange', value: 'bg-orange-600', textColor: 'text-white' },
  { name: 'Pink', value: 'bg-pink-600', textColor: 'text-white' },
  { name: 'Cyan', value: 'bg-cyan-600', textColor: 'text-white' },
  { name: 'Gray', value: 'bg-gray-600', textColor: 'text-white' },
]

interface AvatarSelectorProps {
  currentAvatar?: string | null
  onSelect: (avatar: string) => void
  onClose?: () => void
}

export default function AvatarSelector({ currentAvatar, onSelect, onClose }: AvatarSelectorProps) {
  // Parse current avatar (format: "emoji:color" or just "emoji")
  const parseAvatar = (avatar: string | null | undefined) => {
    if (!avatar) return { emoji: '👽', color: AVATAR_COLORS[0].value }
    const parts = avatar.split(':')
    return {
      emoji: parts[0] || '👽',
      color: parts[1] || AVATAR_COLORS[0].value
    }
  }

  const parsed = parseAvatar(currentAvatar)
  const [selectedEmoji, setSelectedEmoji] = useState(parsed.emoji)
  const [selectedColor, setSelectedColor] = useState(parsed.color)

  const handleSave = () => {
    onSelect(`${selectedEmoji}:${selectedColor}`)
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-medium text-white">Choose Your Avatar</h3>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      {/* Preview */}
      <div className="flex justify-center mb-6">
        <div className={classNames(
          'w-24 h-24 rounded-full flex items-center justify-center text-5xl',
          selectedColor
        )}>
          {selectedEmoji}
        </div>
      </div>

      {/* Color Selection */}
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-3">Background Color</label>
        <div className="flex flex-wrap gap-2">
          {AVATAR_COLORS.map((color) => (
            <button
              key={color.value}
              onClick={() => setSelectedColor(color.value)}
              className={classNames(
                'w-8 h-8 rounded-full transition-all',
                color.value,
                selectedColor === color.value
                  ? 'ring-2 ring-white ring-offset-2 ring-offset-gray-900'
                  : 'hover:scale-110'
              )}
              title={color.name}
            />
          ))}
        </div>
      </div>

      {/* Emoji Selection */}
      <div className="mb-6">
        <label className="block text-sm text-gray-400 mb-3">Choose an Icon</label>
        <div className="grid grid-cols-8 gap-2 max-h-48 overflow-y-auto p-2 bg-white/5 rounded-lg">
          {AVATAR_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              onClick={() => setSelectedEmoji(emoji)}
              className={classNames(
                'w-10 h-10 text-2xl rounded-lg flex items-center justify-center transition-all',
                selectedEmoji === emoji
                  ? 'bg-primary-600 ring-2 ring-primary-400'
                  : 'hover:bg-white/10'
              )}
            >
              {emoji}
            </button>
          ))}
        </div>
      </div>

      {/* Save Button */}
      <button
        onClick={handleSave}
        className="w-full btn btn-primary flex items-center justify-center gap-2"
      >
        <Check className="w-4 h-4" />
        Save Avatar
      </button>
    </div>
  )
}

// Helper component to display an avatar
export function Avatar({
  avatar,
  fallback,
  size = 'md',
  className = ''
}: {
  avatar?: string | null
  fallback?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  const sizeClasses = {
    sm: 'w-6 h-6 text-sm',
    md: 'w-8 h-8 text-lg',
    lg: 'w-12 h-12 text-2xl',
    xl: 'w-16 h-16 text-3xl'
  }

  // Parse avatar string (format: "emoji:bg-color-class")
  if (avatar && avatar.includes(':')) {
    const [emoji, bgColor] = avatar.split(':')
    return (
      <div className={classNames(
        'rounded-full flex items-center justify-center',
        sizeClasses[size],
        bgColor || 'bg-primary-600',
        className
      )}>
        {emoji}
      </div>
    )
  }

  // Just an emoji without color
  if (avatar && AVATAR_EMOJIS.includes(avatar)) {
    return (
      <div className={classNames(
        'rounded-full flex items-center justify-center bg-primary-600',
        sizeClasses[size],
        className
      )}>
        {avatar}
      </div>
    )
  }

  // Fallback to initial letter
  return (
    <div className={classNames(
      'rounded-full flex items-center justify-center bg-primary-600 font-medium text-white',
      sizeClasses[size],
      className
    )}>
      {fallback?.[0]?.toUpperCase() || 'U'}
    </div>
  )
}
