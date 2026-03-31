'use client'

/**
 * DiscoverPreview — homepage carousel showcasing the Discover feed.
 *
 * Each "slide" = 1 large encyclopedia card + 2 small experiencer report cards.
 * Desktop: auto-rotates every 6s, pauses on hover/focus, crossfade transition.
 * Mobile: horizontal swipeable scroll (no auto-play — UX best practice).
 * Respects prefers-reduced-motion.
 *
 * SWC-compatible: var, function expressions, string concat.
 */

import React, { useEffect, useState, useRef, useCallback } from 'react'
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

/** A slide = 1 phenomenon + 2 reports */
interface Slide {
  phenomenon: PreviewPhenomenon
  reports: PreviewReport[]
}

// =========================================================================
//  Category colors (matches DiscoverCards.tsx)
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

var ROTATE_INTERVAL = 6000

// =========================================================================
//  Encyclopedia card (large)
// =========================================================================

function EncyclopediaCard(props: { item: PreviewPhenomenon }) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'

  var hookText = item.feed_hook || item.ai_summary || ''
  var href = '/phenomena/' + item.slug

  var badgeParts: string[] = []
  badgeParts.push(config?.label || item.category)
  if (item.primary_regions && item.primary_regions.length > 0) {
    badgeParts.push(item.primary_regions[0])
  }

  var signals: string[] = []
  var qf = item.ai_quick_facts
  if (qf && qf.evidence_types) signals.push(qf.evidence_types)
  if (item.report_count > 5) signals.push(item.report_count + ' reports')

  return (
    <Link href={href} className="block group">
      <div className="relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-6 sm:p-7 min-h-[220px] sm:min-h-[260px] flex flex-col transition-all duration-300 hover:border-white/15">
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at 20% 80%, ' + catColor + ', transparent 65%)' }} />

        <div className="relative z-10 flex flex-col h-full">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] font-semibold uppercase tracking-widest font-sans" style={{ color: catColor }}>
              {(config?.icon || '') + ' ' + badgeParts.join(' \u00B7 ')}
            </span>
            {item.report_count > 20 && (
              <span className="text-[9px] bg-primary-500/15 text-primary-400 px-2 py-0.5 rounded-full font-medium font-sans">
                trending
              </span>
            )}
          </div>

          {/* Hook */}
          <h3 className="text-lg sm:text-xl font-display font-bold text-white leading-snug mb-3 group-hover:text-primary-400 transition-colors line-clamp-4">
            {hookText || item.name}
          </h3>

          {/* Signals */}
          {signals.length > 0 && (
            <div className="flex gap-1.5 flex-wrap mb-3">
              {signals.map(function (s, i) {
                return (
                  <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 text-gray-400 font-sans font-medium">
                    {s}
                  </span>
                )
              })}
            </div>
          )}

          <div className="flex-grow" />

          {/* Bottom */}
          <div className="flex items-end justify-between pt-3 border-t border-white/5">
            <p className="text-xs text-gray-500 font-sans truncate flex-1 min-w-0 mr-3">{item.name}</p>
            <span className="text-[10px] font-medium text-primary-400 group-hover:text-primary-300 font-sans flex-shrink-0 flex items-center gap-1">
              Read case
              <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// =========================================================================
//  Report card (small)
// =========================================================================

function ReportCard(props: { item: PreviewReport }) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'

  var hookText = item.feed_hook || item.summary || ''
  var href = '/report/' + item.slug

  var locParts: string[] = []
  if (item.city) locParts.push(item.city)
  if (item.state_province) locParts.push(item.state_province)
  if (item.country && locParts.length === 0) locParts.push(item.country)
  var location = locParts.join(', ')

  return (
    <Link href={href} className="block group">
      <div className="relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-5 h-full flex flex-col transition-all duration-300 hover:border-white/15">
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 70%, ' + catColor + ', transparent 60%)' }} />

        <div className="relative z-10 flex flex-col h-full">
          {/* Category */}
          <span className="text-[10px] font-semibold uppercase tracking-widest font-sans mb-2" style={{ color: catColor }}>
            {(config?.icon || '') + ' ' + (config?.label || item.category)}
          </span>

          {/* Hook */}
          <h3 className="text-sm sm:text-base font-display font-bold text-white leading-snug mb-2 group-hover:text-primary-400 transition-colors line-clamp-3">
            {hookText || item.title}
          </h3>

          {/* Location */}
          {location && (
            <p className="text-[11px] text-gray-500 font-sans">{location}</p>
          )}

          <div className="flex-grow" />

          {/* Bottom */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-3">
            <p className="text-[11px] text-gray-500 font-sans truncate flex-1 min-w-0 mr-2">{item.title}</p>
            <span className="text-[10px] font-medium text-primary-400 group-hover:text-primary-300 font-sans flex-shrink-0">
              {'Read report \u2192'}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

// =========================================================================
//  Build slides from fetched data
// =========================================================================

function buildSlides(phenomena: PreviewPhenomenon[], reports: PreviewReport[]): Slide[] {
  /* Score phenomena */
  var scoredPhen = phenomena.map(function (p) {
    var score = 0
    if (p.feed_hook) score += 10
    if (p.ai_summary) score += 3
    if (p.report_count > 10) score += 3
    if (p.report_count > 50) score += 2
    if (p.primary_regions && p.primary_regions.length > 0) score += 1
    return { item: p, score: score }
  })
  scoredPhen.sort(function (a, b) { return b.score - a.score })

  /* Score reports */
  var scoredRep = reports.map(function (r) {
    var score = 0
    if (r.feed_hook) score += 10
    if (r.summary && r.summary.length > 100) score += 3
    if (r.has_photo_video) score += 2
    if (r.has_physical_evidence) score += 2
    if (r.credibility === 'high') score += 2
    if (r.location_name || r.city) score += 1
    return { item: r, score: score }
  })
  scoredRep.sort(function (a, b) { return b.score - a.score })

  /* Build slides: pair each phenomenon with 2 reports, ensure category diversity */
  var slides: Slide[] = []
  var usedReportIds: Record<string, boolean> = {}
  var repIdx = 0

  for (var pi = 0; pi < scoredPhen.length && slides.length < 5; pi++) {
    var phen = scoredPhen[pi].item
    var slideReports: PreviewReport[] = []

    /* Find 2 reports preferring different categories from the phenomenon */
    for (var ri = repIdx; ri < scoredRep.length && slideReports.length < 2; ri++) {
      var rep = scoredRep[ri].item
      if (usedReportIds[rep.id]) continue
      /* Prefer different category from phenomenon for diversity */
      if (slideReports.length === 0 || rep.category !== phen.category) {
        slideReports.push(rep)
        usedReportIds[rep.id] = true
      }
    }

    /* Backfill if we didn't get 2 diverse reports */
    for (var bi = 0; bi < scoredRep.length && slideReports.length < 2; bi++) {
      if (!usedReportIds[scoredRep[bi].item.id]) {
        slideReports.push(scoredRep[bi].item)
        usedReportIds[scoredRep[bi].item.id] = true
      }
    }

    if (slideReports.length >= 2) {
      slides.push({ phenomenon: phen, reports: slideReports })
    }
  }

  return slides
}

// =========================================================================
//  Main component
// =========================================================================

export default function DiscoverPreview() {
  var [slides, setSlides] = useState<Slide[]>([])
  var [activeIdx, setActiveIdx] = useState(0)
  var [loading, setLoading] = useState(true)
  var [hovered, setHovered] = useState(false)
  var timerRef = useRef<ReturnType<typeof setInterval> | null>(null)

  /* Fetch data */
  useEffect(function () {
    async function fetchData() {
      try {
        var phenResult = await supabase
          .from('phenomena')
          .select('id, name, slug, category, feed_hook, ai_summary, ai_quick_facts, report_count, primary_regions, first_reported_date')
          .eq('status', 'active')
          .not('feed_hook', 'is', null)
          .order('report_count', { ascending: false })
          .limit(20)

        var phenPool = (phenResult.data || []).map(function (p: any) {
          return Object.assign({}, p, { item_type: 'phenomenon' as const })
        })

        var repResult = await supabase
          .from('reports')
          .select('id, title, slug, category, feed_hook, summary, credibility, has_photo_video, has_physical_evidence, event_date, location_name, city, state_province, country')
          .eq('status', 'approved')
          .not('feed_hook', 'is', null)
          .order('view_count', { ascending: false })
          .limit(20)

        var repPool = (repResult.data || []).map(function (r: any) {
          return Object.assign({}, r, { item_type: 'report' as const })
        })

        setSlides(buildSlides(phenPool, repPool))
      } catch (e) {
        /* non-critical */
      }
      setLoading(false)
    }
    fetchData()
  }, [])

  /* Auto-rotate on desktop (only when not hovered) */
  var advance = useCallback(function () {
    setActiveIdx(function (prev) {
      return slides.length > 0 ? (prev + 1) % slides.length : 0
    })
  }, [slides.length])

  useEffect(function () {
    /* Check prefers-reduced-motion */
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    /* Only auto-rotate on md+ (desktop/tablet) */
    if (typeof window !== 'undefined' && window.innerWidth < 768) return

    if (!hovered && slides.length > 1) {
      timerRef.current = setInterval(advance, ROTATE_INTERVAL)
    }

    return function () {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [hovered, slides.length, advance])

  var currentSlide = slides[activeIdx] || null

  return (
    <section className="py-10 md:py-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between mb-8">
          <div>
            <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-2">Eyewitness accounts</h2>
            <p className="text-sm sm:text-base text-gray-400 max-w-2xl">
              Real reports and encyclopedia entries from our case files.
            </p>
          </div>

          {/* Desktop: progress dots */}
          {slides.length > 1 && (
            <div className="hidden md:flex items-center gap-1.5">
              {slides.map(function (_s, i) {
                return (
                  <button
                    key={i}
                    onClick={function () { setActiveIdx(i) }}
                    className={'w-1.5 h-1.5 rounded-full transition-all duration-300 cursor-pointer' + (i === activeIdx ? ' bg-primary-400 w-4' : ' bg-gray-700 hover:bg-gray-500')}
                    aria-label={'Go to slide ' + (i + 1)}
                  />
                )
              })}
            </div>
          )}
        </div>

        {/* ── Desktop: crossfade carousel ── */}
        <div
          className="hidden md:block"
          onMouseEnter={function () { setHovered(true) }}
          onMouseLeave={function () { setHovered(false) }}
          onFocus={function () { setHovered(true) }}
          onBlur={function () { setHovered(false) }}
        >
          {loading ? (
            <div className="grid grid-cols-4 gap-4">
              <div className="col-span-2 h-64 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02]" />
              <div className="h-64 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02]" />
              <div className="h-64 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02]" />
            </div>
          ) : currentSlide ? (
            <div
              key={activeIdx}
              className="grid grid-cols-4 gap-4 animate-fade-in"
            >
              <div className="col-span-2">
                <EncyclopediaCard item={currentSlide.phenomenon} />
              </div>
              {currentSlide.reports.map(function (r) {
                return <ReportCard key={r.id} item={r} />
              })}
            </div>
          ) : null}
        </div>

        {/* ── Mobile: horizontal scroll ── */}
        <div className="md:hidden">
          {loading ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 scrollbar-hide">
              {[0, 1, 2].map(function (i) {
                return (
                  <div key={i} className={'flex-shrink-0 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02]' + (i === 0 ? ' w-[85vw] h-56' : ' w-[70vw] h-48')} />
                )
              })}
            </div>
          ) : slides.length > 0 ? (
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 snap-x snap-mandatory scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch' }}>
              {slides.map(function (slide, si) {
                return (
                  <React.Fragment key={si}>
                    <div className="flex-shrink-0 w-[85vw] snap-start">
                      <EncyclopediaCard item={slide.phenomenon} />
                    </div>
                    {slide.reports.map(function (r) {
                      return (
                        <div key={r.id} className="flex-shrink-0 w-[70vw] snap-start">
                          <ReportCard item={r} />
                        </div>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </div>
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
