'use client'

/**
 * SkeletonCard — dossier-styled placeholder shown while the feed is loading.
 *
 * Matches the layout of PhenomenonCard / TextReportCard:
 *   - Badge bar
 *   - Meta strip
 *   - Headline block (3 lines)
 *   - Chip strip (2-3 chips)
 *   - Stats row
 *   - Read Case button placeholder
 *   - Bottom stats bar
 *
 * Uses .today-skeleton shimmer keyframe defined in globals.css.
 *
 * SWC: var, function expressions, string concat only.
 */

import React from 'react'

export function SkeletonCard() {
  return (
    <div className="flex flex-col gap-4 md:gap-5 h-full font-sans" aria-hidden="true">
      {/* Badge bar */}
      <div className="flex items-center justify-between">
        <div className="today-skeleton h-3 w-40" />
      </div>

      {/* Meta strip */}
      <div className="today-skeleton h-2.5 w-56" />

      {/* Headline (3 staggered lines) */}
      <div className="flex flex-col gap-2">
        <div className="today-skeleton h-6 w-[88%]" />
        <div className="today-skeleton h-6 w-[74%]" />
        <div className="today-skeleton h-6 w-[52%]" />
      </div>

      {/* Chip strip */}
      <div className="flex gap-2">
        <div className="today-skeleton h-5 w-20 rounded-full" />
        <div className="today-skeleton h-5 w-24 rounded-full" />
        <div className="today-skeleton h-5 w-16 rounded-full" />
      </div>

      {/* Stats row */}
      <div className="flex gap-8">
        <div className="flex flex-col gap-1">
          <div className="today-skeleton h-7 w-12" />
          <div className="today-skeleton h-2 w-14" />
        </div>
        <div className="flex flex-col gap-1">
          <div className="today-skeleton h-7 w-12" />
          <div className="today-skeleton h-2 w-14" />
        </div>
      </div>

      {/* Read Case button placeholder */}
      <div className="today-skeleton h-10 w-full md:w-40 rounded-lg" />

      {/* Spacer so the bottom bar sits at the bottom */}
      <div className="flex-1" />

      {/* Bottom stats bar */}
      <div className="flex items-center justify-between">
        <div className="today-skeleton h-2.5 w-20" />
        <div className="today-skeleton h-2.5 w-12" />
      </div>
    </div>
  )
}

export default SkeletonCard
