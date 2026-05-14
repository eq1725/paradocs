/**
 * /api/og/report/[slug] — V10.8.G rewrite
 *
 * Open Graph share card (1200×630). Rendered server-side at edge by
 * next/og's Satori rasterizer. Used by every platform that scrapes
 * og:image (Twitter, iMessage, Slack, Discord, Facebook, Telegram,
 * LinkedIn, etc.) when a /report/[slug] URL is shared.
 *
 * V10.8.G — Complete redesign after V10.7.H and V10.8.F could not
 * fully eliminate title-meta overlap. SME panel reviewed (UI/UX,
 * Brand, Frontend Engineer/next-og, iMessage QA) and converged on:
 *
 *   1. ABSOLUTE POSITIONING for every element. Satori's flex layout
 *      has known bounding-box bugs with wrapped text at large fonts
 *      + negative letter-spacing — exactly the title case. Fixing
 *      every element at explicit (top, left, width, height) coords
 *      eliminates the collision class entirely. The card is 1200×630
 *      forever, so "responsive" isn't a constraint.
 *
 *   2. ZONE LAYOUT (top → bottom, 1200×630):
 *
 *      ┌──────────────────────────────────────────────────────────┐
 *      │  Paradocs.                          [● Psychological]    │  0-110  brand+category
 *      ├──┬───────────────────────────────────────────────────────┤
 *      │██│                                                       │
 *      │██│  Boy Survives Pit Bull Attack                         │  110-310  title hero
 *      │██│  with Severed Femoral Artery                          │           (color rail
 *      │██│                                                       │            on left =
 *      │██├───────────────────────────────────────────────────────┤            category)
 *      │██│  " The sky was extremely bright, and he heard         │
 *      │██│    his mother calling his name from across the        │  310-490  pull quote
 *      │██│    street before floating toward her open door. "     │
 *      ├──┴───────────────────────────────────────────────────────┤
 *      │  📅 2007  ·  📍 United States  ·  👤 1 witness           │  490-555  dateline
 *      ├──────────────────────────────────────────────────────────┤
 *      │  9 experiencers · 107 reports         Read on Paradocs → │  555-630  footer
 *      └──────────────────────────────────────────────────────────┘
 *
 *   3. CATEGORY AS COLOR RAIL not chip — Marcus Chen's point: the
 *      category should be a brand signal at a glance, not a UI
 *      widget. A 12px-wide vertical color rule on the left edge
 *      flanking the hero zone reads as "case file" stamp; the chip
 *      in the top-right is now compact text+dot only (no border).
 *
 *   4. PULL QUOTE AS TYPOGRAPHIC ANCHOR — Anya Patel's point: the
 *      witness quote is the click hook for paranormal content. We
 *      give it a large drop-quote in the brand purple, italic body
 *      copy, and breathing room above. Title is the "headline" but
 *      the quote does the emotional work.
 *
 *   5. COMPACT ICON-DATED DATELINE — Diego Ortega's point: iMessage
 *      downsamples aggressively. Labels "WHEN/WHERE/WHO" become mush.
 *      We drop the labels and use icons + bullets at 22pt minimum
 *      body weight so they stay legible after iMessage's
 *      decimation pass.
 *
 * History:
 *   V10.5    initial OG image
 *   V10.6.x  hierarchy tuning, font weights, glow + starfield
 *   V10.7.H  lineHeight 0.88 → 1.0 to fix collision (partial)
 *   V10.8.F  minHeight + tighter fonts to fix collision (still partial)
 *   V10.8.G  absolute positioning rewrite (real fix)
 */

import { ImageResponse } from 'next/og'
import type { NextRequest } from 'next/server'

export const config = {
  runtime: 'edge',
}

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

interface ReportRow {
  title?: string | null
  answer_line?: string | null
  category?: string | null
  event_date?: string | null
  event_date_precision?: 'exact' | 'day' | 'month' | 'year' | 'unknown' | null
  city?: string | null
  state_province?: string | null
  country?: string | null
  location_name?: string | null
  witness_count?: number | null
  paradocs_narrative?: string | null
  feed_hook?: string | null
  paradocs_assessment?: { pull_quote?: string | null } | null
}

const CATEGORY_DISPLAY: Record<string, string> = {
  ufos_aliens:               'UFOs & Aliens',
  cryptids:                  'Cryptids',
  ghosts_hauntings:          'Ghosts & Hauntings',
  psychic_phenomena:         'Psychic Phenomena',
  consciousness_practices:   'Consciousness',
  psychological_experiences: 'Psychological',
  biological_factors:        'Biological',
  perception_sensory:        'Perception',
  religion_mythology:        'Religion & Mythology',
  esoteric_practices:        'Esoteric Practices',
  combination:               'Other',
}

const CATEGORY_COLOR: Record<string, string> = {
  ufos_aliens:               '#4ade80',
  cryptids:                  '#fbbf24',
  ghosts_hauntings:          '#c084fc',
  psychic_phenomena:         '#60a5fa',
  consciousness_practices:   '#818cf8',
  psychological_experiences: '#f472b6',
  biological_factors:        '#a78bfa',
  perception_sensory:        '#22d3ee',
  religion_mythology:        '#fb923c',
  esoteric_practices:        '#a3e635',
  combination:               '#94a3b8',
}

// ── Card geometry (1200×630, all positions absolute) ─────────────

const CARD_W = 1200
const CARD_H = 630

// Left "category rail" is a 12px vertical color stripe occupying
// the height of the hero zone. Signals category at a glance per
// Marcus's redesign brief.
const RAIL_X = 64
const RAIL_W = 8
const RAIL_TOP = 110
const RAIL_BOTTOM = 490

// Content column sits to the right of the rail with consistent
// left padding. Right edge: 1200 - 64 = 1136 (64px right margin).
const CONTENT_X = RAIL_X + RAIL_W + 28   // 100
const CONTENT_W = CARD_W - CONTENT_X - 64 // 1036

// ── Font loader ─────────────────────────────────────────────────

async function loadGoogleFont(family: string, weight: number, style: string = 'normal'): Promise<ArrayBuffer | null> {
  try {
    const styleParam = style === 'italic' ? 'ital,wght@1,' + weight : 'wght@' + weight
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:${styleParam}`
    const cssResp = await fetch(cssUrl)
    if (!cssResp.ok) return null
    const css = await cssResp.text()
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"](opentype|truetype)['"]\)/)
    if (!match) return null
    const fontResp = await fetch(match[1])
    if (!fontResp.ok) return null
    return await fontResp.arrayBuffer()
  } catch {
    return null
  }
}

export default async function handler(req: NextRequest) {
  try {
    const { searchParams, pathname } = new URL(req.url)
    const slug = pathname.split('/').pop() || searchParams.get('slug') || ''
    if (!slug) return new Response('Missing slug', { status: 400 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return errorImage('Paradocs', 'Image unavailable')
    }

    const baseUrl = `${SUPABASE_URL.replace(/\/+$/, '')}`
    const reportUrl = `${baseUrl}/rest/v1/reports?slug=eq.${encodeURIComponent(slug)}&status=eq.approved&select=title,answer_line,category,event_date,event_date_precision,city,state_province,country,location_name,witness_count,paradocs_narrative,feed_hook,paradocs_assessment&limit=1`

    const [reportResp, reportsCountResp, profilesCountResp, changa500, changa700, changa800, inter400Italic] = await Promise.all([
      fetch(reportUrl, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY },
      }),
      fetch(`${baseUrl}/rest/v1/reports?status=eq.approved&select=id`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, Prefer: 'count=exact', Range: '0-0' },
      }).catch(() => null),
      fetch(`${baseUrl}/rest/v1/profiles?select=id`, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + SUPABASE_ANON_KEY, Prefer: 'count=exact', Range: '0-0' },
      }).catch(() => null),
      loadGoogleFont('Changa', 500),
      loadGoogleFont('Changa', 700),
      loadGoogleFont('Changa', 800),
      // Italic serif for the pull-quote. Per Marcus's brief — gives
      // the quote typographic presence distinct from the headline.
      loadGoogleFont('Lora', 500, 'italic'),
    ])

    if (!reportResp.ok) return errorImage('Paradocs', 'Report not found')
    const rows = (await reportResp.json()) as ReportRow[]
    if (!rows || rows.length === 0) return errorImage('Paradocs', 'Report not found')

    const r = rows[0]

    // ── Content extraction ────────────────────────────────────────
    //
    // Title: cap at 80 chars (down from V10.8.F's 90) so the hero
    // zone never needs more than 2 lines at the worst-case font.
    const rawTitle = r.title || 'Untitled report'
    const title = rawTitle.length > 80
      ? rawTitle.slice(0, 77).replace(/\s+\S*$/, '').trimEnd() + '…'
      : rawTitle

    const pullQuote = (r.paradocs_assessment && r.paradocs_assessment.pull_quote) || ''
    const fallbackBody = r.answer_line || r.feed_hook || (r.paradocs_narrative || '').slice(0, 180) || ''
    // Trim the body for the quote zone. Cap at 200 chars to leave
    // breathing room — anything longer becomes unreadable at this
    // size on iMessage previews.
    const quoteText = (pullQuote || fallbackBody || '').slice(0, 200).trim()

    const cat = r.category || 'combination'
    const catLabel = CATEGORY_DISPLAY[cat] || 'Paranormal'
    const catColor = CATEGORY_COLOR[cat] || '#94a3b8'

    const whenStr = formatWhen(r.event_date, r.event_date_precision)
    const whereStr = formatWhere(r)
    const whoStr = formatWho(r)

    // Stats for footer
    const parseRange = (resp: Response | null): number | null => {
      if (!resp) return null
      const cr = resp.headers.get('content-range')
      if (!cr) return null
      const totalStr = cr.split('/')[1]
      const n = parseInt(totalStr, 10)
      return Number.isFinite(n) ? n : null
    }
    const totalReports = parseRange(reportsCountResp)
    const totalProfiles = parseRange(profilesCountResp)
    const compact = (n: number): string => {
      if (n >= 10000) return Math.round(n / 1000).toLocaleString() + 'K'
      return n.toLocaleString()
    }

    const hexToRgba = (hex: string, alpha: number): string => {
      const clean = hex.replace('#', '')
      const rv = parseInt(clean.slice(0, 2), 16)
      const gv = parseInt(clean.slice(2, 4), 16)
      const bv = parseInt(clean.slice(4, 6), 16)
      return `rgba(${rv},${gv},${bv},${alpha})`
    }

    // ── Title sizing: explicit two-line budget ────────────────────
    //
    // Title font sized so 2 lines always fit inside RAIL_TOP →
    // 110 + 165 = 275 (165px is our title zone). We deliberately
    // round DOWN so we never overflow into the pull-quote zone.
    const titleFontSize = title.length > 60 ? 52 : title.length > 40 ? 60 : 68
    // Title block fixed height regardless of actual wrap — gives
    // Satori no room to under-measure.
    const TITLE_TOP = 130
    const TITLE_HEIGHT = 165

    // Quote sizing — same defensive approach.
    const quoteFontSize = quoteText.length > 140 ? 26 : quoteText.length > 90 ? 30 : 34
    const QUOTE_TOP = 320
    const QUOTE_HEIGHT = 160

    // Dateline (single horizontal line with icons + bullet separators)
    const DATELINE_Y = 510

    // Footer (single line at the bottom, social proof + CTA)
    const FOOTER_Y = 575

    return new ImageResponse(
      (
        <div
          style={{
            width: CARD_W,
            height: CARD_H,
            display: 'flex',
            position: 'relative',
            background: 'linear-gradient(135deg, #0a0a14 0%, #16091f 50%, #1a0a24 100%)',
            color: '#f1f1f8',
            fontFamily: 'Changa, -apple-system, system-ui, sans-serif',
            overflow: 'hidden',
          }}
        >
          {/* Atmosphere glow — bottom-left, category-tinted. Subtle
              vs V10.6 to keep the layout grid clean. */}
          <div
            style={{
              position: 'absolute',
              left: -200,
              bottom: -120,
              width: 900,
              height: 700,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${hexToRgba(catColor, 0.42)}, transparent 70%)`,
              display: 'flex',
            }}
          />

          {/* Category rail — vertical color stripe on the left edge
              flanking the hero zone. Marcus's "case file stamp" brief. */}
          <div
            style={{
              position: 'absolute',
              left: RAIL_X,
              top: RAIL_TOP,
              width: RAIL_W,
              height: RAIL_BOTTOM - RAIL_TOP,
              background: `linear-gradient(180deg, ${catColor} 0%, ${hexToRgba(catColor, 0.35)} 100%)`,
              borderRadius: 4,
              display: 'flex',
            }}
          />

          {/* Top strip: Paradocs wordmark (left) + category text (right).
              Both at fixed Y = 50 baseline. */}
          <div
            style={{
              position: 'absolute',
              left: 64,
              top: 50,
              display: 'flex',
              alignItems: 'baseline',
            }}
          >
            <span style={{
              display: 'flex',
              fontSize: 48,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.015em',
              lineHeight: 1,
            }}>Paradocs</span>
            <span style={{
              display: 'flex',
              fontSize: 48,
              fontWeight: 800,
              color: '#a855f7',
              lineHeight: 1,
              marginLeft: 2,
            }}>.</span>
          </div>

          {/* Category tag — compact, dot + text, no border. Top-right. */}
          <div
            style={{
              position: 'absolute',
              right: 64,
              top: 62,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <span style={{
              display: 'flex',
              width: 12,
              height: 12,
              borderRadius: '50%',
              background: catColor,
              boxShadow: `0 0 12px ${hexToRgba(catColor, 0.7)}`,
            }} />
            <span style={{
              display: 'flex',
              fontSize: 22,
              fontWeight: 700,
              color: '#e5e7eb',
              letterSpacing: '0.02em',
            }}>{catLabel}</span>
          </div>

          {/* TITLE — fixed-height block. Two-line budget guaranteed
              by font sizing + explicit height. */}
          <div
            style={{
              position: 'absolute',
              left: CONTENT_X,
              top: TITLE_TOP,
              width: CONTENT_W,
              height: TITLE_HEIGHT,
              display: 'flex',
              alignItems: 'flex-start',
              fontSize: titleFontSize,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.025em',
              lineHeight: 1.08,
              overflow: 'hidden',
            }}
          >
            {title}
          </div>

          {/* Thin divider between title and quote — sits at fixed Y. */}
          <div
            style={{
              position: 'absolute',
              left: CONTENT_X,
              top: 300,
              width: 80,
              height: 2,
              background: hexToRgba(catColor, 0.6),
              display: 'flex',
            }}
          />

          {/* PULL QUOTE — fixed-height block. Italic, with a big
              drop-quote in the brand purple. */}
          {quoteText && (
            <div
              style={{
                position: 'absolute',
                left: CONTENT_X,
                top: QUOTE_TOP,
                width: CONTENT_W,
                height: QUOTE_HEIGHT,
                display: 'flex',
                alignItems: 'flex-start',
                overflow: 'hidden',
              }}
            >
              <span style={{
                display: 'flex',
                fontSize: 90,
                fontWeight: 800,
                color: '#a855f7',
                lineHeight: 0.7,
                marginRight: 16,
                marginTop: 12,
                fontFamily: 'Changa, sans-serif',
              }}>&ldquo;</span>
              <span style={{
                display: 'flex',
                flex: 1,
                fontSize: quoteFontSize,
                fontWeight: 500,
                fontStyle: 'italic',
                lineHeight: 1.32,
                color: '#e5e7eb',
                fontFamily: inter400Italic ? 'Lora, Georgia, serif' : 'Changa, sans-serif',
              }}>{quoteText}</span>
            </div>
          )}

          {/* DATELINE — single horizontal line with icons + bullet
              separators. No labels (Diego's brief: iMessage
              decimation kills small label text). 22pt floor. */}
          <div
            style={{
              position: 'absolute',
              left: CONTENT_X,
              top: DATELINE_Y,
              right: 64,
              display: 'flex',
              alignItems: 'center',
              gap: 18,
              fontSize: 22,
              fontWeight: 700,
              color: '#ffffff',
            }}
          >
            {whenStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                  <rect x="2" y="4" width="16" height="16" rx="2" stroke="#fcd34d" strokeWidth="1.8" fill="rgba(252,211,77,0.12)" />
                  <path d="M2 9 H18" stroke="#fcd34d" strokeWidth="1.8" />
                  <path d="M7 2 V6" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M13 2 V6" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span style={{ display: 'flex' }}>{whenStr}</span>
              </div>
            )}
            {whenStr && whereStr && <span style={{ display: 'flex', color: '#475569', fontSize: 22 }}>·</span>}
            {whereStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="20" height="22" viewBox="0 0 20 22" fill="none">
                  <path d="M10 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" stroke="#6ee7b7" strokeWidth="1.8" fill="rgba(110,231,183,0.14)" />
                  <circle cx="10" cy="9" r="2.7" fill="#6ee7b7" />
                </svg>
                <span style={{ display: 'flex' }}>{whereStr}</span>
              </div>
            )}
            {whereStr && whoStr && <span style={{ display: 'flex', color: '#475569', fontSize: 22 }}>·</span>}
            {whoStr && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                  <circle cx="11" cy="7" r="3.4" stroke="#67e8f9" strokeWidth="1.8" fill="rgba(103,232,249,0.14)" />
                  <path d="M4 19c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
                <span style={{ display: 'flex' }}>{whoStr}</span>
              </div>
            )}
          </div>

          {/* FOOTER — social proof on left, CTA on right. Fixed Y.
              Above the bottom edge so iMessage can't crop it. */}
          <div
            style={{
              position: 'absolute',
              left: 64,
              right: 64,
              top: FOOTER_Y,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderTop: '1px solid rgba(255,255,255,0.10)',
              paddingTop: 14,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, fontWeight: 500, color: '#94a3b8' }}>
              {totalProfiles && totalProfiles > 0 ? (
                <span style={{ display: 'flex' }}>{compact(totalProfiles)} experiencers</span>
              ) : null}
              {totalProfiles && totalReports ? (
                <span style={{ display: 'flex', color: '#475569' }}>·</span>
              ) : null}
              {totalReports && totalReports > 0 ? (
                <span style={{ display: 'flex' }}>{compact(totalReports)} reports archived</span>
              ) : null}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 20, fontWeight: 700, color: '#ffffff' }}>
              <span style={{ display: 'flex' }}>Read on Paradocs</span>
              <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
                <path d="M3 9 H15 M10 4 L15 9 L10 14" stroke="#a855f7" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
          </div>
        </div>
      ),
      {
        width: CARD_W,
        height: CARD_H,
        fonts: [
          ...(changa500 ? [{ name: 'Changa' as const, data: changa500, weight: 500 as const, style: 'normal' as const }] : []),
          ...(changa700 ? [{ name: 'Changa' as const, data: changa700, weight: 700 as const, style: 'normal' as const }] : []),
          ...(changa800 ? [{ name: 'Changa' as const, data: changa800, weight: 800 as const, style: 'normal' as const }] : []),
          ...(inter400Italic ? [{ name: 'Lora' as const, data: inter400Italic, weight: 500 as const, style: 'italic' as const }] : []),
        ],
      },
    )
  } catch (err: any) {
    console.error('[og report] error:', err)
    return errorImage('Paradocs', 'Image error')
  }
}

// ── Helpers ─────────────────────────────────────────────────────

function errorImage(headline: string, sub: string): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'linear-gradient(135deg, #0a0a14 0%, #1a0a24 100%)',
          fontFamily: 'Changa, -apple-system, system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline' }}>
          <span style={{ fontSize: 72, fontWeight: 800, color: '#ffffff' }}>{headline}</span>
          <span style={{ fontSize: 72, fontWeight: 800, color: '#a855f7' }}>.</span>
        </div>
        <div style={{ fontSize: 28, color: '#cbd5e1', marginTop: 18 }}>{sub}</div>
      </div>
    ),
    { width: 1200, height: 630 },
  )
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function formatWhen(
  raw?: string | null,
  precision?: 'exact' | 'day' | 'month' | 'year' | 'unknown' | null,
): string | null {
  if (!raw) return null
  const t = raw.trim()
  if (precision === 'year') {
    const ym = t.match(/^(\d{4})/)
    return ym ? ym[1] : t
  }
  if (precision === 'month') {
    const mm = t.match(/^(\d{4})-(\d{2})/)
    if (mm) return `${MONTHS[Number(mm[2]) - 1]} ${Number(mm[1])}`
    return t
  }
  if (precision === 'exact' || precision === 'day') {
    const dm = t.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (dm) return `${MONTHS[Number(dm[2]) - 1]} ${Number(dm[3])}, ${Number(dm[1])}`
    return t
  }
  if (precision === 'unknown') return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split('-').map(Number)
    if (m === 1 && d === 1) return String(y)
    return `${MONTHS[m - 1]} ${d}, ${y}`
  }
  if (/^\d{4}-\d{2}$/.test(t)) {
    const [y, m] = t.split('-').map(Number)
    return `${MONTHS[m - 1]} ${y}`
  }
  if (/^\d{4}$/.test(t)) return t
  return t
}

function formatWhere(r: ReportRow): string | null {
  const parts: string[] = []
  if (r.city) parts.push(r.city)
  if (r.state_province) parts.push(r.state_province)
  if (parts.length === 0 && r.country) return r.country
  // For the dateline single-line layout, omit country when we already
  // have city/state — keeps the line scannable on small previews.
  if (r.country && r.country !== 'United States' && r.country !== 'USA' && parts.length === 0) {
    parts.push(r.country)
  }
  if (parts.length > 0) return parts.join(', ')
  return r.location_name || null
}

function formatWho(r: ReportRow): string | null {
  const wc = typeof r.witness_count === 'number' ? r.witness_count : null
  if (wc && wc > 1) return wc + ' witnesses'
  if (wc === 1) return '1 witness'
  return null
}
