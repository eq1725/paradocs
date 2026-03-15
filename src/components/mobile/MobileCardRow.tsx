'use client'

/**
 * MobileCardRow — Netflix-style horizontal scrollable card row.
 *
 * Features:
 * - Scroll-snap for crisp card stops
 * - Peek-at-next (cards at ~85% width so the next card peeks in)
 * - Touch-action isolation (pan-x only) to prevent conflicts with vertical scroll
 * - Hidden scrollbar
 * - Optional section title + "See All" link
 */

import { classNames } from '@/lib/utils'
import Link from 'next/link'
import { useRef, useState, useCallback } from 'react'

interface MobileCardRowProps {
  /** Section title displayed above the row */
  title?: string
  /** Optional subtitle */
  subtitle?: string
  /** Optional icon rendered before the title */
  icon?: React.ReactNode
  /** "See All" link destination */
  seeAllHref?: string
  /** Card width as percentage of container (default: 85) */
  cardWidthPercent?: number
  /** Minimum card width in px (default: 280) */
  minCardWidth?: number
  /** Maximum card width in px (default: 340) */
  maxCardWidth?: number
  /** Gap between cards in px (default: 12 = gap-3) */
  gap?: number
  /** Show dot indicators below the row */
  showDots?: boolean
  /** Total number of items (needed for dots) */
  itemCount?: number
  children: React.ReactNode
}

export function MobileCardRow({
  title,
  subtitle,
  icon,
  seeAllHref,
  cardWidthPercent,
  minCardWidth,
  maxCardWidth,
  showDots,
  itemCount,
  children,
}: MobileCardRowProps) {
  var widthPct = cardWidthPercent || 85
  var minW = minCardWidth || 280
  var maxW = maxCardWidth || 340

  var scrollRef = useRef<HTMLDivElement>(null)
  var [activeIndex, setActiveIndex] = useState(0)

  var handleScroll = useCallback(function() {
    var container = scrollRef.current
    if (!container) return
    var scrollLeft = container.scrollLeft
    var cardWidth = container.offsetWidth * (widthPct / 100)
    var newIndex = Math.round(scrollLeft / cardWidth)
    setActiveIndex(newIndex)
  }, [widthPct])

  // Card style object — avoids template literals (SWC constraint)
  var cardStyle = {
    width: widthPct + '%',
    minWidth: minW + 'px',
    maxWidth: maxW + 'px',
  }

  return (
    <div className="space-y-3">
      {/* Section header */}
      {(title || seeAllHref) && (
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2 min-w-0">
            {icon}
            <div className="min-w-0">
              {title && (
                <h2 className="text-base font-semibold text-white truncate">{title}</h2>
              )}
              {subtitle && (
                <p className="text-xs text-gray-500 truncate">{subtitle}</p>
              )}
            </div>
          </div>
          {seeAllHref && (
            <Link
              href={seeAllHref}
              className="text-xs font-medium text-primary-400 hover:text-primary-300 transition-colors flex-shrink-0 ml-3"
            >
              See All
            </Link>
          )}
        </div>
      )}

      {/* Scrollable row */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide touch-pan-x"
        style={{ overscrollBehaviorX: 'contain' } as React.CSSProperties}
      >
        {/* Wrap children in snap-aligned containers */}
        {children}
      </div>

      {/* Dot indicators */}
      {showDots && itemCount && itemCount > 1 && (
        <div className="flex justify-center gap-1.5">
          {Array.from({ length: itemCount }).map(function(_, i) {
            return (
              <div
                key={i}
                className={classNames(
                  'rounded-full transition-all duration-200',
                  i === activeIndex
                    ? 'w-4 h-1.5 bg-primary-500'
                    : 'w-1.5 h-1.5 bg-gray-600'
                )}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * MobileCardRowItem — wrapper for individual cards in a MobileCardRow.
 * Provides snap alignment and width constraints.
 */
export function MobileCardRowItem({
  children,
  className,
  widthPercent,
  minWidth,
  maxWidth,
}: {
  children: React.ReactNode
  className?: string
  widthPercent?: number
  minWidth?: number
  maxWidth?: number
}) {
  var style = {
    width: (widthPercent || 85) + '%',
    minWidth: (minWidth || 280) + 'px',
    maxWidth: (maxWidth || 340) + 'px',
  }

  return (
    <div
      className={classNames('snap-start flex-shrink-0', className || '')}
      style={style}
    >
      {children}
    </div>
  )
}

export default MobileCardRow
