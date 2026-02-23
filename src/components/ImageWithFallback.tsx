'use client'

import React, { useState } from 'react'
import { CATEGORY_CONFIG } from '@/lib/constants'

interface ImageWithFallbackProps {
  src?: string | null
  alt: string
  category?: string
  className?: string
  width?: number
  height?: number
  fill?: boolean
}

export default function ImageWithFallback({
  src,
  alt,
  category,
  className = '',
  ...props
}: ImageWithFallbackProps) {
  const [hasError, setHasError] = useState(false)

  if (!src || hasError) {
    const config = category
      ? CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
      : null
    const icon = config?.icon || '🔮'
    const color = config?.color || '#7c8ff8'

    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{
          background: `linear-gradient(135deg, ${color}15, ${color}08)`,
          border: `1px solid ${color}20`,
        }}
      >
        <span className="text-3xl opacity-60">{icon}</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setHasError(true)}
      {...props}
    />
  )
}
