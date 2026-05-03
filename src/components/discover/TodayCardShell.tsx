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
  /** Optional streak day — if set and user has streak, the badge upgrades
   *  to "Today's lead · day N". Cross-cutting V5 panel review item. */
  streakDays?: number
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
      {/* Hero image backdrop — only when provided. 0.28 keeps the image
          present without overpowering the dossier text layer. */}
      {props.heroImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage: 'url(' + props.heroImageUrl + ')',
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.28,
          }}
          aria-hidden="true"
        />
      )}

      {/* Hero scrim — heavier at top + middle for unambiguous headline
          legibility, lifts only at the bottom 25% to let imagery breathe. */}
      {props.heroImageUrl && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(to bottom, rgba(10,10,20,0.55) 0%, rgba(10,10,20,0.78) 40%, rgba(10,10,20,0.95) 75%, rgba(10,10,20,0.98) 100%)',
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

      {/* Top-right chrome: Save + Share + Why-you-see-this.
          V6.9: bumped to z-50 so it always wins the stacking order against
          the sticky TodayHeader (z-30) — needed because in iOS PWA the
          page can scroll a few pixels which pins the header over the
          card pane top, hiding chrome that's only z-30. */}
      <div className="absolute top-3 right-3 z-50">
        <div className="flex items-center gap-0.5 rounded-full bg-black/35 backdrop-blur-md border border-white/10 px-1 py-1">
          {props.whyReason && (
            <button
              type="button"
              onClick={function (e) { e.stopPropagation(); setWhyOpen(function (v) { return !v }) }}
              aria-label="Why you're seeing this card"
              className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              <span className="text-[11px] font-semibold">{'i'}</span>
            </button>
          )}
          {props.onShare !== undefined && (
            <button
              type="button"
              onClick={handleShareClick}
              aria-label="Share"
              className="w-8 h-8 flex items-center justify-center rounded-full text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
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
              'w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 ' +
              (props.isSaved
                ? 'text-amber-300 hover:bg-white/10'
                : 'text-gray-400 hover:text-white hover:bg-white/10')
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
      </div>

      {/* Hero image attribution (V5 #5) — tiny credit in the bottom-right
          corner just above the CTA region. Required for Wikimedia / CC content. */}
      {props.heroImageUrl && props.heroImageAttribution && (
        <div
          className="absolute right-3 z-10 today-cta-anchor pointer-events-none"
          style={{ marginBottom: '64px' }}
        >
          <span className="text-[9px] text-gray-400/70 italic font-sans">
            {props.heroImageAttribution}
          </span>
        </div>
      )}

      {/* "Today's Lead" badge — top-left corner. V5: enriched with streak
          context when the user has a 2+ day streak. V6.9: z-50 to match chrome. */}
      {props.isTodaysLead && (
        <div className="absolute top-3 left-3 z-50">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary-500/20 border border-primary-400/40 text-[10px] font-sans font-semibold uppercase tracking-wider text-primary-200 backdrop-blur-sm">
            <span aria-hidden="true">{'✦'}</span>
            {(typeof props.streakDays === 'number' && props.streakDays >= 2)
              ? 'Today’s lead · day ' + props.streakDays
              : 'Today’s lead'}
          </span>
        </div>
      )}

      {/* Body scroll region — V6.9: pt bumped 60 → 96 so the badge row
          stays well below the chrome cluster (which sits at top-3 = ~12px
          + ~36px tall = bottom edge ~48px). 96px gives 48px clearance below
          the chrome plus buffer for any TodayHeader scroll-under bleed. */}
      <div
        className="absolute inset-0 flex flex-col z-10 pt-[96px] pb-[calc(180px+env(safe-area-inset-bottom,0px))] md:pb-[60px]"
      >
        <div
          className="flex-1 min-h-0 overflow-y-auto px-5 sm:px-6 md:px-8 lg:px-10 today-card-body"
          style={{ overscrollBehavior: 'none' }}
        >
          {props.children}
        </div>
      </div>

      {/* Sticky bottom CTA bar — V5: uses today-cta-anchor class (defined in
          globals.css) which encodes the mobile vs md+ bottom positions via
          a media query, so the calc() always applies on mobile and snaps to
          0 on desktop. Tighter pt-1.5 pb-2 reduces vertical footprint. */}
      <div
        className={
          'absolute left-0 right-0 z-20 px-3 sm:px-4 pt-1.5 pb-2 md:pb-3 ' +
          'today-cta-anchor flex items-center gap-2 transition-colors duration-300 ' +
          (props.isSaved ? 'today-cta-saved' : '')
        }
        style={{
          background:
            'linear-gradient(to top, rgba(10,10,20,0.97) 0%, rgba(10,10,20,0.82) 55%, rgba(10,10,20,0) 100%)',
        }}
      >
        <div className="flex-1">{props.cta}</div>
        {props.ctaSecondary && <div className="flex-shrink-0">{props.ctaSecondary}</div>}
      </div>

      {/* Next-card peek — 4px sliver of the next card's category color.
          Same anchor class as the CTA so it stays just above the tab nav
          on mobile and at the viewport edge on desktop. */}
      {props.nextCatColor && (
        <div
          className="absolute left-0 right-0 h-[4px] z-10 opacity-60 today-cta-anchor"
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
