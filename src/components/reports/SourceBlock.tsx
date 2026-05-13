'use client'

/**
 * SourceBlock — V10.4 Phase 2.2
 *
 * Single consolidated block at the bottom of the experience
 * description: source attribution + link to original + media.
 * Replaces the scattered MediaGallery / FeaturedMediaCard /
 * MediaMentionBanner / SourceAttribution / FurtherReading
 * components that previously rendered separately.
 *
 * Three rendering modes determined by oembed.resolveMediaTier:
 *
 *   Tier 1 — sandboxed iframe under platform-sanctioned embed
 *     URL. YouTube player, Reddit thread, Vimeo, Imgur, etc.
 *     We render the source-attribution chrome ABOVE the iframe
 *     in our own UI so embeds without context can't mislead.
 *
 *   Tier 2 — OG thumbnail + first-paragraph excerpt attribution
 *     card. Fair-use treatment for news sites, BFRO, etc. The
 *     excerpt is the source's own metaDescription / first
 *     paragraph (data we already stored), quoted with explicit
 *     italics + quote marks. Bold "Read at [source] →" link.
 *
 *   Tier 3 — Text-only attribution. No thumbnail. Source name +
 *     title + outbound link.
 *
 * Privacy: we never proxy or cache source content. The user's
 * browser fetches embeds directly from the source.
 */

import React, { useState } from 'react'
import { ExternalLink, Link2, ShieldAlert } from 'lucide-react'
import { resolveMediaTier, type OembedResult } from '@/lib/media/oembed'

export interface SourceBlockProps {
  /** The URL we're attributing to / linking back to. */
  sourceUrl: string | null | undefined
  /** Optional human-readable source label override ("BFRO Report #12345"). */
  sourceLabel?: string | null
  /** Optional one-sentence excerpt to render in Tier-2 attribution cards. */
  excerpt?: string | null
  /** Optional OG/preview thumbnail URL (Tier 2). */
  thumbnailUrl?: string | null
  /** Additional uploaded media items (from report_media table) — rendered after the primary embed. */
  additionalMedia?: Array<{
    id: string
    media_type: 'image' | 'video' | 'audio' | 'document'
    url: string
    thumbnail_url?: string | null
    caption?: string | null
  }>
  className?: string
}

export default function SourceBlock(props: SourceBlockProps) {
  const { sourceUrl, sourceLabel, excerpt, thumbnailUrl, additionalMedia, className } = props

  if (!sourceUrl) return null

  const oembed = resolveMediaTier(sourceUrl)

  return (
    <section
      className={'rounded-xl bg-gray-900/40 border border-gray-800 overflow-hidden ' + (className || '')}
      aria-label="Source"
    >
      {/* Attribution chrome — ALWAYS rendered, ABOVE any embed,
          so users always see who they're about to view content
          from. */}
      <AttributionHeader
        oembed={oembed}
        sourceLabel={sourceLabel}
        sourceUrl={sourceUrl}
      />

      {/* Tier 1: sandboxed iframe under platform's own embed URL. */}
      {oembed.tier === 1 && oembed.embedUrl && (
        <EmbedFrame oembed={oembed} />
      )}

      {/* Tier 2: OG thumbnail + excerpt fair-use card. */}
      {oembed.tier === 2 && (
        <Tier2Card oembed={oembed} thumbnailUrl={thumbnailUrl} excerpt={excerpt} />
      )}

      {/* Tier 3: text-only attribution. The header chrome IS the
          render; nothing more to show. */}

      {/* Additional uploaded media (from report_media — e.g. user-
          uploaded photos that aren't part of the primary source). */}
      {additionalMedia && additionalMedia.length > 0 && (
        <AdditionalMedia items={additionalMedia} />
      )}
    </section>
  )
}

// ── Subcomponents ───────────────────────────────────────────

function AttributionHeader(props: {
  oembed: OembedResult
  sourceLabel?: string | null
  sourceUrl: string
}) {
  const { oembed, sourceLabel, sourceUrl } = props
  // V10.6.24 — Cleaner single-line attribution per panel feedback.
  // Previously rendered as PlatformBadge + 'Original source' kicker
  // + source label + 'View original' button — four visual elements
  // that text-readers parsed as four fragments ('OBE · Original
  // source · OBERF · View original'). One row, one phrase, one CTA.
  const label = sourceLabel || oembed.platformLabel
  // V10.7.B.4.4 — Drop the PlatformBadge when the source label is
  // short enough to read on its own (≤5 chars). The badge renders the
  // first 3 letters of the label as initials, so for short labels
  // like 'OBERF' we end up showing 'OBE · OBERF' — redundant and
  // visually confusing. For longer labels (e.g. 'YouTube' → 'YOU',
  // 'Coast to Coast AM' → 'COA') the initials still add visual
  // identity, so we keep the badge. Platform-coded badges
  // (youtube, reddit, etc.) always render because they carry color
  // identity beyond just initials.
  const isKnownPlatform = oembed.platform !== 'default' && oembed.platform !== 'web'
  const showBadge = isKnownPlatform || (oembed.platformLabel || '').length > 5

  return (
    <header className="flex items-center justify-between gap-2 p-3 bg-gray-950/50 border-b border-gray-800">
      <div className="flex items-center gap-2 min-w-0">
        {showBadge && (
          <PlatformBadge platform={oembed.platform} label={oembed.platformLabel} />
        )}
        <p className="text-sm text-gray-200 truncate leading-tight">
          <span className="text-gray-500">Originally published at </span>
          <span className="text-white font-semibold">{label}</span>
        </p>
      </div>
      <a
        href={sourceUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium text-purple-200 bg-purple-600/15 hover:bg-purple-600/25 border border-purple-600/30 transition-colors flex-shrink-0"
      >
        Read original
        <ExternalLink className="w-3 h-3" />
      </a>
    </header>
  )
}

function EmbedFrame(props: { oembed: OembedResult }) {
  const { oembed } = props
  const minHeight = oembed.minHeight || 0
  const aspectRatio = oembed.aspectRatio

  return (
    <div className="relative w-full bg-black" style={aspectRatio ? { aspectRatio } : { minHeight }}>
      <iframe
        src={oembed.embedUrl}
        className="absolute inset-0 w-full h-full"
        title={oembed.platformLabel + ' embed'}
        loading="lazy"
        allow={oembed.iframeAllow || ''}
        sandbox={oembed.iframeSandbox || 'allow-scripts allow-same-origin'}
        referrerPolicy="strict-origin-when-cross-origin"
        allowFullScreen
      />
    </div>
  )
}

function Tier2Card(props: {
  oembed: OembedResult
  thumbnailUrl?: string | null
  excerpt?: string | null
}) {
  const { thumbnailUrl, excerpt } = props
  // Tier 2 card: OG thumbnail (when available) + short quoted
  // excerpt (when available). Fair-use treatment — both elements
  // are explicitly attributed and not modified.
  if (!thumbnailUrl && !excerpt) {
    return (
      <div className="p-4 flex items-center gap-2 text-xs text-gray-400">
        <Link2 className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
        <span>The full account is at the original source linked above.</span>
      </div>
    )
  }
  return (
    <div className="flex flex-col sm:flex-row gap-3 p-3">
      {thumbnailUrl && (
        <div className="sm:w-40 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={thumbnailUrl}
            alt=""
            className="w-full aspect-video sm:aspect-square object-cover rounded-md bg-gray-900"
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            loading="lazy"
          />
        </div>
      )}
      <div className="flex-1 min-w-0">
        {excerpt && (
          <blockquote className="text-sm text-gray-300 italic leading-relaxed">
            &ldquo;{excerpt}&rdquo;
          </blockquote>
        )}
        <p className="text-[11px] text-gray-500 mt-2 leading-relaxed">
          Excerpt and preview shown under fair use for commentary. The full
          account is at the original source linked above.
        </p>
      </div>
    </div>
  )
}

function PlatformBadge(props: { platform: string; label: string }) {
  // Stylized platform badge — keeps source identity readable
  // even at small sizes. Color-coded per platform family.
  const tint = TINTS[props.platform] || TINTS.default
  return (
    <span
      className={'inline-flex items-center justify-center w-9 h-9 rounded-md text-[10px] font-bold uppercase tracking-wider flex-shrink-0 ' + tint.bg + ' ' + tint.fg}
      title={props.label}
    >
      {props.label.slice(0, 3).toUpperCase()}
    </span>
  )
}

const TINTS: Record<string, { bg: string; fg: string }> = {
  youtube:     { bg: 'bg-red-600/20 border border-red-600/40',     fg: 'text-red-200' },
  vimeo:       { bg: 'bg-sky-500/20 border border-sky-500/40',     fg: 'text-sky-200' },
  reddit:      { bg: 'bg-orange-500/20 border border-orange-500/40', fg: 'text-orange-200' },
  imgur:       { bg: 'bg-emerald-500/20 border border-emerald-500/40', fg: 'text-emerald-200' },
  tiktok:      { bg: 'bg-pink-500/20 border border-pink-500/40',   fg: 'text-pink-200' },
  archive_org: { bg: 'bg-amber-500/20 border border-amber-500/40', fg: 'text-amber-200' },
  hostile:     { bg: 'bg-gray-700 border border-gray-600',         fg: 'text-gray-300' },
  default:     { bg: 'bg-gray-800 border border-gray-700',         fg: 'text-gray-300' },
  web:         { bg: 'bg-gray-800 border border-gray-700',         fg: 'text-gray-300' },
}

function AdditionalMedia(props: {
  items: NonNullable<SourceBlockProps['additionalMedia']>
}) {
  const { items } = props
  const [activeIdx, setActiveIdx] = useState(0)
  if (items.length === 0) return null

  // For now: simple list of additional images / documents linked
  // out. Videos / audio in this list are rare for index reports
  // (their primary source URL is usually the video itself), so we
  // optimize for image strips here.
  const images = items.filter(i => i.media_type === 'image')
  const docs = items.filter(i => i.media_type === 'document')

  return (
    <div className="border-t border-gray-800 p-3 space-y-3">
      {images.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
            Additional images
          </p>
          <div className="grid grid-cols-3 gap-2">
            {images.slice(0, 6).map((img, i) => (
              <a
                key={img.id}
                href={img.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block aspect-square rounded-md bg-gray-900 overflow-hidden border border-gray-800 hover:border-gray-700 transition-colors"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={img.thumbnail_url || img.url}
                  alt={img.caption || ''}
                  className="w-full h-full object-cover"
                  loading="lazy"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
                />
              </a>
            ))}
          </div>
          {images.length > 6 && (
            <p className="text-[10px] text-gray-500 mt-1">+{images.length - 6} more images at the source</p>
          )}
        </div>
      )}
      {docs.length > 0 && (
        <div>
          <p className="text-[10px] uppercase tracking-wider font-semibold text-gray-500 mb-2">
            Documents
          </p>
          <ul className="space-y-1">
            {docs.slice(0, 5).map(d => (
              <li key={d.id}>
                <a
                  href={d.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-purple-300 hover:text-purple-200 transition-colors"
                >
                  <ShieldAlert className="w-3 h-3" />
                  {d.caption || 'Document'}
                  <ExternalLink className="w-2.5 h-2.5" />
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
