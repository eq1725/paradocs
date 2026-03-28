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

/** Words that signal vivid, sensory, compelling experiencer language */
var VIVID_WORDS = [
  /* Visual / sensory */
  'saw', 'seen', 'heard', 'felt', 'appeared', 'vanished', 'hovered', 'glowing',
  'screamed', 'witness', 'witnessed', 'silhouette', 'shadow', 'light', 'sound',
  'moved', 'terrified', 'strange', 'unexplained', 'suddenly', 'impossible',
  'enormous', 'hovering', 'floating', 'creature', 'figure', 'dark', 'bright',
  'massive', 'shape', 'triangle', 'orb', 'disc', 'sphere', 'beam', 'footprint',
  'scream', 'chills', 'paralyzed', 'frozen', 'watched', 'stared', 'flew', 'vanish',
  /* Experiencer language */
  'encounter', 'encountered', 'experienced', 'sighting', 'apparition', 'entity',
  'presence', 'materialized', 'disappeared', 'pulsing', 'vibrating', 'humming',
  'rushing', 'flash', 'bolt', 'streak', 'formation', 'craft', 'object',
  /* Emotional / atmospheric */
  'dread', 'terror', 'awe', 'speechless', 'shaking', 'trembling', 'shock',
  'disbelief', 'nightmare', 'eerie', 'unearthly', 'otherworldly', 'bizarre',
  'inexplicable', 'haunting', 'haunted', 'paranormal', 'supernatural'
]

/** Openings that signal generic, low-quality text */
var GENERIC_STARTS = [
  'i think', 'i believe', 'so i', 'here are', 'this is', 'i was wondering',
  'i have a', 'i want to', 'does anyone', 'has anyone', 'i just wanted',
  'i am not sure', 'i don\'t know', 'this happened', 'so basically',
  'well i', 'okay so', 'um so', 'basically i', 'i guess'
]

/** Filler phrases that signal rambling, unfocused writing */
var FILLER_PHRASES = [
  'here and there', 'this and that', 'and stuff', 'you know',
  'kind of', 'sort of', 'a lot of', 'all my life', 'my whole life',
  'long story short', 'to make a long', 'the thing is', 'i mean',
  'i just got', 'just got back', 'went to', 'i was at', 'i went to'
]

/** Dry/academic language that makes for boring hooks */
var DRY_ACADEMIC = [
  'presentation', 'explained that', 'discussed', 'described',
  'mentioned', 'stated that', 'noted that', 'according to',
  'presented by', 'during his', 'during her', 'during the',
  'in his book', 'in her book', 'in the book', 'published',
  'conference', 'symposium', 'lecture', 'seminar', 'documentary',
  'interview with', 'in an interview'
]

/** Minimum score a sentence needs to be considered a worthy hook.
 *  Below this, we fall back to a styled title treatment instead. */
var HOOK_QUALITY_THRESHOLD = 3

/** Score a single sentence for hook-worthiness. Exported for use in selection. */
function scoreSentence(sentence: string, index: number): number {
  var lower = sentence.toLowerCase()
  var score = 0

  /* Reward vivid/sensory language */
  for (var v = 0; v < VIVID_WORDS.length; v++) {
    if (lower.indexOf(VIVID_WORDS[v]) !== -1) score = score + 2
  }

  /* Penalize generic openings */
  for (var g = 0; g < GENERIC_STARTS.length; g++) {
    if (lower.indexOf(GENERIC_STARTS[g]) !== -1) score = score - 3
  }

  /* Penalize filler/rambling phrases */
  for (var f = 0; f < FILLER_PHRASES.length; f++) {
    if (lower.indexOf(FILLER_PHRASES[f]) !== -1) score = score - 2
  }

  /* Penalize dry/academic language that reads like a book report */
  for (var d = 0; d < DRY_ACADEMIC.length; d++) {
    if (lower.indexOf(DRY_ACADEMIC[d]) !== -1) score = score - 3
  }

  /* Slight preference for sentences 2-3 (often more vivid than the opener) */
  if (index === 1 || index === 2) score = score + 1

  /* Reward punchy sentences, penalize ramblers */
  if (sentence.length < 100) score = score + 2
  else if (sentence.length < 140) score = score + 1
  else if (sentence.length > 170) score = score - 1

  return score
}

/** Extract the best hook from a report.
 *  Returns { text, hasHook, score } so selection can use the score. */
function extractHook(report: PreviewReport): { text: string; hasHook: boolean; score: number } {
  /* Prefer AI-generated feed_hook — always the primary text */
  if (report.feed_hook) {
    var hookScore = scoreSentence(report.feed_hook, 0) + 10
    return { text: report.feed_hook, hasHook: true, score: hookScore }
  }

  if (!report.summary) return { text: report.title, hasHook: false, score: 0 }

  /* Split into sentences and score for vividness */
  var sentences = report.summary
    .split(/(?<=[.!?])\s+/)
    .filter(function(s) { return s.length > 20 && s.length < 200 })

  if (sentences.length === 0) return { text: report.title, hasHook: false, score: 0 }

  var best = 0
  var bestScore = -999
  for (var i = 0; i < sentences.length && i < 6; i++) {
    var score = scoreSentence(sentences[i], i)
    if (score > bestScore) {
      bestScore = score
      best = i
    }
  }

  /* If best sentence doesn't meet quality threshold, fall back to title */
  if (bestScore < HOOK_QUALITY_THRESHOLD) {
    return { text: report.title, hasHook: false, score: bestScore }
  }

  return { text: sentences[best], hasHook: true, score: bestScore }
}

/* ── Category color systems ──────────────────────────── */

var CATEGORY_BORDER_COLORS: Record<string, string> = {
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

var CATEGORY_GLOW_COLORS: Record<string, string> = {
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

/** Category-tinted background gradients (ported from Discover feed) */
var CATEGORY_CARD_GRADIENTS: Record<string, string> = {
  ufos_aliens: 'from-green-950/40 via-gray-950/30 to-transparent',
  cryptids: 'from-amber-950/40 via-gray-950/30 to-transparent',
  ghosts_hauntings: 'from-purple-950/40 via-gray-950/30 to-transparent',
  psychic_phenomena: 'from-blue-950/40 via-gray-950/30 to-transparent',
  consciousness_practices: 'from-indigo-950/40 via-gray-950/30 to-transparent',
  psychological_experiences: 'from-pink-950/40 via-gray-950/30 to-transparent',
  biological_factors: 'from-emerald-950/40 via-gray-950/30 to-transparent',
  perception_sensory: 'from-cyan-950/40 via-gray-950/30 to-transparent',
  religion_mythology: 'from-yellow-950/40 via-gray-950/30 to-transparent',
  esoteric_practices: 'from-violet-950/40 via-gray-950/30 to-transparent',
  combination: 'from-gray-900/40 via-gray-950/30 to-transparent'
}

/** Category-specific accent glow (radial gradient overlay) */
var CATEGORY_ACCENTS: Record<string, string> = {
  ufos_aliens: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(34,197,94,0.06),transparent_60%)]',
  cryptids: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(245,158,11,0.06),transparent_60%)]',
  ghosts_hauntings: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(168,85,247,0.08),transparent_60%)]',
  psychic_phenomena: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(59,130,246,0.06),transparent_60%)]',
  consciousness_practices: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(99,102,241,0.06),transparent_60%)]',
  psychological_experiences: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(236,72,153,0.06),transparent_60%)]',
  biological_factors: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(16,185,129,0.06),transparent_60%)]',
  perception_sensory: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(6,182,212,0.06),transparent_60%)]',
  religion_mythology: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(234,179,8,0.06),transparent_60%)]',
  esoteric_practices: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(139,92,246,0.06),transparent_60%)]',
  combination: 'bg-[radial-gradient(ellipse_at_30%_70%,rgba(107,114,128,0.06),transparent_60%)]'
}

function getCategoryBorderColor(category: string): string {
  return CATEGORY_BORDER_COLORS[category] || 'border-primary-500'
}

function getCategoryGlowColor(category: string): string {
  return CATEGORY_GLOW_COLORS[category] || 'hover:shadow-primary-500/10'
}

/* ── Format A: Featured Card (large, dramatic) ────────── */

function FeaturedCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var hookResult = extractHook(report)
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)
  var cardGradient = CATEGORY_CARD_GRADIENTS[report.category] || CATEGORY_CARD_GRADIENTS.combination
  var accent = CATEGORY_ACCENTS[report.category] || ''

  var dateLabel = report.event_date
    ? new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  return (
    <Link href={'/report/' + report.slug} className="block group sm:col-span-2">
      <div className={classNames(
        'relative p-6 sm:p-8 rounded-xl h-full overflow-hidden',
        'border border-white/10 border-l-4', borderColor,
        'hover:border-white/20 transition-all duration-300',
        'hover:shadow-lg', glowColor,
        'min-h-[220px] sm:min-h-[260px] flex flex-col justify-between'
      )}>
        {/* Category-tinted background */}
        <div className={classNames('absolute inset-0 bg-gradient-to-br', cardGradient)} />
        <div className={classNames('absolute inset-0', accent)} />

        {/* Content */}
        <div className="relative z-10">
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

          {/* Hook text — Paradocs editorial voice */}
          {hookResult.hasHook && (
            <p className="text-sm sm:text-base text-gray-300 leading-relaxed line-clamp-3 font-medium">
              {hookResult.text}
            </p>
          )}
        </div>

        <div className="relative z-10 flex items-center justify-between mt-4 pt-4 border-t border-white/5">
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

/* ── Format B: Dossier Card (investigative, text-forward) ─ */

function DossierCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var hookResult = extractHook(report)
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)
  var cardGradient = CATEGORY_CARD_GRADIENTS[report.category] || CATEGORY_CARD_GRADIENTS.combination
  var accent = CATEGORY_ACCENTS[report.category] || ''

  return (
    <Link href={'/report/' + report.slug} className="block group">
      <div className={classNames(
        'relative p-5 sm:p-6 rounded-xl h-full flex flex-col overflow-hidden',
        'border border-white/10 border-l-4', borderColor,
        'hover:border-white/20 transition-all duration-300',
        'hover:shadow-lg', glowColor
      )}>
        {/* Atmospheric category-tinted background */}
        <div className={classNames('absolute inset-0 bg-gradient-to-t', cardGradient)} />
        <div className={classNames('absolute inset-0', accent)} />

        {/* Case-file grid pattern */}
        <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{backgroundImage: 'linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)', backgroundSize: '40px 40px'}} />

        {/* Corner marker */}
        <div className="absolute top-3 left-3 opacity-[0.06] pointer-events-none">
          <div className="w-6 h-6 border-l-2 border-t-2 border-white/40" />
        </div>

        {/* Hook text — Paradocs editorial voice */}
        <div className="relative z-10 flex-grow">
          {hookResult.hasHook ? (
            <p className="text-sm sm:text-base text-gray-200 leading-relaxed line-clamp-4 font-medium mt-2">
              {hookResult.text}
            </p>
          ) : (
            <p className="text-base sm:text-lg text-white leading-snug line-clamp-4 font-semibold mt-4">
              {hookResult.text}
            </p>
          )}
        </div>

        {/* Title + meta at bottom */}
        <div className="relative z-10 mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-sm">{config.icon}</span>
            <span className={classNames('text-[10px] font-medium px-1.5 py-0.5 rounded-full', config.bgColor, config.color)}>
              {config.label}
            </span>
          </div>
          {hookResult.hasHook && (
            <h3 className="text-sm font-semibold text-white group-hover:text-primary-400 transition-colors leading-snug line-clamp-2">
              {report.title}
            </h3>
          )}
          {!hookResult.hasHook && report.location_name && (
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <MapPin className="w-3 h-3" />
              <span>{report.location_name}</span>
            </div>
          )}
        </div>
      </div>
    </Link>
  )
}

/* ── Format C: Compact Card (clean, hook + metadata) ────── */

function CompactCard({ report }: { report: PreviewReport }) {
  var config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  var hookResult = extractHook(report)
  var borderColor = getCategoryBorderColor(report.category)
  var glowColor = getCategoryGlowColor(report.category)
  var accent = CATEGORY_ACCENTS[report.category] || ''

  var dateLabel = report.event_date
    ? new Date(report.event_date).toLocaleDateString('en-US', { year: 'numeric', month: 'short' })
    : null

  return (
    <Link href={'/report/' + report.slug} className="block group">
      <div className={classNames(
        'relative p-5 rounded-xl h-full flex flex-col overflow-hidden',
        'border border-white/10 border-l-4', borderColor,
        'bg-gradient-to-br from-white/[0.03] to-transparent',
        'hover:border-white/20 hover:bg-white/[0.06] transition-all duration-300',
        'hover:shadow-lg', glowColor
      )}>
        {/* Subtle accent glow */}
        <div className={classNames('absolute inset-0', accent)} />

        <div className="relative z-10">
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

          {/* Hook text \u2014 gives readers a reason to click beyond just the title */}
          {hookResult.hasHook && (
            <p className="text-xs text-gray-400 leading-relaxed line-clamp-2 mb-2">
              {hookResult.text}
            </p>
          )}
        </div>

        {report.location_name && (
          <div className="relative z-10 flex items-center gap-1.5 text-xs text-gray-500 mt-auto pt-2">
            <MapPin className="w-3 h-3" />
            <span>{report.location_name}</span>
          </div>
        )}
      </div>
    </Link>
  )
}

/* ── Smart card format assignment ─────────────────────── */
/* Uses hook quality to decide which report gets which slot.
 * Dossier slot prefers reports with hooks. Featured gets richest content.
 * Compact gets good metadata. */

function assignFormats(reports: PreviewReport[]): Array<{ report: PreviewReport; format: string }> {
  if (reports.length === 0) return []

  /* Pre-compute hooks for all reports */
  var withHooks = reports.map(function(r) {
    var hook = extractHook(r)
    var metaScore = 0
    if (r.summary && r.summary.length > 100) metaScore = metaScore + 3
    if (r.location_name) metaScore = metaScore + 2
    if (r.event_date) metaScore = metaScore + 1
    if (r.credibility === 'high' || r.credibility === 'verified') metaScore = metaScore + 2
    return { report: r, hook: hook, metaScore: metaScore }
  })

  var assigned: Array<{ report: PreviewReport; format: string }> = []
  var used: Record<string, boolean> = {}

  /* FEATURED: best overall (hook quality + metadata richness) */
  var featuredCandidates = withHooks.slice().sort(function(a, b) {
    var aTotal = a.hook.score + a.metaScore
    var bTotal = b.hook.score + b.metaScore
    return bTotal - aTotal
  })
  if (featuredCandidates.length > 0) {
    assigned.push({ report: featuredCandidates[0].report, format: 'featured' })
    used[featuredCandidates[0].report.id] = true
  }

  /* DOSSIER: prefers reports with a hook, highest hook score wins */
  var dossierCandidates = withHooks
    .filter(function(w) { return !used[w.report.id] && w.hook.hasHook })
    .sort(function(a, b) { return b.hook.score - a.hook.score })

  if (dossierCandidates.length > 0) {
    assigned.push({ report: dossierCandidates[0].report, format: 'dossier' })
    used[dossierCandidates[0].report.id] = true
  } else {
    var fallbackDossier = withHooks
      .filter(function(w) { return !used[w.report.id] })
      .sort(function(a, b) { return b.metaScore - a.metaScore })
    if (fallbackDossier.length > 0) {
      assigned.push({ report: fallbackDossier[0].report, format: 'dossier' })
      used[fallbackDossier[0].report.id] = true
    }
  }

  /* COMPACT: best remaining by combined score */
  var compactCandidates = withHooks
    .filter(function(w) { return !used[w.report.id] })
    .sort(function(a, b) {
      var aTotal = a.hook.score + a.metaScore
      var bTotal = b.hook.score + b.metaScore
      return bTotal - aTotal
    })

  if (compactCandidates.length > 0) {
    assigned.push({ report: compactCandidates[0].report, format: 'compact' })
  }

  return assigned
}

/* ── Smart report selection from fetched pool ─────────── */
/* Hook quality is now the dominant selection factor.
 * Reports that can produce vivid hooks get +6 bonus \u2014 more than metadata. */

function selectBestReports(pool: PreviewReport[]): PreviewReport[] {
  if (pool.length <= 3) return pool

  var selected: PreviewReport[] = []
  var usedCategories: Record<string, boolean> = {}

  /* Score all reports — hook quality from extractHook() is the primary signal */
  var scored = pool.map(function(r) {
    var hook = extractHook(r)
    var score = 0

    /* Use the actual hook score — vivid feed_hooks score 15-25, dry ones 5-10 */
    score = score + hook.score

    /* Metadata adds value but is secondary */
    if (r.summary && r.summary.length > 100) score = score + 2
    if (r.summary && r.summary.length > 200) score = score + 1
    if (r.location_name) score = score + 2
    if (r.event_date) score = score + 1

    return { report: r, score: score, hookScore: hook.score }
  })

  scored.sort(function(a, b) { return b.score - a.score })

  /* First pass: pick top 2 with category diversity, then best remaining for 3rd */
  for (var i = 0; i < scored.length && selected.length < 2; i++) {
    var cat = scored[i].report.category
    if (!usedCategories[cat]) {
      selected.push(scored[i].report)
      usedCategories[cat] = true
    }
  }

  /* Third card: quality wins over diversity — pick highest score regardless of category */
  for (var q = 0; q < scored.length && selected.length < 3; q++) {
    var alreadyPicked = false
    for (var p = 0; p < selected.length; p++) {
      if (selected[p].id === scored[q].report.id) { alreadyPicked = true; break }
    }
    if (!alreadyPicked) {
      selected.push(scored[q].report)
    }
  }

  /* Backfill if we still need more */
  if (selected.length < 3) {
    for (var j = 0; j < scored.length && selected.length < 3; j++) {
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
        /* Fetch a larger pool (20) so hook-quality filtering has room to be selective */
        var result = await supabase
          .from('reports')
          .select('id, title, slug, summary, feed_hook, category, location_name, event_date, credibility')
          .eq('status', 'approved')
          .not('summary', 'is', null)
          .order('created_at', { ascending: false })
          .limit(20)

        if (result.error) {
          /* feed_hook column may not exist yet \u2014 retry without it */
          result = await supabase
            .from('reports')
            .select('id, title, slug, summary, category, location_name, event_date, credibility')
            .eq('status', 'approved')
            .not('summary', 'is', null)
            .order('created_at', { ascending: false })
            .limit(20)
        }

        var pool = (result.data as PreviewReport[]) || []
        var best = selectBestReports(pool)
        setCards(assignFormats(best))
      } catch (e) {
        /* non-critical \u2014 homepage still works without this section */
      }
      setLoading(false)
    }
    fetchReports()
  }, [])

  return (
    <section className="py-10 md:py-16 border-t border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-xl sm:text-2xl font-display font-semibold text-white mb-2">Eyewitness accounts</h2>
        <p className="text-sm sm:text-base text-gray-400 mb-8 max-w-2xl">Millions of real reports from people worldwide.</p>

        {/* Cards \u2014 asymmetric grid: featured spans 2 cols on desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {loading ? (
            [0, 1, 2].map(function(i) {
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
              if (card.format === 'dossier') {
                return <DossierCard key={card.report.id} report={card.report} />
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
