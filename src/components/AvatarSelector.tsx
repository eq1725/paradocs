'use client'

/**
 * AvatarSelector — V9.7 Phase 1.
 *
 * Curated avatar library, fetched from /api/avatars/curated which is
 * backed by the curated_avatars Supabase table. Replaces the
 * hardcoded emoji+color grid that lived here previously.
 *
 * Categories (Travelers · Cosmos · Mystics · Symbols · Researchers)
 * render as tabs across the top; the active tab's avatars fill a
 * grid below. Clicking an avatar selects + saves immediately so
 * users don't have to chase a separate Save button — the modal closes
 * and the parent's onSelect fires with the image URL.
 *
 * Backward compatibility: the Avatar helper component below renders
 * three formats:
 *   1. URL strings (V9.7+) — '/avatars/curated/alien-head.webp'
 *   2. Legacy emoji+color — '👽:bg-primary-600'
 *   3. Legacy emoji-only — '👽'
 * Falls back to the user's display-name initial if none match.
 *
 * SWC: var, function expressions, string concat for compatibility.
 */

import React, { useEffect, useState } from 'react'
import { Check, X, Loader2, Plus } from 'lucide-react'
import { classNames } from '@/lib/utils'
import CustomAvatarUpload from '@/components/account/CustomAvatarUpload'

interface CuratedAvatar {
  slug: string
  name: string
  image_url: string
}

interface CuratedCategory {
  key: string
  label: string
  avatars: CuratedAvatar[]
}

interface AvatarSelectorProps {
  currentAvatar?: string | null
  onSelect: (avatar: string) => void
  onClose?: () => void
}

export default function AvatarSelector(props: AvatarSelectorProps) {
  var [categories, setCategories] = useState<CuratedCategory[]>([])
  var [activeCategory, setActiveCategory] = useState<string>('travelers')
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  // V9.7 P2 — custom upload modal state.
  var [showCustomUpload, setShowCustomUpload] = useState(false)

  useEffect(function () {
    var cancelled = false
    fetch('/api/avatars/curated')
      .then(function (r) {
        if (!r.ok) throw new Error('Failed to load avatars')
        return r.json()
      })
      .then(function (data) {
        if (cancelled) return
        var cats = (data && data.categories) || []
        setCategories(cats)
        if (cats.length > 0) setActiveCategory(cats[0].key)
        setLoading(false)
      })
      .catch(function (err: any) {
        if (cancelled) return
        setError(err?.message || 'Could not load avatars')
        setLoading(false)
      })
    return function () { cancelled = true }
  }, [])

  function handlePick(imageUrl: string) {
    props.onSelect(imageUrl)
  }

  var activeAvatars: CuratedAvatar[] = []
  var found = categories.find(function (c) { return c.key === activeCategory })
  if (found) activeAvatars = found.avatars

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-2xl p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="text-lg font-semibold text-white">Choose your avatar</h3>
          <p className="text-xs text-gray-500 mt-0.5">Pick one — it&apos;ll save automatically.</p>
        </div>
        {props.onClose && (
          <button
            type="button"
            onClick={props.onClose}
            className="p-1.5 hover:bg-white/10 rounded-lg transition-colors"
            aria-label="Close avatar picker"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-gray-500 animate-spin" />
        </div>
      )}

      {error && !loading && (
        <div className="py-8 text-center text-sm text-amber-300">{error}</div>
      )}

      {!loading && !error && categories.length > 0 && (
        <>
          {/* Category tabs */}
          <div className="flex gap-1 sm:gap-1.5 mb-4 -mx-1 overflow-x-auto scrollbar-none pb-1">
            {categories.map(function (cat) {
              var active = cat.key === activeCategory
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={function () { setActiveCategory(cat.key) }}
                  className={
                    'flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors ' +
                    (active
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-800 text-gray-300 hover:text-white hover:bg-gray-700')
                  }
                >
                  {cat.label}
                </button>
              )
            })}
          </div>

          {/* Avatar grid — V9.7 P2: +Custom tile leads on every category
              tab. Clicking it opens the upload + crop modal. */}
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 sm:gap-4">
            <button
              type="button"
              onClick={function () { setShowCustomUpload(true) }}
              aria-label="Upload your own image"
              className="group relative aspect-square rounded-xl flex flex-col items-center justify-center gap-1 bg-gradient-to-br from-purple-600/20 to-purple-900/10 border-2 border-dashed border-purple-500/40 hover:border-purple-400 hover:bg-purple-600/25 transition-all"
            >
              <Plus className="w-6 h-6 text-purple-300 group-hover:text-purple-200" />
              <span className="text-[10px] font-medium text-purple-200">Upload</span>
            </button>
            {activeAvatars.map(function (av) {
              var selected = props.currentAvatar === av.image_url
              return (
                <button
                  key={av.slug}
                  type="button"
                  onClick={function () { handlePick(av.image_url) }}
                  aria-label={'Select ' + av.name + ' avatar'}
                  className={
                    'group relative aspect-square rounded-xl flex items-center justify-center transition-all ' +
                    (selected
                      ? 'bg-purple-600/20 border-2 border-purple-500'
                      : 'bg-gray-800 border-2 border-transparent hover:border-gray-700 hover:bg-gray-800/60')
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={av.image_url}
                    alt={av.name}
                    className="w-3/4 h-3/4 object-contain"
                    loading="lazy"
                  />
                  {selected && (
                    <span className="absolute top-1 right-1 w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                      <Check className="w-3 h-3 text-white" />
                    </span>
                  )}
                  <span className="sr-only">{av.name}</span>
                </button>
              )
            })}
          </div>

          <p className="text-[11px] text-gray-500 text-center mt-5">
            Upload your own image or pick from the curated set above.
          </p>
        </>
      )}

      {/* V9.7 P2 — custom upload + crop modal. Renders on top of this
          card; closes itself on success. */}
      <CustomAvatarUpload
        open={showCustomUpload}
        onClose={function () { setShowCustomUpload(false) }}
        onApproved={function (url) {
          props.onSelect(url)
        }}
      />
    </div>
  )
}

/**
 * Avatar — renderer used everywhere across the app to display a
 * user's avatar at a consistent size + treatment.
 *
 * Render priority:
 *   1. URL avatar (V9.7+)         — '/avatars/...' or 'https://...'
 *   2. Legacy emoji+color         — '👽:bg-primary-600'
 *   3. Legacy emoji-only          — '👽'
 *   4. Display-name initial       — 'C'
 */
export function Avatar(props: {
  avatar?: string | null
  fallback?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}) {
  var size = props.size || 'md'
  var sizeClasses: Record<string, string> = {
    sm: 'w-6 h-6 text-sm',
    md: 'w-8 h-8 text-lg',
    lg: 'w-12 h-12 text-2xl',
    xl: 'w-16 h-16 sm:w-20 sm:h-20 text-3xl',
  }
  var avatar = props.avatar
  var className = props.className || ''

  // 1. URL — render <img> inside a circular container.
  //    V9.7.1 — switched object-cover → object-contain + 12% inset
  //    so the curated icons (which are square, content-edge-bleeding)
  //    fit inside the circle without their corners getting clipped.
  //    object-cover was cropping wide icons (e.g. Peace flag) into
  //    fragments. Treat anything starting with '/' or 'http' as a URL.
  if (avatar && (avatar.indexOf('/') === 0 || avatar.indexOf('http') === 0)) {
    return (
      <div
        className={classNames(
          'rounded-full overflow-hidden bg-gray-800 flex items-center justify-center',
          sizeClasses[size],
          className
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={avatar}
          alt={(props.fallback || 'avatar') + ' avatar'}
          className="w-[88%] h-[88%] object-contain"
        />
      </div>
    )
  }

  // 2. Legacy emoji+color format ("👽:bg-primary-600").
  if (avatar && avatar.indexOf(':') > -1) {
    var parts = avatar.split(':')
    var emoji = parts[0]
    var bgColor = parts[1] || 'bg-primary-600'
    return (
      <div className={classNames(
        'rounded-full flex items-center justify-center',
        sizeClasses[size],
        bgColor,
        className
      )}>
        {emoji}
      </div>
    )
  }

  // 3. Legacy emoji-only.
  if (avatar && avatar.length <= 4 /* emoji char or two */) {
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

  // 4. Initial fallback.
  var initial = (props.fallback || 'U').charAt(0).toUpperCase()
  return (
    <div className={classNames(
      'rounded-full flex items-center justify-center bg-primary-600 font-medium text-white',
      sizeClasses[size],
      className
    )}>
      {initial}
    </div>
  )
}
