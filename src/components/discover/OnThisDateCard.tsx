'use client'

/**
 * OnThisDateCard — Historical event card for the Discover feed.
 *
 * Shows phenomena with dates matching today's month/day.
 * Amber/orange gradient (distinct from purple content cards).
 * Calendar icon, large year callout, title + summary.
 *
 * SWC compliant: var, function expressions, string concat
 */

import React from 'react'
import Link from 'next/link'
import { Calendar, ChevronRight } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'

export interface OnThisDateData {
  item_type: 'on_this_date'
  id: string
  name: string
  slug: string
  category: string
  ai_summary: string | null
  event_year: number
  first_reported_date: string
}

interface OnThisDateCardProps {
  item: OnThisDateData
  isActive: boolean
}

export function OnThisDateCard(props: OnThisDateCardProps) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var categoryLabel = config ? config.label : item.category
  var categoryIcon = config ? config.icon : '\uD83D\uDD2E'

  var yearsAgo = new Date().getFullYear() - item.event_year
  var yearsText = yearsAgo === 1 ? '1 year ago' : yearsAgo + ' years ago'

  var monthDay = ''
  try {
    var d = new Date(item.first_reported_date)
    var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    monthDay = months[d.getMonth()] + ' ' + d.getDate()
  } catch (e) {
    monthDay = 'Today'
  }

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-950">
      {/* Amber/orange gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-amber-950/50 via-gray-950 to-orange-950/30" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(217,119,6,0.10),transparent_60%)]" />

      {/* Content */}
      <div className={
        'relative z-10 h-full flex flex-col justify-center items-center px-6 sm:px-10 text-center transition-all duration-700 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Badge */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/20 border border-amber-500/30 rounded-full">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-xs font-semibold text-amber-300">On This Date</span>
          </div>
        </div>

        {/* Year callout */}
        <div className="mb-4">
          <span className="text-6xl sm:text-7xl font-bold text-amber-400/80">{item.event_year}</span>
        </div>

        {/* Date subtitle */}
        <p className="text-amber-300/60 text-sm font-medium mb-6">
          {monthDay + ' \u2014 ' + yearsText}
        </p>

        {/* Title */}
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 max-w-md leading-tight">
          {item.name}
        </h2>

        {/* Category badge */}
        <div className="flex items-center gap-1.5 mb-4">
          <span>{categoryIcon}</span>
          <span className="text-xs text-gray-400 font-medium">{categoryLabel}</span>
        </div>

        {/* Summary */}
        {item.ai_summary && (
          <p className="text-gray-300 text-sm sm:text-base mb-8 max-w-sm leading-relaxed line-clamp-4">
            {item.ai_summary}
          </p>
        )}

        {/* CTA */}
        <Link
          href={'/phenomena/' + item.slug}
          className="inline-flex items-center gap-2 px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white rounded-full font-medium transition-colors text-sm"
        >
          <span>Read the full story</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
