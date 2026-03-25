'use client'

/**
 * ClusteringCard — Metadata synthesis card for the Discover feed.
 *
 * Shows aggregated report statistics as compelling editorial cards:
 *   "17 NDE reports this week from the Southeast"
 *   "3 new Bigfoot sightings within 50 miles of the Pacific Crest Trail"
 *
 * Purple gradient, TrendingUp icon. Tapping opens a filtered view.
 *
 * SWC compliant: var, function expressions, string concat
 */

import React from 'react'
import Link from 'next/link'
import { TrendingUp, MapPin, Calendar, ChevronRight } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'

export interface ClusterCardData {
  item_type: 'cluster'
  id: string
  cluster_type: 'geographic_cluster' | 'temporal_burst' | 'category_trend' | 'milestone'
  headline: string
  subheadline: string
  category: string
  report_count: number
  time_range: string
  location_summary?: string
  linked_report_ids: string[]
}

interface ClusteringCardProps {
  item: ClusterCardData
  isActive: boolean
}

var CLUSTER_ICONS: Record<string, string> = {
  geographic_cluster: '\uD83D\uDDFA\uFE0F',
  temporal_burst: '\u26A1',
  category_trend: '\uD83D\uDCC8',
  milestone: '\u2B50',
}

export function ClusteringCard(props: ClusteringCardProps) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var categoryLabel = config ? config.label : item.category
  var categoryIcon = config ? config.icon : '\uD83D\uDD2E'
  var typeIcon = CLUSTER_ICONS[item.cluster_type] || '\uD83D\uDCC8'

  return (
    <div className="h-screen w-full relative overflow-hidden bg-gray-950">
      {/* Purple gradient background */}
      <div className="absolute inset-0 bg-gradient-to-br from-purple-950/60 via-gray-950 to-indigo-950/40" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_30%_40%,rgba(144,0,240,0.12),transparent_60%)]" />

      {/* Grid pattern overlay for data feel */}
      <div className="absolute inset-0 opacity-[0.03]" style={{
        backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }} />

      {/* Content */}
      <div className={
        'relative z-10 h-full flex flex-col justify-center items-center px-6 sm:px-10 text-center transition-all duration-700 ' +
        (props.isActive ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
      }>
        {/* Badge */}
        <div className="flex items-center gap-2 mb-6">
          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 border border-purple-500/30 rounded-full">
            <TrendingUp className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-xs font-semibold text-purple-300">Trending Pattern</span>
          </div>
        </div>

        {/* Type icon */}
        <span className="text-5xl mb-4">{typeIcon}</span>

        {/* Headline */}
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 max-w-md leading-tight">
          {item.headline}
        </h2>

        {/* Subheadline */}
        <p className="text-gray-300 text-sm sm:text-base mb-6 max-w-sm leading-relaxed">
          {item.subheadline}
        </p>

        {/* Stats row */}
        <div className="flex items-center gap-4 text-xs text-gray-400 mb-8">
          <div className="flex items-center gap-1.5">
            <span>{categoryIcon}</span>
            <span>{categoryLabel}</span>
          </div>
          {item.location_summary && (
            <div className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              <span>{item.location_summary}</span>
            </div>
          )}
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{item.time_range}</span>
          </div>
        </div>

        {/* Report count callout */}
        <div className="bg-white/5 border border-white/10 rounded-xl px-6 py-4 mb-8">
          <span className="text-3xl font-bold text-purple-400">{item.report_count}</span>
          <span className="text-sm text-gray-400 ml-2">reports in this cluster</span>
        </div>

        {/* CTA */}
        <Link
          href={'/explore?category=' + encodeURIComponent(item.category)}
          className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-full font-medium transition-colors text-sm"
        >
          <span>View Reports</span>
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  )
}
