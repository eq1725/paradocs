/**
 * AvatarPicker Component
 *
 * Allows users to select from predefined avatars or upload custom image.
 */

import React, { useState } from 'react'
import { Check, Upload, User } from 'lucide-react'
import {
  PREDEFINED_AVATARS,
  AVATAR_CATEGORIES,
  createAvatarUrl,
  isPredefinedAvatar,
  getAvatarById,
  type AvatarCategory
} from '@/lib/avatars'
import { Avatar } from './Avatar'
import { classNames } from '@/lib/utils'

interface AvatarPickerProps {
  currentAvatarUrl: string | null
  userName: string
  onSelect: (avatarUrl: string | null) => void
  onUpload?: (file: File) => Promise<string | null>
  uploading?: boolean
}

export function AvatarPicker({
  currentAvatarUrl,
  userName,
  onSelect,
  onUpload,
  uploading = false
}: AvatarPickerProps) {
  const [selectedCategory, setSelectedCategory] = useState<AvatarCategory>('aliens')

  // Check if current avatar is a predefined one
  const currentPredefinedId = isPredefinedAvatar(currentAvatarUrl)
    ? currentAvatarUrl?.replace('emoji:', '')
    : null

  const filteredAvatars = PREDEFINED_AVATARS.filter(a => a.category === selectedCategory)

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !onUpload) return

    const url = await onUpload(file)
    if (url) {
      onSelect(url)
    }
  }

  const handleSelectPredefined = (avatarId: string) => {
    onSelect(createAvatarUrl(avatarId))
  }

  const handleUseLetter = () => {
    onSelect(null)
  }

  return (
    <div className="space-y-6">
      {/* Current avatar preview */}
      <div className="flex items-center gap-4">
        <Avatar avatarUrl={currentAvatarUrl} name={userName} size="xl" />
        <div>
          <p className="text-white font-medium">Current Avatar</p>
          <p className="text-sm text-gray-400">
            {currentAvatarUrl
              ? isPredefinedAvatar(currentAvatarUrl)
                ? `${getAvatarById(currentPredefinedId || '')?.name || 'Custom'}`
                : 'Custom image'
              : 'Using letter'}
          </p>
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex gap-3">
        <button
          onClick={handleUseLetter}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors',
            !currentAvatarUrl
              ? 'bg-primary-600 text-white'
              : 'bg-white/10 text-gray-300 hover:bg-white/20'
          )}
        >
          <User className="w-4 h-4" />
          Use Letter
        </button>

        {onUpload && (
          <label className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-white/10 text-gray-300 hover:bg-white/20 cursor-pointer transition-colors">
            <Upload className="w-4 h-4" />
            {uploading ? 'Uploading...' : 'Upload Image'}
            <input
              type="file"
              accept="image/*"
              onChange={handleFileUpload}
              className="hidden"
              disabled={uploading}
            />
          </label>
        )}
      </div>

      {/* Category tabs */}
      <div className="flex gap-2 overflow-x-auto pb-2">
        {AVATAR_CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id)}
            className={classNames(
              'flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors',
              selectedCategory === cat.id
                ? 'bg-primary-600 text-white'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            )}
          >
            <span>{cat.icon}</span>
            {cat.name}
          </button>
        ))}
      </div>

      {/* Avatar grid */}
      <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
        {filteredAvatars.map(avatar => {
          const isSelected = currentPredefinedId === avatar.id
          return (
            <button
              key={avatar.id}
              onClick={() => handleSelectPredefined(avatar.id)}
              className={classNames(
                'relative flex flex-col items-center gap-2 p-3 rounded-xl transition-all',
                isSelected
                  ? 'bg-primary-600/30 ring-2 ring-primary-500'
                  : 'bg-white/5 hover:bg-white/10'
              )}
            >
              <span className="text-3xl">{avatar.emoji}</span>
              <span className="text-xs text-gray-400 truncate w-full text-center">
                {avatar.name}
              </span>
              {isSelected && (
                <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary-500 rounded-full flex items-center justify-center">
                  <Check className="w-3 h-3 text-white" />
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default AvatarPicker
