'use client'

/**
 * Phase 2 Discover Card Templates
 *
 * Three card templates for the mixed-content Stories feed:
 *  1. PhenomenonCard  — Full-screen encyclopedia entry (image or gradient bg)
 *  2. TextReportCard  — First-person experiencer report, text-focused
 *  3. MediaReportCard — Report with photo/video evidence, image-backed
 *
 * All cards are full-viewport-height snap items for the TikTok-style scroll.
 * Related content is handled by horizontal swipe in discover.tsx (2D snap grid).
 */

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Bookmark,
  Share2,
  Compass,
  Eye,
  ArrowRight,
  AlertTriangle,
  MapPin,
  Tag,
  Calendar,
  Shield,
  FileText,
  Camera,
} from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

// =========================================================================
//  Shared types
// =========================================================================

interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

export interface PhenomenonItem {
  item_type: 'phenomenon'
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  ai_description: string | null
  ai_quick_facts: QuickFacts | null
  primary_image_url: string | null
  report_count: number
  primary_regions: string[] | null
  first_reported_date: string | null
  aliases: string[] | null
}

export interface ReportMedia {
  type: string
  url: string
  thumbnail_url: string | null
  caption: string | null
}

export interface ReportItem {
  item_type: 'report'
  id: string
  title: string
  slug: string
  summary: string | null
  feed_hook: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  credibility: string | null
  upvotes: number
  view_count: number
  comment_count: number
  has_photo_video: boolean
  has_physical_evidence: boolean
  content_type: string | null
  location_name: string | null
  source_type: string | null
  source_label: string | null
  created_at: string
  phenomenon_type: { name: string; slug: string; category: string } | null
  primary_media: ReportMedia | null
  associated_image_url: string | null
  associated_image_source: string | null
}

export type FeedItemV2 = PhenomenonItem | ReportItem

// RelatedItem interface removed — related content is now handled as
// full FeedItemV2 cards in the 2D horizontal swipe grid (discover.tsx)

// =========================================================================
//  Color maps
// =========================================================================

var CARD_GRADIENTS: Record<string, string> = {
  cryptids: 'from-emerald-950/90 via-gray-950/80 to-gray-950',
  ufos_aliens: 'from-indigo-950/90 via-gray-950/80 to-gray-950',
  ghosts_hauntings: 'from-purple-950/90 via-gray-950/80 to-gray-950',
  psychic_phenomena: 'from-violet-950/90 via-gray-950/80 to-gray-950',
  consciousness_practices: 'from-amber-950/90 via-gray-950/80 to-gray-950',
  psychological_experiences: 'from-cyan-950/90 via-gray-950/80 to-gray-950',
  biological_factors: 'from-rose-950/90 via-gray-950/80 to-gray-950',
  perception_sensory: 'from-orange-950/90 via-gray-950/80 to-gray-950',
  religion_mythology: 'from-yellow-950/90 via-gray-950/80 to-gray-950',
  esoteric_practices: 'from-fuchsia-950/90 via-gray-950/80 to-gray-950',
  combination: 'from-teal-950/90 via-gray-950/80 to-gray-950',
}

var DANGER_COLORS: Record<string, { bg: string; text: string; glow: string }> = {
  'Low': { bg: 'bg-green-500/20', text: 'text-green-400', glow: 'shadow-green-500/20' },
  'Moderate': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', glow: 'shadow-yellow-500/20' },
  'High': { bg: 'bg-orange-500/20', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
  'Extreme': { bg: 'bg-red-500/20', text: 'text-red-400', glow: 'shadow-red-500/20' },
  'Unknown': { bg: 'bg-gray-500/20', text: 'text-gray-400', glow: '' },
  'Varies': { bg: 'bg-purple-500/20', text: 'text-purple-400', glow: 'shadow-purple-500/20' },
}

var CREDIBILITY_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  'high': { bg: 'bg-emerald-500/20', text: 'text-emerald-400', icon: '\u2713\u2713' },
  'medium': { bg: 'bg-yellow-500/20', text: 'text-yellow-400', icon: '\u2713' },
  'low': { bg: 'bg-red-500/20', text: 'text-red-400', icon: '?' },
}

var placeholderUrl = 'https://bhkbctdmwnowfmqpksed.supabase.co/storage/v1/object/public/phenomena-images/default-cryptid.jpg'

// =========================================================================
//  Generative visual variety system for text-based report cards
//  Ensures every card feels unique even without media.
//  Uses a simple hash of report ID to deterministically pick visual treatments.
// =========================================================================

/** Simple string hash → number (deterministic) */
function hashString(str: string): number {
  var hash = 0
  for (var i = 0; i < str.length; i++) {
    var char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash |= 0 // Convert to 32-bit int
  }
  return Math.abs(hash)
}

/** Visual treatment moods for text report cards */
var CARD_MOODS = ['quote', 'cinematic', 'minimal', 'atmospheric'] as const
type CardMood = typeof CARD_MOODS[number]

/** Gradient angle variations — each has a different visual feel */
var GRADIENT_ANGLES = [
  'bg-gradient-to-t',    // bottom-up (standard)
  'bg-gradient-to-tr',   // diagonal
  'bg-gradient-to-tl',   // opposite diagonal
  'bg-gradient-to-br',   // top-down diagonal
]

/** Accent color variations within categories (subtle shifts) */
var ACCENT_VARIATIONS: Record<string, string[]> = {
  cryptids: [
    'bg-[radial-gradient(ellipse_at_30%_70%,rgba(16,185,129,0.08),transparent_60%)]',
    'bg-[radial-gradient(ellipse_at_70%_30%,rgba(52,211,153,0.06),transparent_50%)]',
    'bg-[radial-gradient(circle_at_20%_80%,rgba(6,95,70,0.12),transparent_55%)]',
    'bg-[radial-gradient(ellipse_at_80%_60%,rgba(16,185,129,0.05),transparent_65%)]',
  ],
  ufos_aliens: [
    'bg-[radial-gradient(ellipse_at_30%_70%,rgba(99,102,241,0.08),transparent_60%)]',
    'bg-[radial-gradient(ellipse_at_70%_20%,rgba(129,140,248,0.06),transparent_50%)]',
    'bg-[radial-gradient(circle_at_50%_50%,rgba(55,48,163,0.12),transparent_55%)]',
    'bg-[radial-gradient(ellipse_at_20%_40%,rgba(99,102,241,0.07),transparent_65%)]',
  ],
  ghosts_hauntings: [
    'bg-[radial-gradient(ellipse_at_30%_70%,rgba(168,85,247,0.08),transparent_60%)]',
    'bg-[radial-gradient(ellipse_at_70%_80%,rgba(192,132,252,0.06),transparent_50%)]',
    'bg-[radial-gradient(circle_at_40%_20%,rgba(107,33,168,0.10),transparent_55%)]',
    'bg-[radial-gradient(ellipse_at_60%_90%,rgba(168,85,247,0.05),transparent_65%)]',
  ],
  psychic_phenomena: [
    'bg-[radial-gradient(ellipse_at_30%_70%,rgba(139,92,246,0.08),transparent_60%)]',
    'bg-[radial-gradient(ellipse_at_80%_30%,rgba(167,139,250,0.06),transparent_50%)]',
    'bg-[radial-gradient(circle_at_50%_80%,rgba(109,40,217,0.10),transparent_55%)]',
    'bg-[radial-gradient(ellipse_at_20%_50%,rgba(139,92,246,0.07),transparent_65%)]',
  ],
  consciousness_practices: [
    'bg-[radial-gradient(ellipse_at_30%_70%,rgba(217,119,6,0.08),transparent_60%)]',
    'bg-[radial-gradient(ellipse_at_70%_40%,rgba(245,158,11,0.06),transparent_50%)]',
    'bg-[radial-gradient(circle_at_40%_60%,rgba(180,83,9,0.10),transparent_55%)]',
    'bg-[radial-gradient(ellipse_at_60%_20%,rgba(217,119,6,0.05),transparent_65%)]',
  ],
}

var DEFAULT_ACCENTS = [
  'bg-[radial-gradient(ellipse_at_30%_70%,rgba(139,92,246,0.06),transparent_60%)]',
  'bg-[radial-gradient(ellipse_at_70%_30%,rgba(99,102,241,0.06),transparent_50%)]',
  'bg-[radial-gradient(circle_at_50%_50%,rgba(168,85,247,0.08),transparent_55%)]',
  'bg-[radial-gradient(ellipse_at_20%_80%,rgba(79,70,229,0.06),transparent_65%)]',
]

/** Decorative watermark elements for different moods */
var WATERMARK_CHARS = ['\u201C', '\u2022', '\u25C6', '\u2605'] // ", •, ◆, ★

function getCardVariation(reportId: string, category: string) {
  var hash = hashString(reportId)
  var mood = CARD_MOODS[hash % CARD_MOODS.length]
  var gradientDir = GRADIENT_ANGLES[hash % GRADIENT_ANGLES.length]
  var accents = ACCENT_VARIATIONS[category] || DEFAULT_ACCENTS
  var accent = accents[(hash >> 4) % accents.length]
  var watermark = WATERMARK_CHARS[(hash >> 8) % WATERMARK_CHARS.length]
  // Use phenomenon image rarely (1 in 8 cards)
  var usePhenomenonImage = (hash % 8) === 0
  return { mood: mood, gradientDir: gradientDir, accent: accent, watermark: watermark, usePhenomenonImage: usePhenomenonImage }
}

// =========================================================================
//  Shared sidebar actions (TikTok-style right rail)
// =========================================================================

function SidebarActions(props: {
  shareTitle: string
  shareText: string
  shareUrl: string
  categoryHref: string
  user: any
  onShowSignup: (show: boolean) => void
  isActive: boolean
}) {
  return (
    <div className={classNames(
      'absolute right-3 sm:right-6 bottom-20 sm:bottom-40 md:bottom-24 flex flex-col items-center gap-4 sm:gap-5 transition-all duration-500',
      props.isActive ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-4'
    )}>
      <button
        onClick={function (e) {
          e.stopPropagation()
          if (!props.user) props.onShowSignup(true)
        }}
        className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
        title="Save"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
          <Bookmark className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-[10px]">Save</span>
      </button>
      <button
        onClick={function (e) {
          e.stopPropagation()
          if (navigator.share) {
            navigator.share({
              title: props.shareTitle,
              text: props.shareText,
              url: props.shareUrl,
            }).catch(function () {})
          } else {
            navigator.clipboard.writeText(props.shareUrl)
          }
        }}
        className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
        title="Share"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
          <Share2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-[10px]">Share</span>
      </button>
      <Link
        href={props.categoryHref}
        className="flex flex-col items-center gap-1 text-white/70 hover:text-white transition-colors"
        title="More like this"
      >
        <div className="w-10 h-10 sm:w-11 sm:h-11 bg-gray-800/60 backdrop-blur-sm rounded-full flex items-center justify-center hover:bg-gray-700/60 transition-colors">
          <Compass className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
        <span className="text-[10px]">More</span>
      </Link>
    </div>
  )
}

// RelatedTray removed — replaced by 2D horizontal swipe grid in discover.tsx

// =========================================================================
//  1. PhenomenonCard — encyclopedia entry (existing DiscoverCard, upgraded)
// =========================================================================

export function PhenomenonCard(props: {
  item: PhenomenonItem
  index: number
  isActive: boolean
  user: any
  onShowSignup: (show: boolean) => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var gradient = CARD_GRADIENTS[item.category] || 'from-gray-950/90 to-gray-950'
  var qf = item.ai_quick_facts
  var [imgError, setImgError] = useState(false)
  var hasImage = item.primary_image_url && !imgError && item.primary_image_url !== placeholderUrl

  var dangerKey = qf?.danger_level?.split(' ')?.[0] || ''
  var dangerStyle = DANGER_COLORS[dangerKey] || null

  return (
    <div
      className="h-screen w-full relative overflow-hidden bg-gray-950"
    >
      {/* Background */}
      {hasImage ? (
        <>
          <img
            src={item.primary_image_url!}
            alt=""
            className={classNames(
              'absolute inset-0 w-full h-full object-cover transition-transform duration-700',
              props.isActive ? 'scale-100' : 'scale-105'
            )}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={function () { setImgError(true) }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/60 to-gray-950/30" />
        </>
      ) : (
        <div className={classNames('absolute inset-0 bg-gradient-to-br', gradient)}>
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.06]">
            <span className="text-[12rem] sm:text-[20rem] leading-none select-none">{item.icon || config?.icon}</span>
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_50%,rgba(139,92,246,0.05),transparent_70%)]" />
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 pb-16 pr-16 sm:p-8 sm:pb-24 sm:pr-24 md:p-12 md:pb-16 md:pr-12">
        {/* Category badge */}
        <div className="mb-3 sm:mb-4">
          <span className={classNames(
            'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
            config?.bgColor || 'bg-gray-800', config?.color || 'text-gray-400'
          )}>
            <span>{config?.icon}</span>
            {config?.label}
          </span>
        </div>

        {/* Title */}
        <h1 className={classNames(
          'text-3xl sm:text-5xl md:text-6xl font-bold text-white mb-2 sm:mb-3 leading-tight transition-all duration-500',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-2'
        )}>
          {item.name}
        </h1>

        {/* Aliases */}
        {item.aliases && item.aliases.length > 0 && (
          <p className="text-xs sm:text-sm text-gray-500 mb-3 sm:mb-4 italic line-clamp-1">
            Also known as: {item.aliases.slice(0, 3).join(', ')}
          </p>
        )}

        {/* Summary */}
        {item.ai_summary && (
          <p className={classNames(
            'text-sm sm:text-base md:text-lg text-gray-300 max-w-2xl leading-relaxed mb-4 sm:mb-6 line-clamp-3 transition-all duration-500 delay-100',
            props.isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
          )}>
            {item.ai_summary}
          </p>
        )}

        {/* Quick fact pills */}
        {qf && (
          <div className={classNames(
            'flex gap-1.5 sm:gap-2 mb-4 sm:mb-6 transition-all duration-500 delay-200 overflow-x-auto scrollbar-hide -mx-1 px-1 sm:mx-0 sm:px-0 sm:flex-wrap sm:overflow-visible',
            props.isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
          )}>
            {dangerStyle && qf.danger_level && (
              <span className={classNames(
                'inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm shadow-lg flex-shrink-0',
                dangerStyle.bg, dangerStyle.text, dangerStyle.glow
              )}>
                <AlertTriangle className="w-3 h-3" />
                {'Danger: ' + qf.danger_level.split(' ')[0]}
              </span>
            )}
            {qf.origin && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <MapPin className="w-3 h-3" />
                {qf.origin.length > 25 ? qf.origin.substring(0, 23) + '...' : qf.origin}
              </span>
            )}
            {qf.classification && (
              <span className="inline-flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <Tag className="w-3 h-3" />
                {qf.classification.length > 20 ? qf.classification.substring(0, 18) + '...' : qf.classification}
              </span>
            )}
            {qf.first_documented && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold bg-white/10 text-gray-300 backdrop-blur-sm flex-shrink-0">
                <Calendar className="w-3 h-3" />
                {qf.first_documented.length > 25 ? qf.first_documented.substring(0, 23) + '...' : qf.first_documented}
              </span>
            )}
          </div>
        )}

        {/* CTA */}
        <div className={classNames(
          'flex items-center gap-3 transition-all duration-500 delay-300',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
        )}>
          <Link
            href={'/phenomena/' + item.slug}
            className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg hover:shadow-white/10"
          >
            <Eye className="w-4 h-4" />
            Read Full Entry
            <ArrowRight className="w-4 h-4" />
          </Link>
          {item.report_count > 0 && (
            <span className="text-xs sm:text-sm text-gray-500">
              {item.report_count + ' report' + (item.report_count !== 1 ? 's' : '')}
            </span>
          )}
        </div>
      </div>

      {/* Sidebar actions */}
      <SidebarActions
        shareTitle={item.name}
        shareText={item.ai_summary || 'Discover ' + item.name + ' on Paradocs'}
        shareUrl={typeof window !== 'undefined' ? window.location.origin + '/phenomena/' + item.slug : '/phenomena/' + item.slug}
        categoryHref={'/phenomena?category=' + item.category}
        user={props.user}
        onShowSignup={props.onShowSignup}
        isActive={props.isActive}
      />
    </div>
  )
}

// =========================================================================
//  2. TextReportCard — first-person experiencer report
//     Generative visual variety: each card gets a unique-feeling treatment
//     derived from the report ID hash. Phenomenon images used sparingly
//     (~1 in 8 cards) to avoid repetition at scale (10M+ text reports).
//     Prefers feed_hook over summary for preview text.
// =========================================================================

export function TextReportCard(props: {
  item: ReportItem
  index: number
  isActive: boolean
  user: any
  onShowSignup: (show: boolean) => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var gradient = CARD_GRADIENTS[item.category] || 'from-gray-950/90 to-gray-950'
  var credStyle = CREDIBILITY_STYLES[item.credibility || ''] || null
  var [imgError, setImgError] = useState(false)

  // Generative visual variety based on report ID
  var variation = getCardVariation(item.id, item.category)

  // Only use phenomenon image on ~1/8 of cards to avoid repetition at scale
  var useBgImage = variation.usePhenomenonImage && !imgError && item.associated_image_url

  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')

  var dateStr = ''
  if (item.event_date) {
    try {
      var d = new Date(item.event_date)
      dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch (e) {
      dateStr = item.event_date
    }
  }

  // Prefer feed_hook (engagement-optimized) over raw summary
  var displayText = item.feed_hook || item.summary || ''
  var isHook = !!item.feed_hook

  return (
    <div
      className="h-screen w-full relative overflow-hidden bg-gray-950"
    >
      {/* Background: rare phenomenon image, or generative gradient */}
      {useBgImage ? (
        <>
          <img
            src={item.associated_image_url!}
            alt=""
            className={classNames(
              'absolute inset-0 w-full h-full object-cover transition-transform duration-700 blur-[2px]',
              props.isActive ? 'scale-100' : 'scale-110'
            )}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={function () { setImgError(true) }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/85 to-gray-950/50" />
          <div className="absolute inset-0 bg-gray-950/30" />
        </>
      ) : (
        <div className={classNames('absolute inset-0', variation.gradientDir, gradient)}>
          {/* Mood-specific decorative element */}
          {variation.mood === 'quote' && (
            <div className="absolute top-16 left-6 sm:left-12 opacity-[0.04]">
              <span className="text-[16rem] sm:text-[24rem] leading-none select-none font-serif">{variation.watermark}</span>
            </div>
          )}
          {variation.mood === 'cinematic' && (
            <>
              {/* Film-grain-like noise overlay */}
              <div className="absolute inset-0 opacity-[0.015]" style={{backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noise\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.65\' numOctaves=\'3\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noise)\'/%3E%3C/svg%3E")', backgroundSize: '200px 200px'}} />
              {/* Cinematic letterbox bars */}
              <div className="absolute top-0 left-0 right-0 h-12 sm:h-16 bg-black/40" />
              <div className="absolute bottom-0 left-0 right-0 h-12 sm:h-16 bg-black/40" />
            </>
          )}
          {variation.mood === 'minimal' && (
            /* Clean, almost no decoration — let the text breathe */
            <div className="absolute bottom-0 left-0 right-0 h-2/3 bg-gradient-to-t from-gray-950 to-transparent" />
          )}
          {variation.mood === 'atmospheric' && (
            <>
              {/* Subtle icon watermark from category */}
              <div className="absolute top-1/4 right-8 sm:right-16 opacity-[0.03]">
                <span className="text-[10rem] sm:text-[16rem] leading-none select-none">{config?.icon || '\ud83d\udd0d'}</span>
              </div>
              {/* Vignette effect */}
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,rgba(0,0,0,0.4)_100%)]" />
            </>
          )}
          {/* Category-specific accent glow — varies per card */}
          <div className={classNames('absolute inset-0', variation.accent)} />
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 pb-16 pr-16 sm:p-8 sm:pb-24 sm:pr-24 md:p-12 md:pb-16 md:pr-12">
        {/* Type badge row */}
        <div className="mb-3 sm:mb-4 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-white/10 backdrop-blur-sm text-gray-300">
            <FileText className="w-3 h-3" />
            Experiencer Report
          </span>
          <span className={classNames(
            'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
            config?.bgColor || 'bg-gray-800', config?.color || 'text-gray-400'
          )}>
            <span>{config?.icon}</span>
            {config?.label}
          </span>
          {credStyle && (
            <span className={classNames(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
              credStyle.bg, credStyle.text
            )}>
              <Shield className="w-3 h-3" />
              {(item.credibility || '').charAt(0).toUpperCase() + (item.credibility || '').slice(1)}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className={classNames(
          'text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-2 sm:mb-3 leading-tight transition-all duration-500',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-2'
        )}>
          {item.title}
        </h1>

        {/* Phenomenon link */}
        {item.phenomenon_type && (
          <p className="text-xs sm:text-sm text-gray-500 mb-2">
            {'Related: '}
            <Link href={'/phenomena/' + item.phenomenon_type.slug} className="text-primary-400 hover:text-primary-300 underline decoration-dotted">
              {item.phenomenon_type.name}
            </Link>
          </p>
        )}

        {/* Meta row: location + date */}
        <div className={classNames(
          'flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 flex-wrap transition-all duration-500 delay-100',
          props.isActive ? 'opacity-100' : 'opacity-50'
        )}>
          {locationStr && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {locationStr}
            </span>
          )}
          {dateStr && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </span>
          )}
        </div>

        {/* Hook or excerpt — the draw */}
        {displayText && (
          <div className={classNames(
            'max-w-2xl mb-4 sm:mb-6 transition-all duration-500 delay-150',
            props.isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
          )}>
            {isHook ? (
              /* Feed hook: engagement-optimized, display prominently */
              <p className="text-base sm:text-lg md:text-xl text-gray-200 leading-relaxed line-clamp-4 font-medium">
                {displayText}
              </p>
            ) : (
              /* Raw summary: style as a first-person quote */
              <div className={classNames(
                'pl-4',
                variation.mood === 'cinematic' ? 'border-l-2 border-amber-500/30' :
                variation.mood === 'atmospheric' ? 'border-l-2 border-purple-500/30' :
                'border-l-2 border-white/20'
              )}>
                <p className="text-sm sm:text-base md:text-lg text-gray-300 leading-relaxed line-clamp-4 italic">
                  {displayText}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Evidence pills */}
        {item.has_physical_evidence && (
          <div className={classNames(
            'flex gap-2 mb-4 sm:mb-6 transition-all duration-500 delay-200',
            props.isActive ? 'opacity-100' : 'opacity-40'
          )}>
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-500/15 text-emerald-400 backdrop-blur-sm">
              Physical Evidence
            </span>
          </div>
        )}

        {/* CTA */}
        <div className={classNames(
          'flex items-center gap-3 transition-all duration-500 delay-300',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
        )}>
          <Link
            href={'/report/' + item.slug}
            className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg hover:shadow-white/10"
          >
            <Eye className="w-4 h-4" />
            Read Full Report
            <ArrowRight className="w-4 h-4" />
          </Link>
          {item.upvotes > 0 && (
            <span className="text-xs sm:text-sm text-gray-500">
              {item.upvotes + ' upvote' + (item.upvotes !== 1 ? 's' : '')}
            </span>
          )}
        </div>
      </div>

      {/* Sidebar actions */}
      <SidebarActions
        shareTitle={item.title}
        shareText={item.feed_hook || item.summary || item.title}
        shareUrl={typeof window !== 'undefined' ? window.location.origin + '/report/' + item.slug : '/report/' + item.slug}
        categoryHref={'/explore?category=' + item.category}
        user={props.user}
        onShowSignup={props.onShowSignup}
        isActive={props.isActive}
      />
    </div>
  )
}

// =========================================================================
//  3. MediaReportCard — report with photo/video evidence
//     Uses actual report media (from report_media table) as full-screen
//     background when available. Falls back to cinematic gradient.
//     Prefers feed_hook for preview text.
// =========================================================================

export function MediaReportCard(props: {
  item: ReportItem
  index: number
  isActive: boolean
  user: any
  onShowSignup: (show: boolean) => void
}) {
  var item = props.item
  var config = CATEGORY_CONFIG[item.category as keyof typeof CATEGORY_CONFIG]
  var credStyle = CREDIBILITY_STYLES[item.credibility || ''] || null
  var [imgError, setImgError] = useState(false)

  var locationParts: string[] = []
  if (item.city) locationParts.push(item.city)
  if (item.state_province) locationParts.push(item.state_province)
  if (item.country) locationParts.push(item.country)
  var locationStr = locationParts.join(', ')

  var dateStr = ''
  if (item.event_date) {
    try {
      var d = new Date(item.event_date)
      dateStr = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    } catch (e) {
      dateStr = item.event_date
    }
  }

  // Determine the best image to show
  var mediaUrl = !imgError && item.primary_media
    ? (item.primary_media.thumbnail_url || item.primary_media.url)
    : null
  var hasImage = !!mediaUrl
  var gradient = CARD_GRADIENTS[item.category] || 'from-gray-950/90 to-gray-950'

  // Prefer feed_hook for preview text
  var displayText = item.feed_hook || item.summary || ''
  var isHook = !!item.feed_hook

  return (
    <div
      className="h-screen w-full relative overflow-hidden bg-gray-950"
    >
      {/* Background: actual report media image or cinematic gradient */}
      {hasImage ? (
        <>
          <img
            src={mediaUrl!}
            alt=""
            className={classNames(
              'absolute inset-0 w-full h-full object-cover transition-transform duration-700',
              props.isActive ? 'scale-100' : 'scale-105'
            )}
            referrerPolicy="no-referrer"
            loading="lazy"
            onError={function () { setImgError(true) }}
          />
          {/* Cinematic overlay — strong enough for text readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-gray-950 via-gray-950/70 to-gray-950/20" />
          {/* Subtle amber tint to signal "evidence" */}
          <div className="absolute inset-0 bg-amber-950/10" />
        </>
      ) : (
        <div className={classNames('absolute inset-0 bg-gradient-to-br', gradient)}>
          <div className="absolute top-1/4 right-8 sm:right-16 opacity-[0.04]">
            <Camera className="w-48 h-48 sm:w-72 sm:h-72" />
          </div>
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_70%_30%,rgba(239,68,68,0.04),transparent_60%)]" />
        </div>
      )}

      {/* Media caption if available */}
      {hasImage && item.primary_media?.caption && (
        <div className={classNames(
          'absolute top-16 sm:top-20 left-5 sm:left-8 right-20 transition-all duration-500',
          props.isActive ? 'opacity-60' : 'opacity-0'
        )}>
          <p className="text-[10px] sm:text-xs text-gray-400 bg-black/40 backdrop-blur-sm px-3 py-1.5 rounded-lg inline-block max-w-sm">
            {item.primary_media!.caption}
          </p>
        </div>
      )}

      {/* Content */}
      <div className="absolute inset-0 flex flex-col justify-end p-5 pb-16 pr-16 sm:p-8 sm:pb-24 sm:pr-24 md:p-12 md:pb-16 md:pr-12">
        {/* Type badge row */}
        <div className="mb-3 sm:mb-4 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold bg-amber-500/20 backdrop-blur-sm text-amber-400">
            <Camera className="w-3 h-3" />
            Evidence Report
          </span>
          <span className={classNames(
            'inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
            config?.bgColor || 'bg-gray-800', config?.color || 'text-gray-400'
          )}>
            <span>{config?.icon}</span>
            {config?.label}
          </span>
          {credStyle && (
            <span className={classNames(
              'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold backdrop-blur-sm',
              credStyle.bg, credStyle.text
            )}>
              <Shield className="w-3 h-3" />
              {(item.credibility || '').charAt(0).toUpperCase() + (item.credibility || '').slice(1)}
            </span>
          )}
        </div>

        {/* Title */}
        <h1 className={classNames(
          'text-2xl sm:text-4xl md:text-5xl font-bold text-white mb-2 sm:mb-3 leading-tight transition-all duration-500',
          hasImage ? 'drop-shadow-lg' : '',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-80 translate-y-2'
        )}>
          {item.title}
        </h1>

        {/* Phenomenon link */}
        {item.phenomenon_type && (
          <p className="text-xs sm:text-sm text-gray-500 mb-2">
            {'Related: '}
            <Link href={'/phenomena/' + item.phenomenon_type.slug} className="text-primary-400 hover:text-primary-300 underline decoration-dotted">
              {item.phenomenon_type.name}
            </Link>
          </p>
        )}

        {/* Meta row */}
        <div className={classNames(
          'flex items-center gap-3 sm:gap-4 text-xs sm:text-sm text-gray-400 mb-3 sm:mb-4 flex-wrap transition-all duration-500 delay-100',
          props.isActive ? 'opacity-100' : 'opacity-50'
        )}>
          {locationStr && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {locationStr}
            </span>
          )}
          {dateStr && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              {dateStr}
            </span>
          )}
        </div>

        {/* Hook or summary */}
        {displayText && (
          <div className={classNames(
            'max-w-2xl mb-4 sm:mb-6 transition-all duration-500 delay-150',
            props.isActive ? 'opacity-100 translate-y-0' : 'opacity-60 translate-y-2'
          )}>
            {isHook ? (
              <p className={classNames(
                'text-base sm:text-lg md:text-xl text-gray-200 leading-relaxed line-clamp-3 font-medium',
                hasImage ? 'drop-shadow-md' : ''
              )}>
                {displayText}
              </p>
            ) : (
              <p className={classNames(
                'text-sm sm:text-base md:text-lg text-gray-300 leading-relaxed line-clamp-3',
                hasImage ? 'drop-shadow-md' : ''
              )}>
                {displayText}
              </p>
            )}
          </div>
        )}

        {/* Evidence pills */}
        <div className={classNames(
          'flex gap-2 mb-4 sm:mb-6 transition-all duration-500 delay-200',
          props.isActive ? 'opacity-100' : 'opacity-40'
        )}>
          {item.has_photo_video && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-amber-500/15 text-amber-400 backdrop-blur-sm">
              <Camera className="w-3 h-3" />
              Photo/Video
            </span>
          )}
          {item.has_physical_evidence && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-emerald-500/15 text-emerald-400 backdrop-blur-sm">
              Physical Evidence
            </span>
          )}
        </div>

        {/* CTA */}
        <div className={classNames(
          'flex items-center gap-3 transition-all duration-500 delay-300',
          props.isActive ? 'opacity-100 translate-y-0' : 'opacity-40 translate-y-2'
        )}>
          <Link
            href={'/report/' + item.slug}
            className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 rounded-full font-semibold text-sm transition-all bg-white text-gray-900 hover:bg-gray-100 active:bg-gray-200 hover:shadow-lg hover:shadow-white/10"
          >
            <Eye className="w-4 h-4" />
            View Evidence
            <ArrowRight className="w-4 h-4" />
          </Link>
          {item.view_count > 0 && (
            <span className="text-xs sm:text-sm text-gray-500">
              {item.view_count + ' view' + (item.view_count !== 1 ? 's' : '')}
            </span>
          )}
        </div>
      </div>

      {/* Sidebar actions */}
      <SidebarActions
        shareTitle={item.title}
        shareText={item.feed_hook || item.summary || item.title}
        shareUrl={typeof window !== 'undefined' ? window.location.origin + '/report/' + item.slug : '/report/' + item.slug}
        categoryHref={'/explore?category=' + item.category}
        user={props.user}
        onShowSignup={props.onShowSignup}
        isActive={props.isActive}
      />
    </div>
  )
}
