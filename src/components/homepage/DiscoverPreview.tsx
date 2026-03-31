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
  phenomenon_type: { name: string; slug: string; category: string } | null
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

/** Category-tinted background gradients for card distinction */
var CATEGORY_GRADIENTS: Record<string, string> = {
  ufos_aliens: 'linear-gradient(135deg, rgba(79,195,247,0.06) 0%, rgba(79,195,247,0.02) 40%, transparent 70%)',
  cryptids: 'linear-gradient(135deg, rgba(165,214,167,0.06) 0%, rgba(165,214,167,0.02) 40%, transparent 70%)',
  ghosts_hauntings: 'linear-gradient(135deg, rgba(206,147,216,0.06) 0%, rgba(206,147,216,0.02) 40%, transparent 70%)',
  psychic_phenomena: 'linear-gradient(135deg, rgba(179,157,219,0.06) 0%, rgba(179,157,219,0.02) 40%, transparent 70%)',
  consciousness_practices: 'linear-gradient(135deg, rgba(255,183,77,0.06) 0%, rgba(255,183,77,0.02) 40%, transparent 70%)',
  psychological_experiences: 'linear-gradient(135deg, rgba(128,222,234,0.06) 0%, rgba(128,222,234,0.02) 40%, transparent 70%)',
  biological_factors: 'linear-gradient(135deg, rgba(239,154,154,0.06) 0%, rgba(239,154,154,0.02) 40%, transparent 70%)',
  perception_sensory: 'linear-gradient(135deg, rgba(255,204,128,0.06) 0%, rgba(255,204,128,0.02) 40%, transparent 70%)',
  religion_mythology: 'linear-gradient(135deg, rgba(255,241,118,0.06) 0%, rgba(255,241,118,0.02) 40%, transparent 70%)',
  esoteric_practices: 'linear-gradient(135deg, rgba(244,143,177,0.06) 0%, rgba(244,143,177,0.02) 40%, transparent 70%)',
  combination: 'linear-gradient(135deg, rgba(128,203,196,0.06) 0%, rgba(128,203,196,0.02) 40%, transparent 70%)',
}

var CARD_HEIGHT = 'h-[280px] sm:h-[300px]'
var ROTATE_INTERVAL = 6000

// =========================================================================
//  Encyclopedia card (large)
// =========================================================================

function EncyclopediaCard(props: { item: PreviewPhenomenon }) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var catColor = CATEGORY_COLORS[item.category] || '#b39ddb'
  var gradient = CATEGORY_GRADIENTS[item.category] || CATEGORY_GRADIENTS.combination

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
      <div className={'relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-6 sm:p-7 flex flex-col transition-all duration-300 hover:border-white/15 ' + CARD_HEIGHT}>
        {/* Category-tinted background */}
        <div className="absolute inset-0" style={{ background: gradient }} />
        <div className="absolute inset-0 opacity-[0.04]" style={{ background: 'radial-gradient(ellipse at 20% 80%, ' + catColor + ', transparent 65%)' }} />
        {/* Subtle left accent border */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ background: catColor, opacity: 0.4 }} />

        <div className="relative z-10 flex flex-col h-full overflow-hidden">
          {/* Badge */}
          <div className="flex items-center gap-2 mb-3 flex-shrink-0">
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
          <div className="flex-1 min-h-0 overflow-hidden mb-3">
            <h3 className="text-base sm:text-lg font-display font-bold text-white leading-snug group-hover:text-primary-400 transition-colors">
              {hookText || item.name}
            </h3>
          </div>

          {/* Bottom — topic name + report count (always visible) */}
          <div className="flex-shrink-0 pt-3 border-t border-white/5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-display font-bold truncate flex-1 min-w-0 mr-3" style={{ color: catColor }}>
                {item.name}
              </span>
              <span className="text-[10px] font-medium text-primary-400 group-hover:text-primary-300 font-sans flex-shrink-0 flex items-center gap-1">
                Read case
                <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
              </span>
            </div>
            {signals.length > 0 && (
              <div className="flex gap-1.5 flex-wrap mt-2">
                {signals.map(function (s, i) {
                  return (
                    <span key={i} className="text-[10px] px-2.5 py-0.5 rounded-full border border-white/10 text-gray-400 font-sans font-medium">
                      {s}
                    </span>
                  )
                })}
              </div>
            )}
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
  var gradient = CATEGORY_GRADIENTS[item.category] || CATEGORY_GRADIENTS.combination

  var hookText = item.feed_hook || item.summary || ''
  var href = '/report/' + item.slug

  /* Topic name: prefer the linked phenomenon name (e.g. "Bigfoot", "Black Triangle").
     Fallback: extract the core subject from the title by stripping location
     suffixes and common phrases like "Caught on Camera", "Sighting in", etc. */
  var topicName = ''
  if (item.phenomenon_type && item.phenomenon_type.name) {
    topicName = item.phenomenon_type.name
  } else {
    /* Step 1: take text before first dash/em-dash (strips " - Location" and " - Report #XXXXX") */
    var raw = item.title.split(/\s*[-\u2014]\s*/)[0] || item.title
    /* Step 2: strip common trailing phrases to get just the subject */
    raw = raw
      .replace(/\s+Caught on Camera.*$/i, '')
      .replace(/\s+Sighting in.*$/i, '')
      .replace(/\s+Spotted (in|near|at).*$/i, '')
      .replace(/\s+Encounter (in|near|at).*$/i, '')
      .replace(/\s+Report.*$/i, '')
      .replace(/\s+Experience.*$/i, '')
      .replace(/\s+after\s+.*/i, '')
      .trim()
    topicName = raw.length > 28 ? raw.substring(0, 26) + '\u2026' : raw
  }

  return (
    <Link href={href} className="block group">
      <div className={'relative rounded-xl border border-white/[0.08] overflow-hidden bg-gray-950 p-5 flex flex-col transition-all duration-300 hover:border-white/15 ' + CARD_HEIGHT}>
        {/* Category-tinted background */}
        <div className="absolute inset-0" style={{ background: gradient }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{ background: 'radial-gradient(ellipse at 30% 70%, ' + catColor + ', transparent 60%)' }} />
        {/* Subtle left accent border */}
        <div className="absolute left-0 top-0 bottom-0 w-[3px] rounded-l-xl" style={{ background: catColor, opacity: 0.4 }} />

        <div className="relative z-10 flex flex-col h-full overflow-hidden">
          {/* Category */}
          <span className="text-[10px] font-semibold uppercase tracking-widest font-sans mb-2 flex-shrink-0" style={{ color: catColor }}>
            {(config?.icon || '') + ' ' + (config?.label || item.category)}
          </span>

          {/* Hook — flex-1 with fade mask so it never pushes bottom out */}
          <div className="flex-1 min-h-0 overflow-hidden relative mb-2">
            <h3 className="text-sm sm:text-base font-display font-bold text-white leading-snug group-hover:text-primary-400 transition-colors">
              {hookText || item.title}
            </h3>
            {/* No visible fade — clean clip via overflow-hidden on parent */}
          </div>

          {/* Bottom — topic name in category color (always visible) */}
          <div className="flex items-center justify-between pt-2 border-t border-white/5 flex-shrink-0">
            <span className="text-sm font-display font-bold truncate flex-1 min-w-0 mr-2" style={{ color: catColor }}>
              {topicName}
            </span>
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

/** Fisher-Yates shuffle (in-place, returns same array) */
function shuffle<T>(arr: T[]): T[] {
  for (var i = arr.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var tmp = arr[i]
    arr[i] = arr[j]
    arr[j] = tmp
  }
  return arr
}

function buildSlides(phenomena: PreviewPhenomenon[], reports: PreviewReport[]): Slide[] {
  /* Shuffle both pools so each page load produces different combinations.
     All items already passed a quality gate (feed_hook required), so any
     random selection is good enough for the homepage preview. */
  var shuffledPhen = shuffle(phenomena.slice())
  var shuffledRep = shuffle(reports.slice())

  /* Build slides: pair each phenomenon with 2 reports, prefer category diversity */
  var slides: Slide[] = []
  var usedReportIds: Record<string, boolean> = {}

  for (var pi = 0; pi < shuffledPhen.length && slides.length < 5; pi++) {
    var phen = shuffledPhen[pi]
    var slideReports: PreviewReport[] = []

    for (var ri = 0; ri < shuffledRep.length && slideReports.length < 2; ri++) {
      var rep = shuffledRep[ri]
      if (usedReportIds[rep.id]) continue
      if (slideReports.length === 0 || rep.category !== phen.category) {
        slideReports.push(rep)
        usedReportIds[rep.id] = true
      }
    }

    /* Backfill if diversity constraint was too strict */
    for (var bi = 0; bi < shuffledRep.length && slideReports.length < 2; bi++) {
      if (!usedReportIds[shuffledRep[bi].id]) {
        slideReports.push(shuffledRep[bi])
        usedReportIds[shuffledRep[bi].id] = true
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

  /* Fetch data via feed-v2 API (uses service role key, bypasses RLS) */
  useEffect(function () {
    async function fetchData() {
      try {
        /* Random seed + random offset into the feed for variety on each page load */
        var seed = Math.floor(Math.random() * 2147483647)
        var randomOffset = Math.floor(Math.random() * 60)
        var res = await fetch('/api/discover/feed-v2?limit=30&offset=' + randomOffset + '&seed=' + seed)
        if (!res.ok) throw new Error('Feed fetch failed')
        var data = await res.json()
        var feedItems = data.items || []

        /* Separate phenomena and reports from the feed */
        var phenPool: PreviewPhenomenon[] = []
        var repPool: PreviewReport[] = []

        feedItems.forEach(function (item: any) {
          /* Homepage only shows items with hooks for quality */
          if (!item.feed_hook) return

          if (item.item_type === 'phenomenon' && phenPool.length < 15) {
            phenPool.push({
              item_type: 'phenomenon',
              id: item.id,
              name: item.name || '',
              slug: item.slug || item.id,
              category: item.category || 'combination',
              feed_hook: item.feed_hook || null,
              ai_summary: item.ai_summary || null,
              ai_quick_facts: item.ai_quick_facts || null,
              report_count: item.report_count || 0,
              primary_regions: item.primary_regions || null,
              first_reported_date: item.first_reported_date || null,
            })
          } else if (item.item_type === 'report' && repPool.length < 15) {
            repPool.push({
              item_type: 'report',
              id: item.id,
              title: item.title || '',
              slug: item.slug || item.id,
              category: item.category || 'combination',
              feed_hook: item.feed_hook || null,
              summary: item.summary || null,
              credibility: item.credibility || null,
              has_photo_video: !!item.has_photo_video,
              has_physical_evidence: !!item.has_physical_evidence,
              event_date: item.event_date || null,
              location_name: item.location_name || null,
              city: item.city || null,
              state_province: item.state_province || null,
              country: item.country || null,
              phenomenon_type: item.phenomenon_type || null,
            })
          }
        })

        setSlides(buildSlides(phenPool, repPool))
      } catch (e) {
        console.error('[DiscoverPreview] fetch error:', e)
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
    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
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
              <div className={'col-span-2 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02] ' + CARD_HEIGHT} />
              <div className={'rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02] ' + CARD_HEIGHT} />
              <div className={'rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02] ' + CARD_HEIGHT} />
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
                  <div key={i} className={'flex-shrink-0 rounded-xl border border-white/[0.06] animate-pulse bg-white/[0.02] h-[280px]' + (i === 0 ? ' w-[85vw]' : ' w-[70vw]')} />
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
