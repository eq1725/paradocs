'use client'

/**
 * DiscoverPreview — homepage section showcasing the Discover feed.
 *
 * Mirrors the Discover card aesthetic: typography-first, hook-driven,
 * category accent colors. Fetches a mix of phenomena (encyclopedia)
 * and reports to represent the full feed experience.
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'

// =========================================================================
//  Types
// =========================================================================

interface PreviewPhenomenon {
  item_type: 'phenomenon'
  id: string
  name: string
  slug: string
  category: string
  feed_hook: string | null
  ai_summary: string | null
  ai_quick_facts: any
  report_count: number
  primary_regions: string[] | null
  first_reported_date: string | null
}

interface PreviewReport {
  item_type: 'report'
  id: string
  title: string
  slug: string
  category: string
  feed_hook: string | null
  summary: string | null
  credibility: string | null
  has_photo_video: boolean
  has_physical_evidence: boolean
  event_date: string | null
  location_name: string | null
  city: string | null
  state_province: string | null
  country: string | null
}

type PreviewItem = PreviewPhenomenon | PreviewReport

// =========================================================================
//  Category color map (matches DiscoverCards.tsx)
// =========================================================================

var CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#4fc3f7',
  cryptids: '#a5d6a7',
  ghosts_hauntings: '#ce93d8',
  psychic_phenomena: '#b39ddb',
  consciousness_practices: '#ffb74d',
  psychological_experiences: '#80deea',
  biological_factors: '#ef9a9a',
  perception_sensory: '#ffcc80',
  religion_mythology: '#fff176',
  esoteric_practices: '#f48fb1',
  combination: '#80cbc4',
}

// =========================================================================
//  Featured card (large, spans 2 cols on desktop)
// =========================================================================

function FeaturedCard(props: { item: PreviewItem }) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var isPhen = item.item_type === 'phenomenon'
  var phen = item as PreviewPhenomenon
  var report = item as PreviewReport

  var hookText = item.feed_hook || (isPhen ? phen.ai_summary : report.summary) || ''
  var title = isPhen ? phen.name : report.title
  var href = isPhen ? '/phenomena/' + phen.slug : '/report/' + report.slug

  // Badge parts
  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (isPhen && phen.primary_regions && phen.primary_regions.length > 0) {
    badgeParts.push(phen.primary_regions[0])
  }
  if (!isPhen && report.country) {
    var loc = report.city || report.state_province || report.country
    badgeParts.push(loc)
  }

  // Credibility signals
  var signals: string[] = []
  if (isPhen) {
    var qf = phen.ai_quick_facts
    if (qf && qf.evidence_types) signals.push(qf.evidence_types)
    if (phen.report_count > 5) signals.push(phen.report_count + ' reports')
  } else {
    if (report.credibility === 'high') signals.push('High credibility')
    if (report.has_photo_video) signals.push('Photo/Video')
    if (report.has_physical_evidence) signals.push('Physical evidence')
  }

  return (
    <Link href={href} className="block group sm:col-span-2">
      <div className="relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-6 sm:p-8 min-h-[240px] sm:min-h-[280px] flex flex-col transition-all duration-300 hover:border-white/15">
        {/* Subtle category glow */}
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at 20% 80%, ' + catColor + ', transparent 65%)' }} />

        <div className="relative z-10 flex flex-col h-full">
          {/* Category badge */}
          <div className="flex items-center gap-2 mb-4">
            <span className="text-[10px] font-semibold uppercase tracking-widest font-sans" style={{ color: catColor }}>
              {(config?.icon || '') + ' ' + badgeParts.join(' \u00B7 ')}
            </span>
            {isPhen && phen.report_count > 20 && (
              <span className="text-[9px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium font-sans">
                trending
              </span>
            )}
          </div>

          {/* Hook text — the headline */}
          <h3 className="text-lg sm:text-xl md:text-2xl font-display font-bold text-white leading-snug mb-3 group-hover:text-primary-400 transition-colors">
            {hookText || title}
          </h3>

          {/* Credibility signals */}
          {signals.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-4">
              {signals.map(function (s, i) {
                return (
                  <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 text-gray-400 font-sans font-medium">
                    {s}
                  </span>
                )
              })}
            </div>
          )}

          {/* Spacer */}
          <div className="flex-grow" />

          {/* Bottom: title (if hook shown) + CTA */}
          <div className="flex items-end justify-between pt-4 border-t border-white/5">
            <div className="flex-1 min-w-0">
              {hookText && hookText !== title && (
                <p className="text-sm text-gray-400 font-sans truncate">{title}</p>
              )}
            </div>
            <span className="text-xs font-medium text-primary-400 group-hover:text-primary-300 transition-colors flex items-center gap-1 flex-shrink-0 ml-4 font-sans">
              {isPhen ? 'Read case' : 'Read report'}
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// =========================================================================
//  Standard card (single column)
// =========================================================================

function StandardCard(props: { item: PreviewItem }) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var isPhen = item.item_type === 'phenomenon'
  var phen = item as PreviewPhenomenon
  var report = item as PreviewReport

  var hookText = item.feed_hook || (isPhen ? phen.ai_summary : report.summary) || ''
  var title = isPhen ? phen.name : report.title
  var href = isPhen ? '/phenomena/' + phen.slug : '/report/' + report.slug

  var subtitle = ''
  if (isPhen) {
    subtitle = phen.primary_regions ? phen.primary_regions[0] || '' : ''
  } else {
    var parts: string[] = []
    if (report.city) parts.push(report.city)
    if (report.state_province) parts.push(report.state_province)
    if (report.country && parts.length === 0) parts.push(report.country)
    subtitle = parts.join(', ')
  }

  return (
    <Link href={href} className="block group">
      <div className="relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-5 sm:p-6 h-full flex flex-col transition-all duration-300 hover:border-white/15">
        {/* Subtle accent glow */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 70%, ' + catColor + ', transparent 60%)' }} />

        <div className="relative z-10 flex flex-col h-full">
          {/* Category */}
          <span className="text-[10px] font-semibold uppercase tracking-widest font-sans mb-3" style={{ color: catColor }}>
            {(config?.icon || '') + ' ' + (config?.label || item.category)}
          </span>

          {/* Hook text */}
          <h3 className="text-base sm:text-lg font-display font-bold text-white leading-snug mb-2 group-hover:text-primary-400 transition-colors line-clamp-3">
            {hookText || title}
          </h3>

          {/* Subtitle (location/title) */}
          {subtitle && (
            <p className="text-[11px] text-gray-500 font-sans mb-3">{subtitle}</p>
          )}

          {/* Spacer */}
          <div className="flex-grow" />

          {/* Bottom */}
          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            {hookText && hookText !== title ? (
              <p className="text-xs text-gray-500 font-sans truncate flex-1 min-w-0 mr-3">{title}</p>
            ) : (
              <div />
            )}
            <span className="text-[10px] font-medium text-primary-400 group-hover:text-primary-300 font-sans flex-shrink-0">
              {isPhen ? 'Read case \u2192' : 'Read report \u2192'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// =========================================================================
//  Data fetching + selection
// =========================================================================

function selectBestItems(phenomena: PreviewPhenomenon[], reports: PreviewReport[]): PreviewItem[] {
  /* Score phenomena by richness */
  var scoredPhen = phenomena.map(function (p) {
    var score = 0
    if (p.feed_hook) score = score + 10
    if (p.ai_summary) score = score + 3
    if (p.ai_quick_facts) score = score + 2
    if (p.report_count > 10) score = score + 3
    if (p.report_count > 50) score = score + 2
    if (p.primary_regions && p.primary_regions.length > 0) score = score + 1
    return { item: p as PreviewItem, score: score, cat: p.category }
  })

  /* Score reports by richness */
  var scoredRep = reports.map(function (r) {
    var score = 0
    if (r.feed_hook) score = score + 10
    if (r.summary && r.summary.length > 100) score = score + 3
    if (r.has_photo_video) score = score + 2
    if (r.has_physical_evidence) score = score + 2
    if (r.credibility === 'high') score = score + 2
    if (r.location_name || r.city) score = score + 1
    return { item: r as PreviewItem, score: score, cat: r.category }
  })

  /* Merge and sort */
  var all = scoredPhen.concat(scoredRep)
  all.sort(function (a, b) { return b.score - a.score })

  /* Pick 4 items with category diversity: at least 3 different categories */
  var selected: PreviewItem[] = []
  var usedCats: Record<string, number> = {}

  for (var i = 0; i < all.length && selected.length < 4; i++) {
    var catCount = usedCats[all[i].cat] || 0
    if (catCount < 2 || selected.length >= 3) {
      selected.push(all[i].item)
      usedCats[all[i].cat] = catCount + 1
    }
  }

  return selected
}

// =========================================================================
//  Main component
// =========================================================================

export default function DiscoverPreview() {
  var [items, setItems] = useState<PreviewItem[]>([])
  var [loading, setLoading] = useState(true)

  useEffect(function () {
    async function fetchData() {
      try {
        /* Fetch phenomena with feed hooks (highest quality) */
        var phenResult = await supabase
          .from('phenomena')
          .select('id, name, slug, category, feed_hook, ai_summary, ai_quick_facts, report_count, primary_regions, first_reported_date')
          .eq('status', 'active')
          .not('feed_hook', 'is', null)
          .order('report_count', { ascending: false })
          .limit(15)

        var phenPool = (phenResult.data || []).map(function (p: any) {
          return Object.assign({}, p, { item_type: 'phenomenon' as const })
        })

        /* Fetch reports with feed hooks */
        var repResult = await supabase
          .from('reports')
          .select('id, title, slug, category, feed_hook, summary, credibility, has_photo_video, has_physical_evidence, event_date, location_name, city, state_province, country')
          .eq('status', 'approved')
          .not('feed_hook', 'is', null)
          .order('view_count', { ascending: false })
          .limit(15)

        var repPool = (repResult.data || []).map(function (r: any) {
          return Object.assign({}, r, { item_type: 'report' as const })
        })

        var best = selectBestItems(phenPool, repPool)
        setItems(best)
      } catch (e) {
        /* non-critical — homepage still works without this section */
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  return (
    <section className="py-10 md:py-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="mb-8">
          <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-2">From the case files</h2>
          <p className="text-sm sm:text-base text-gray-400 max-w-2xl">
            Encyclopedia entries and eyewitness reports, scored and ranked from thousands of sources.
          </p>
        </div>

        {/* Cards — featured (2-col) + 2 standard cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [0, 1, 2, 3].map(function (i) {
              return (
                <div
                  key={i}
                  className={'rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02]' + (i === 0 ? ' h-64 sm:col-span-2' : ' h-48')}
                />
              )
            })
          ) : items.length > 0 ? (
            items.map(function (item, i) {
              if (i === 0) return <FeaturedCard key={item.id} item={item} />
              return <StandardCard key={item.id} item={item} />
            })
          ) : null}
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-white font-semibold transition-colors"
          >
            Discover more
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </section>
  )
}
