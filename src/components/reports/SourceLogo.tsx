'use client'

/**
 * SourceLogo — V11.18.44
 *
 * Renders a recognizable mark for a report's source, keyed off the source URL's
 * host (falls back to the oembed platform, then a globe). Replaces the old
 * 3-letter text badge ("RED", "YOU", "OBE"…).
 *
 * - Major web platforms (Reddit, YouTube, Vimeo) → real brand logos (inline SVG).
 * - Source organisations (NUFORC, NDERF, OBERF, ADCRF, SPR) and Chronicling
 *   America → on-theme glyph marks in their tint. These orgs do not publish a
 *   clean single-file logo asset; to use their actual logos, drop the SVG into
 *   ORG_SVG below keyed by host and it will be used instead of the glyph.
 * - Anything else → globe.
 */

import React from 'react'
import { Globe, Newspaper, Rocket, Sparkles, Ghost, MessageCircle, BookOpen } from 'lucide-react'

function hostOf(url: string | null | undefined): string {
  if (!url) return ''
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, '') } catch { return '' }
}

// Real brand logos (inline single-path SVGs, brand colors).
const BRAND: Record<string, { color: string; path: string; label: string }> = {
  reddit: {
    color: '#FF4500', label: 'Reddit',
    path: 'M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z',
  },
  youtube: {
    color: '#FF0000', label: 'YouTube',
    path: 'M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z',
  },
  vimeo: {
    color: '#1AB7EA', label: 'Vimeo',
    path: 'M23.977 6.416c-.105 2.338-1.739 5.543-4.894 9.609-3.268 4.247-6.026 6.37-8.29 6.37-1.409 0-2.578-1.294-3.553-3.881L5.322 11.4C4.603 8.816 3.834 7.522 3.01 7.522c-.179 0-.806.378-1.881 1.132L0 7.197c1.185-1.044 2.351-2.084 3.501-3.128C5.08 2.701 6.266 1.984 7.055 1.91c1.867-.18 3.016 1.1 3.447 3.838.465 2.953.789 4.789.971 5.507.539 2.45 1.131 3.674 1.776 3.674.502 0 1.256-.796 2.265-2.385 1.004-1.589 1.54-2.797 1.612-3.628.144-1.371-.395-2.061-1.614-2.061-.574 0-1.167.121-1.777.391 1.186-3.868 3.434-5.757 6.762-5.637 2.473.06 3.628 1.664 3.493 4.797l-.013.01z',
  },
}

// Org / source-type marks: glyph + tint. Swap a value into ORG_SVG (host → path)
// to use an org's real logo instead.
const ORG: Record<string, { tint: string; bg: string; Icon: React.ComponentType<{ className?: string }>; label: string }> = {
  nuforc:            { tint: 'text-emerald-300', bg: 'bg-emerald-500/15 border-emerald-500/30', Icon: Rocket,        label: 'NUFORC' },
  nderf:             { tint: 'text-sky-300',     bg: 'bg-sky-500/15 border-sky-500/30',         Icon: Sparkles,      label: 'NDERF' },
  oberf:             { tint: 'text-teal-300',    bg: 'bg-teal-500/15 border-teal-500/30',       Icon: Ghost,         label: 'OBERF' },
  adcrf:             { tint: 'text-violet-300',  bg: 'bg-violet-500/15 border-violet-500/30',   Icon: MessageCircle, label: 'ADCRF' },
  spr:               { tint: 'text-amber-300',   bg: 'bg-amber-500/15 border-amber-500/30',     Icon: BookOpen,      label: 'SPR' },
  chronicling:       { tint: 'text-amber-200',   bg: 'bg-amber-700/20 border-amber-700/40',     Icon: Newspaper,     label: 'Chronicling America' },
}

function orgKeyForHost(host: string): string | null {
  if (host.includes('nuforc')) return 'nuforc'
  if (host.includes('nderf')) return 'nderf'
  if (host.includes('oberf')) return 'oberf'
  if (host.includes('adcrf')) return 'adcrf'
  if (host.includes('spr.')) return 'spr'
  if (host.includes('loc.gov') || host.includes('chroniclingamerica')) return 'chronicling'
  return null
}

function brandKeyForHost(host: string): string | null {
  if (host.includes('reddit')) return 'reddit'
  if (host.includes('youtube') || host === 'youtu.be') return 'youtube'
  if (host.includes('vimeo')) return 'vimeo'
  return null
}

export default function SourceLogo(props: { sourceUrl?: string | null; platform?: string | null; label?: string | null; className?: string }) {
  const host = hostOf(props.sourceUrl)
  const brandKey = brandKeyForHost(host) || (props.platform && BRAND[props.platform] ? props.platform : null)
  const orgKey = orgKeyForHost(host)
  const box = 'inline-flex items-center justify-center w-9 h-9 rounded-md flex-shrink-0 border ' + (props.className || '')

  if (brandKey && BRAND[brandKey]) {
    const b = BRAND[brandKey]
    return (
      <span className={box + ' bg-gray-950/60 border-gray-800'} title={b.label} aria-label={b.label}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill={b.color} aria-hidden="true"><path d={b.path} /></svg>
      </span>
    )
  }
  if (orgKey && ORG[orgKey]) {
    const o = ORG[orgKey]; const Icon = o.Icon
    return (
      <span className={box + ' ' + o.bg} title={o.label} aria-label={o.label}>
        <Icon className={'w-[18px] h-[18px] ' + o.tint} />
      </span>
    )
  }
  return (
    <span className={box + ' bg-gray-800 border-gray-700'} title={props.label || 'Source'} aria-label={props.label || 'Source'}>
      <Globe className="w-[18px] h-[18px] text-gray-300" />
    </span>
  )
}
