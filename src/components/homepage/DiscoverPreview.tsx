'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { MapPin, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface PreviewReport {
  id: string
  title: string
  slug: string
  summary: string | null
  feed_hook: string | null
  category: string
  location_name: string | null
  event_date: string | null
  credibility: string | null
}

/* ── Hook copy extraction ─────────────────────────────── */

function extractHook(report: PreviewReport): string {
  /* Prefer AI-generated feed_hook when available */
  if (report.feed_hook) return report.feed_hook

  if (!report.summary) return report.title

  /* Split into sentences and score for vividness */
  var sentences = report.summary
    .split(/(?<=[.!?])\s+/)
    .filter(function(s) { return s.length > 20 })

  if (sentences.length === 0) return report.title

  /* Score each sentence — reward sensory/vivid language, penalize generic openings */
  var vivid = ['saw', 'heard', 'felt', 'appeared', 'vanished', 'hovered', 'glowing',
    'screamed', 'witness', 'silhouette', 'shadow', 'light', 'sound', 'moved',
    'terrified', 'strange', 'unexplained', 'suddenly', 'impossible', 'enormous']
  var generic = ['i think', 'i believe', 'so i', 'here are', 'this is', 'i was wondering',
    'i have a', 'i want to', 'does anyone', 'has anyone']

  var best = 0
  var bestScore = -1
  for (var i = 0; i < sentences.length && i < 5; i++) {
    var lower = sentences[i].toLowerCase()
    var score = 0
    for (var v = 0; v < vivid.length; v++) {
      if (lower.indexOf(vivid[v]) !== -1) score = score + 2
    }
    for (var g = 0; g < generic.length; g++) {
      if (lower.indexOf(generic[g]) !== -1) score = score - 3
    }
    /* Slight preference for sentences 2-3 (often more vivid than the opener) */
    if (i === 1 || i === 2) score = score + 1
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }

  return sentences[best]
}

/* ── Category border color mapping ────────────────────── */

function getCategoryBorderColor(category: string): string {
  var map: Record<string, string> = {
    ufos_aliens: 'border-green-500',
    cryptids: 'border-amber-500',
    ghosts_hauntings: 'border-purple-500',
    psychic_phenomena: 'border-blue-500',
    consciousness_practices: 'border-indigo-500',
    psychological_experiences: 'border-pink-500',
    biological_factors: 'border-emerald-500',
    perception_sensory: 'border-cyan-500',
    religion_mythology: 'border-yellow-500',
    esoteric_practices: 'border-violet-500',
    combination: 'border-gray-500'
  }
  return map[category] || 'border-primary-500'
}

function getCategoryGlowColor(category: string): string {
  var map: Record<string, string> = {
    ufos_aliens: 'hover:shadow-green-500/10',
    cryptids: 'hover:shadow-amber-500/10',
    ghosts_hauntings: 'hover:shadow-purple-500/10',
    psychic_phenomena: 'hover:shadow-blue-500/10',
    consciousness_practices: 'hover:shadow-indigo-500/10',
    psychological_experiences: 'hover:shadow-pink-500/10',
    biological_factors: 'hover:shadow-emerald-500/10',
    perception_sensory: 'hover:shadow-cyan-500/10',
    religion_mythology: 'hover:shadow-yellow-500/10',
    esoteric_practices: 'hover:shadow-violet-500/10',
    combination: 'hover:shadow-gray-500/10'
  }
  return map[category] || 'hover:shadow-primary-500/10'
}

/* ── Format A: Featured Card (large, dramatic) ────────── */

function FeaturedCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var hook = extractHook(report)
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)

  var dateLabel = report.event_date
    ? new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  return (
    <Link href={'/report/' + report.slug} className="block group sm:col-span-2">
      <div className={classNames(
        'relative p-6 sm:p-8 rounded-xl h-full',
        'border border-white/10 border-l-4', borderColor,
        'bg-gradient-to-br from-white/[0.05] to-white/[0.02]',
        'hover:border-white/20 hover:bg-white/[0.07] transition-all duration-300',
        'hover:shadow-lg', glowColor,
        'min-h-[220px] sm:min-h-[260px] flex flex-col justify-between'
      )}>
        <div>
          <div className="flex items-center gap-2 mb-4">
            <span className="text-lg">{config.icon}</span>
            <span className={classNames('text-xs font-medium px-2 py-0.5 rounded-full', config.bgColor, config.color)}>
              {config.label}
            </span>
            {dateLabel && (
              <span className="text-xs text-gray-600 ml-auto">{dateLabel}</span>
            )}
          </div>

          <h3 className="text-lg sm:text-xl font-semibold text-white mb-3 group-hover:text-primary-400 transition-colors leading-snug">
            {report.title}
          </h3>

          <p className="text-sm sm:text-base text-gray-400 leading-relaxed line-clamp-3">
            {hook}
          </p>
        </div>

        <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5">
          {report.location_name ? (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              <span>{report.location_name}</span>
            </div>
          ) : <div />}
          <span className="text-xs font-medium text-primary-400 group-hover:text-primary-300 transition-colors flex items-center gap-1">
            Read report
            <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
          </span>
        </div>
      </div>
    </Link>
  )
}

/* ── Format B: Pull-Quote Card (text-forward, dramatic) ─ */

function PullQuoteCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var hook = extractHook(report)
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)

  return (
    <Link href={'/report/' + report.slug} className="block group">
      <div className={classNames(
        'p-5 sm:p-6 rounded-xl h-full flex flex-col',
        'border border-white/10 border-l-4', borderColor,
        'bg-gradient-to-br from-white/[0.04] to-transparent',
        'hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300',
        'hover:shadow-lg', glowColor
      )}>
        {/* Large quote-style hook */}
        <div className="flex-grow">
          <span className="text-2xl text-gray-600 font-serif leading-none block mb-2">{'\u201C'}</span>
          <p className="text-sm sm:text-base text-gray-300 leading-relaxed line-clamp-4 italic">
            {hook}
          </p>
        </div>

        {/* Title + meta at bottom */}
        <div className="mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm">{config.icon}</span>
            <span className={classNames('text-[10px] font-medium px-1.5 py-0.5 rounded-full', config.bgColor, config.color)}>
              {config.label}
            </span>
          </div>
          <h3 className="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors leading-snug line-clamp-2">
            {report.title}
          </h3>
        </div>
      </div>
    </Link>
  )
}

/* ── Format C: Compact Card (clean, metadata-rich) ────── */

function CompactCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)

  var dateLabel = report.event_date
    ? new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  return (
    <Link href={'/report/' + report.slug} className="block group">
      <div className={classNames(
        'p-5 rounded-xl h-full flex flex-col',
        'border border-white/10 border-l-4', borderColor,
        'bg-gradient-to-br from-white/[0.03] to-transparent',
        'hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300',
        'hover:shadow-lg', glowColor
      )}>
        <div className="flex items-center gap-2 mb-3">
          <span className="text-lg">{config.icon}</span>
          <span className={classNames('text-xs font-medium px-2 py-0.5 rounded-full', config.bgColor, config.color)}>
            {config.label}
          </span>
          {dateLabel && (
            <span className="text-xs text-gray-600 ml-auto">{dateLabel}</span>
          )}
        </div>

        <h3 className="text-base font-semibold text-white mb-2 group-hover:text-primary-400 transition-colors leading-snug line-clamp-2">
          {report.title}
        </h3>

        {report.location_name && (
          <div className="flex items-center gap-1.5 text-xs text-gray-500 mt-auto pt-2">
            <MapPin className="w-3 h-3" />
            <span>{report.location_name}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

/* ── Smart card format assignment ─────────────────────── */

function assignFormats(reports: PreviewReport[]): Array<{ report: PreviewReport; format: string }> {
  if (reports.length === 0) return []

  var assigned: Array<{ report: PreviewReport; format: string }> = []

  /* Card 1: Featured (largest, most dramatic) — pick the one with the best summary */
  var scoredReports = reports.map(function(r, idx) {
    var score = 0
    if (r.summary && r.summary.length > 100) score = score + 3
    if (r.location_name) score = score + 2
    if (r.event_date) score = score + 1
    if (r.credibility === 'high' || r.credibility === 'verified') score = score + 2
    return { report: r, score: score, index: idx }
  })

  scoredReports.sort(function(a, b) { return b.score - a.score })

  /* First card: Featured */
  assigned.push({ report: scoredReports[0].report, format: 'featured' })

  /* Second card: Pull-Quote (pick one with vivid summary) */
  if (scoredReports.length > 1) {
    assigned.push({ report: scoredReports[1].report, format: 'pullquote' })
  }

  /* Remaining: Compact */
  for (var i = 2; i < scoredReports.length && i < 4; i++) {
    assigned.push({ report: scoredReports[i].report, format: 'compact' })
  }

  return assigned
}

/* ── Smart report selection from fetched pool ─────────── */

function selectBestReports(pool: PreviewReport[]): PreviewReport[] {
  if (pool.length <= 4) return pool

  var selected: PreviewReport[] = []
  var usedCategories: Record<string, boolean> = {}

  /* Score all reports */
  var scored = pool.map(function(r) {
    var score = 0
    if (r.summary && r.summary.length > 100) score = score + 3
    if (r.summary && r.summary.length > 200) score = score + 2
    if (r.location_name) score = score + 2
    if (r.event_date) score = score + 1
    if (r.feed_hook) score = score + 4
    return { report: r, score: score }
  })

  scored.sort(function(a, b) { return b.score - a.score })

  /* First pass: pick top-scoring with category diversity */
  for (var i = 0; i < scored.length && selected.length < 4; i++) {
    var cat = scored[i].report.category
    if (!usedCategories[cat] || selected.length >= 3) {
      selected.push(scored[i].report)
      usedCategories[cat] = true
    }
  }

  /* Backfill if we still need more */
  if (selected.length < 4) {
    for (var j = 0; j < scored.length && selected.length < 4; j++) {
      var alreadySelected = false
      for (var k = 0; k < selected.length; k++) {
        if (selected[k].id === scored[j].report.id) { alreadySelected = true; break }
      }
      if (!alreadySelected) selected.push(scored[j].report)
    }
  }

  return selected
}

/* ── Main component ───────────────────────────────────── */

export default function DiscoverPreview() {
  var [cards, setCards] = useState<Array<{ report: PreviewReport; format: string }>>([])
  var [loading, setLoading] = useState(true)

  useEffect(function() {
    async function fetchReports() {
      try {
        /* Try with feed_hook first; fall back without it if column doesn't exist yet */
        var result = await supabase
          .from('reports')
          .select('id, title, slug, summary, feed_hook, category, location_name, event_date, credibility')
          .eq('status', 'approved')
          .not('summary', 'is', null)
          .order('created_at', { ascending: false })
          .limit(10)

        if (result.error) {
          /* feed_hook column may not exist yet — retry without it */
          result = await supabase
            .from('reports')
            .select('id, title, slug, summary, category, location_name, event_date, credibility')
            .eq('status', 'approved')
            .not('summary', 'is', null)
            .order('created_at', { ascending: false })
            .limit(10)
        }

        var pool = (result.data as PreviewReport[]) || []
        var best = selectBestReports(pool)
        setCards(assignFormats(best))
      } catch (e) {
        /* non-critical — homepage still works without this section */
      }
      setLoading(false)
    }
    fetchReports()
  }, [])

  return (
    <section className="py-10 md:py-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-2">Stories from the unknown</h2>
        <p className="text-sm sm:text-base text-gray-400 mb-8 max-w-2xl">Millions of reports from real people worldwide.</p>

        {/* Cards — asymmetric grid: featured spans 2 cols on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [0, 1, 2, 3].map(function(i) {
              return (
                <div
                  key={i}
                  className={classNames(
                    'rounded-xl border border-white/10 animate-pulse bg-white/[0.02]',
                    i === 0 ? 'h-56 sm:col-span-2' : 'h-44'
                  )}
                />
              )
            })
          ) : cards.length > 0 ? (
            cards.map(function(card) {
              if (card.format === 'featured') {
                return <FeaturedCard key={card.report.id} report={card.report} />
              }
              if (card.format === 'pullquote') {
                return <PullQuoteCard key={card.report.id} report={card.report} />
              }
              return <CompactCard key={card.report.id} report={card.report} />
            })
          ) : null}
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Link
            href="/discover"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary-500 hover:bg-primary-400 text-white font-semibold transition-colors"
          >
            Explore stories
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

      </div>
    </section>
  )
}
