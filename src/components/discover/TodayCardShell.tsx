'use client'

/**
 * TodayCardShell — viewport-fit chrome for every Today (/discover) card.
 *
 * The shell enforces the mass-market readiness contract from the V2 panel
 * review:
 *   - Card is exactly viewport height. Never overflows.
 *   - Sticky bottom CTA bar — primary action always visible.
 *   - Body scrolls inside the card with a soft fade-mask.
 *   - Top-right chrome carries Save (bookmark) and Share icons that
 *     animate independently of the swipe gesture system.
 *   - Hero image (when supplied) sits behind a bottom-up gradient scrim
 *     for legibility.
 *   - Subtle category-tinted linear gradient (top-down ~22% alpha) on the
 *     full card surface for at-a-glance category recognition.
 *   - Next-card peek (4px strip of the next card's accent color visible
 *     at the very bottom edge) — reduces "did my swipe register?" anxiety.
 *
 * Children render the card-specific content (headline, chip strips, etc).
 * The shell handles all the Apple-News-tier chrome in one place.
 *
 * SWC: var, function expressions, string concat only.
 */

import React, { useEffect, useState } from 'react'
import { Bookmark, Share2 } from 'lucide-react'

interface TodayCardShellProps {
  catColor: string
  /** Optional category color of the next card — drives the bottom peek strip */
  nextCatColor?: string | null
  /** Optional hero image URL — rendered as a backdrop with bottom-up scrim */
  heroImageUrl?: string | null
  /** Optional subtle attribution text for the hero image */
  heroImageAttribution?: string | null
  /** Whether this card is currently saved (drives bookmark state) */
  isSaved: boolean
  /** Save toggle — fires haptic + bookmark fill animation */
  onSave: () => void
  /** Share via OS share sheet */
  onShare?: () => void
  /** Optional "Today's Lead Case" badge marker */
  isTodaysLead?: boolean
  /** Optional "Why you're seeing this" reason — surfaced via small (i) icon */
  whyReason?: string | null
  /** Sticky bottom CTA — receives "saved" tint when isSaved */
  cta: React.ReactNode
  /** Optional secondary action shown to the right of the primary CTA */
  ctaSecondary?: React.ReactNode
  /** Card body — should be a vertical flex column. Will scroll if it overflows. */
  children: React.ReactNode
}

export function TodayCardShell(props: TodayCardShellProps) {
  var [bookmarkPulse, setBookmarkPulse] = useState(false)
  var [shareOpen, setShareOpen] = useState(false)
  var [whyOpen, setWhyOpen] = useState(false)

  // Bookmark fill animation — fires every time isSaved goes true.
  useEffect(function () {
    if (props.isSaved) {
      setBookmarkPulse(true)
      var t = setTimeout(function () { setBookmarkPulse(false) }, 600)
      return function () { clearTimeout(t) }
    }
  }, [props.isSaved])

  function handleSaveClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation()
    e.preventDefault()
    // Haptic feedback (best-effort; silent on browsers without support).
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { (navigator as any).vibrate(35) } catch (_) {}
    }
    props.onSave()
  }

  function handleShareClick(e: React.MouseEvent | React.TouchEvent) {
    e.stopPropagation()
    e.preventDefault()
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { (navigator as any).vibrate(20) } catch (_) {}
    }
    if (props.onShare) {
      props.onShare()
    } else {
      setShareOpen(true)
    }
  }

  // Top-down linear gradient at 22% alpha for visible category color.
  // catColor is hex; we append alpha hex pair "38" (~22%) to the start.
  var gradientStyle = {
    backgroundImage:
      'linear-gradient(to bottom, ' + props.catColor + '38 0%, ' + props.catColor + '14 35%, transparent 65%)',
  }

  return (
    <div className="relative h-full w-full overflow-hidden font-sans">
      {/* Hero image backdrop — only when provided */}
      {props.heroImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'url(' + props.heroImageUrl + ')',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.32,
          }}
          aria-hidden="true"
        />
      )}

      {/* Hero scrim — bottom-up gradient mask for legibility */}
      {props.heroImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(10,10,20,0.35) 0%, rgba(10,10,20,0.6) 40%, rgba(10,10,20,0.95) 100%)',
          }}
          aria-hidden="true"
        />
      )}

      {/* Category color wash — visible 22% top-down (V2 review fix) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={gradientStyle}
        aria-hidden="true"
      />

      {/* Top-right chrome: Save + Share + Why-you-see-this */}
      <div className="absolute top-3 right-3 z-30 flex items-center gap-1.5">
        {props.whyReason && (
          <button
            type="button"
            onClick={function (e) { e.stopPropagation(); setWhyOpen(function (v) { return !v }) }}
            aria-label="Why you're seeing this card"
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/[0.05] backdrop-blur-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <span className="text-[11px] font-semibold">{'i'}</span>
          </button>
        )}
        {props.onShare !== undefined && (
          <button
            type="button"
            onClick={handleShareClick}
            aria-label="Share"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-white/[0.05] backdrop-blur-sm text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <Share2 className="w-4 h-4" />
          </button>
        )}
        <button
          type="button"
          onClick={handleSaveClick}
          aria-label={props.isSaved ? 'Unsave' : 'Save'}
          aria-pressed={props.isSaved}
          className={
            'w-9 h-9 flex items-center justify-center rounded-full backdrop-blur-sm transition-all duration-200 ' +
            (props.isSaved
              ? 'bg-amber-400/20 text-amber-300 hover:bg-amber-400/25'
              : 'bg-white/[0.05] text-gray-400 hover:text-white hover:bg-white/10')
            + (bookmarkPulse ? ' today-bookmark-pulse' : '')
          }
          style={props.isSaved ? { color: '#FFD166' } : undefined}
        >
          <Bookmark
            className="w-4 h-4"
            fill={props.isSaved ? 'currentColor' : 'none'}
            strokeWidth={props.isSaved ? 1 : 1.8}
          />
        </button>
      </div>

      {/* "Today's Lead Case" badge — top-left corner */}
      {props.isTodaysLead && (
        <div className="absolute top-3 left-3 z-30">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/20 border border-primary-400/40 text-[10px] font-sans font-semibold uppercase tracking-wider text-primary-200 backdrop-blur-sm">
            <span aria-hidden="true">{'✦'}</span>
            Today's lead
          </span>
        </div>
      )}

      {/* Body scroll region — fills available vertical space, scrolls within */}
      <div
        className="absolute inset-0 flex flex-col z-10"
        style={{ paddingTop: '54px', paddingBottom: '64px' }}
      >
        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5 sm:px-6 md:px-8 lg:px-10 today-card-body">
          {props.children}
        </div>
      </div>

      {/* Sticky bottom CTA bar — always visible regardless of body length */}
      <div
        className={
          'absolute bottom-0 left-0 right-0 z-20 px-3 sm:px-4 pt-2 pb-3 ' +
          'flex items-center gap-2 transition-colors duration-300 ' +
          (props.isSaved ? 'today-cta-saved' : '')
        }
        style={{
          background:
            'linear-gradient(to top, rgba(10,10,20,0.92) 0%, rgba(10,10,20,0.7) 60%, rgba(10,10,20,0) 100%)',
        }}
      >
        <div className="flex-1">{props.cta}</div>
        {props.ctaSecondary && <div className="flex-shrink-0">{props.ctaSecondary}</div>}
      </div>

      {/* Next-card peek — 4px sliver of the next card's category color
          at the very bottom edge of the viewport */}
      {props.nextCatColor && (
        <div
          className="absolute left-0 right-0 bottom-0 h-[4px] z-10 opacity-60"
          style={{ background: props.nextCatColor }}
          aria-hidden="true"
        />
      )}

      {/* Why-you-see-this popover */}
      {whyOpen && props.whyReason && (
        <div
          className="absolute top-14 right-3 z-40 max-w-[260px] px-3.5 py-2.5 rounded-lg bg-gray-900/95 border border-white/10 shadow-xl text-[12px] text-gray-200 font-sans leading-relaxed"
          onClick={function (e) { e.stopPropagation() }}
        >
          {props.whyReason}
        </div>
      )}

      {/* Optional inline-share fallback dialog (web shares may not be available) */}
      {shareOpen && (
        <div className="absolute inset-0 z-40 bg-black/70 backdrop-blur-sm flex items-end md:items-center justify-center" onClick={function () { setShareOpen(false) }}>
          <div className="w-full md:max-w-sm bg-gray-900 border-t md:border border-gray-700 rounded-t-2xl md:rounded-2xl p-5 text-center" onClick={function (e) { e.stopPropagation() }}>
            <p className="text-sm text-gray-300 font-sans mb-4">Sharing not available in this browser. Copy the link instead.</p>
            <button onClick={function () { setShareOpen(false) }} className="w-full py-2.5 rounded-lg bg-primary-600 hover:bg-primary-500 text-white text-sm font-medium transition-colors">Close</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default TodayCardShell
