/**
 * /api/og/report/[slug] — V10.5
 *
 * Server-rendered Open Graph image for any /report/[slug]. Used
 * by Twitter, iMessage, Slack, Discord, Facebook, Telegram, etc.
 * when someone shares a Paradocs report link.
 *
 * Runtime: edge (required by next/og's ImageResponse).
 *
 * Layout (1200x630 — Twitter / Facebook standard):
 *   - Dark gradient background
 *   - Paradocs wordmark top-left
 *   - Category chip top-right
 *   - Title (2 lines max, large)
 *   - Three-row meta: WHEN, WHERE, WHO
 *   - Answer-line as the bottom kicker
 *
 * Data: fetched via Supabase REST from the report row. We use
 * the anon key (RLS-gated) so this image route doesn't need
 * the service key. Status=approved reports only.
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
  city?: string | null
  state_province?: string | null
  country?: string | null
  location_name?: string | null
  witness_count?: number | null
  paradocs_narrative?: string | null
  feed_hook?: string | null
}

// V10.6.2 — friendly labels match what the rest of the app shows
// (CATEGORY_CONFIG[slug].label). Was rendering as truncated short
// labels — "Psychic" instead of "Psychic Phenomena", etc.
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

/**
 * V10.6.7 — load Google Fonts at edge runtime.
 *
 * Why we load both Changa AND Inter:
 *   When you pass exactly ONE custom font to next/og's ImageResponse,
 *   Satori uses that font as the default for EVERY element — there is
 *   no "Inter" baked in. So if we only load Changa, every label,
 *   title, and chip on the card ends up in Changa, which is way too
 *   heavy for body copy and blows out the layout.
 *
 * The canonical Vercel/next-og pattern:
 *   - No User-Agent header (Google serves CSS with multiple
 *     @font-face blocks for older clients).
 *   - Regex matches format('opentype'|'truetype') specifically so we
 *     pull the TTF/OTF binary — Satori decodes those reliably (woff2
 *     decoding is hit-or-miss).
 */
async function loadGoogleFont(family: string, weight: number): Promise<ArrayBuffer | null> {
  try {
    const cssUrl = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weight}`
    const cssResp = await fetch(cssUrl)
    if (!cssResp.ok) {
      console.warn(`[og report] ${family} CSS fetch non-200:`, cssResp.status)
      return null
    }
    const css = await cssResp.text()
    const match = css.match(/src:\s*url\(([^)]+)\)\s*format\(['"](opentype|truetype)['"]\)/)
    if (!match) {
      console.warn(`[og report] No truetype/opentype @font-face found in ${family} CSS`)
      return null
    }
    const fontResp = await fetch(match[1])
    if (!fontResp.ok) {
      console.warn(`[og report] ${family} font binary fetch non-200:`, fontResp.status)
      return null
    }
    return await fontResp.arrayBuffer()
  } catch (err) {
    console.warn(`[og report] ${family} load failed:`, err)
    return null
  }
}

export default async function handler(req: NextRequest) {
  try {
    const { searchParams, pathname } = new URL(req.url)
    // Edge runtime — query.slug isn't available; pull from path.
    const slug = pathname.split('/').pop() || searchParams.get('slug') || ''
    if (!slug) return new Response('Missing slug', { status: 400 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return errorImage('Paradocs', 'Image unavailable')
    }

    const baseUrl = `${SUPABASE_URL.replace(/\/+$/, '')}`
    const reportUrl = `${baseUrl}/rest/v1/reports?slug=eq.${encodeURIComponent(slug)}&status=eq.approved&select=title,answer_line,category,event_date,city,state_province,country,location_name,witness_count,paradocs_narrative,feed_hook&limit=1`

    // V10.6.8 — fetch everything in parallel. We now load Changa at
    // three weights so the entire card can render in the brand
    // family with proper typographic hierarchy:
    //   - 500 : body weight (answer-line quote, social-proof strip)
    //   - 700 : sub-headers + labels (title, WHEN/WHERE/WHO facts)
    //   - 800 : hero weight (the wordmark)
    const [reportResp, reportsCountResp, profilesCountResp, changa500, changa700, changa800] = await Promise.all([
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
    ])

    if (!reportResp.ok) return errorImage('Paradocs', 'Report not found')
    const rows = (await reportResp.json()) as ReportRow[]
    if (!rows || rows.length === 0) return errorImage('Paradocs', 'Report not found')

    const r = rows[0]
    const title = (r.title || 'Untitled report').slice(0, 120)
    const answer = (r.answer_line || r.feed_hook || (r.paradocs_narrative || '').slice(0, 180) || '').slice(0, 200)

    const cat = r.category || 'combination'
    const catLabel = CATEGORY_DISPLAY[cat] || 'Paranormal'
    const catColor = CATEGORY_COLOR[cat] || '#94a3b8'

    const whenStr = formatWhen(r.event_date)
    const whereStr = formatWhere(r)
    const whoStr = formatWho(r)

    // Pull totals from the Content-Range header ('0-0/12345' → 12345).
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

    // Format a number with thousands separator for the social-proof strip.
    const compact = (n: number): string => {
      if (n >= 10000) return Math.round(n / 1000).toLocaleString() + 'K'
      return n.toLocaleString()
    }

    // Category color → rgba for the radial glow behind the title.
    const hexToRgba = (hex: string, alpha: number): string => {
      const clean = hex.replace('#', '')
      const rv = parseInt(clean.slice(0, 2), 16)
      const gv = parseInt(clean.slice(2, 4), 16)
      const bv = parseInt(clean.slice(4, 6), 16)
      return `rgba(${rv},${gv},${bv},${alpha})`
    }
    const glowColor = hexToRgba(catColor, 0.28)

    // V10.6.8 panel round 2 — starfield. Eight tiny faint dots
    // scattered around the card add anomaly-archive atmosphere
    // without competing with text. Deterministic positions so the
    // card is stable across renders.
    const STARS: Array<{ x: number; y: number; size: number; opacity: number }> = [
      { x: 95,   y: 195,  size: 3, opacity: 0.55 },
      { x: 165,  y: 545,  size: 2, opacity: 0.4 },
      { x: 760,  y: 92,   size: 2, opacity: 0.45 },
      { x: 1050, y: 175,  size: 3, opacity: 0.5 },
      { x: 1110, y: 420,  size: 2, opacity: 0.4 },
      { x: 360,  y: 95,   size: 2, opacity: 0.35 },
      { x: 990,  y: 540,  size: 3, opacity: 0.5 },
      { x: 530,  y: 565,  size: 2, opacity: 0.35 },
    ]

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            position: 'relative',
            background: 'linear-gradient(135deg, #0a0a14 0%, #1a0a24 100%)',
            color: '#f1f1f8',
            // V10.6.10 — tighter padding so the content has more
            // breathing room internally without needing more pixels.
            padding: '44px 64px',
            fontFamily: 'Changa, -apple-system, system-ui, sans-serif',
          }}
        >
          {/* V10.6.8 — Starfield atmosphere. Tiny dots scattered
              behind the content. Reinforces 'anomaly archive' vibe
              without competing with text. */}
          {STARS.map((s, i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                borderRadius: '50%',
                background: `rgba(255,255,255,${s.opacity})`,
                display: 'flex',
              }}
            />
          ))}

          {/* V10.6.11 — Glow goes more dramatic per panel — bumped
              from 0.45 → 0.6, and added a SECOND smaller hot-spot
              glow at the top-right to balance the diagonal weight
              and fill the previously empty zone. */}
          <div
            style={{
              position: 'absolute',
              left: -120,
              bottom: -60,
              width: 950,
              height: 720,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${hexToRgba(catColor, 0.6)}, transparent 70%)`,
              display: 'flex',
            }}
          />
          <div
            style={{
              position: 'absolute',
              right: -180,
              top: -150,
              width: 540,
              height: 540,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${hexToRgba(catColor, 0.22)}, transparent 70%)`,
              display: 'flex',
            }}
          />

          {/* V10.6.11 — Wordmark pushed back up to 60pt for hero
              presence per panel ('looks tentative at 56'). With
              V10.6.10's tighter line-height + margins below, the
              extra 4pt no longer crowds the title. */}
          <div style={{ display: 'flex', alignItems: 'baseline', position: 'relative' }}>
            <span style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 800,
              color: '#ffffff',
              letterSpacing: '-0.015em',
              lineHeight: 1,
            }}>
              Paradocs
            </span>
            <span style={{
              display: 'flex',
              fontSize: 60,
              fontWeight: 800,
              color: '#a855f7',
              lineHeight: 1,
              marginLeft: 2,
            }}>
              .
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              flex: 1,
              justifyContent: 'flex-start',
              // V10.6.10 — pull the title block UP closer to the
              // wordmark. The earlier 36px gap felt loose.
              marginTop: 22,
              position: 'relative',
            }}
          >
            {/* V10.6.12 — Line-height tightened further 0.94 → 0.88.
                At 70pt Changa, 0.94 still left visible daylight
                between wrapped lines. 0.88 binds the two lines so
                they read as a single typographic block — the
                descenders of one line nearly touch the ascenders
                of the next, which is the visual cue the eye uses
                to register 'connected sentence' vs 'two lines'. */}
            <div
              style={{
                display: 'flex',
                fontSize: title.length > 90 ? 48 : title.length > 60 ? 58 : 70,
                fontWeight: 800,
                lineHeight: 0.88,
                color: '#ffffff',
                letterSpacing: '-0.025em',
                marginBottom: 26,
              }}
            >
              {title}
            </div>

            {/* Stacked WHEN/WHERE/WHO meta */}
            <div style={{ display: 'flex', gap: 44, alignItems: 'flex-start' }}>
              {whenStr && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#fcd34d', letterSpacing: '0.14em' }}>WHEN</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, color: '#ffffff' }}>
                    {/* V10.6.8 — Calendar icon parallels WHERE's map pin */}
                    <svg width="22" height="24" viewBox="0 0 20 22" fill="none">
                      <rect x="2" y="4" width="16" height="16" rx="2" stroke="#fcd34d" strokeWidth="1.8" fill="rgba(252,211,77,0.14)" />
                      <path d="M2 9 H18" stroke="#fcd34d" strokeWidth="1.8" />
                      <path d="M7 2 V6" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round" />
                      <path d="M13 2 V6" stroke="#fcd34d" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {whenStr}
                  </span>
                </div>
              )}
              {whereStr && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#6ee7b7', letterSpacing: '0.14em' }}>WHERE</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, color: '#ffffff' }}>
                    <svg width="22" height="24" viewBox="0 0 20 22" fill="none">
                      <path d="M10 21s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12z" stroke="#6ee7b7" strokeWidth="1.8" fill="rgba(110,231,183,0.18)" />
                      <circle cx="10" cy="9" r="2.7" fill="#6ee7b7" />
                    </svg>
                    {whereStr}
                  </span>
                </div>
              )}
              {whoStr && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span style={{ fontSize: 17, fontWeight: 700, color: '#67e8f9', letterSpacing: '0.14em' }}>WHO</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 24, fontWeight: 700, color: '#ffffff' }}>
                    {/* People-cluster icon — parallels WHEN/WHERE */}
                    <svg width="24" height="24" viewBox="0 0 22 22" fill="none">
                      <circle cx="11" cy="7" r="3.4" stroke="#67e8f9" strokeWidth="1.8" fill="rgba(103,232,249,0.16)" />
                      <path d="M4 19c0-3.3 3.1-6 7-6s7 2.7 7 6" stroke="#67e8f9" strokeWidth="1.8" strokeLinecap="round" />
                    </svg>
                    {whoStr}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom row: drop-quote answer line on LEFT,
              category chip on RIGHT (diagonal balance).
              V10.6.10 — margin-top tightened 12 → 6 since the
              middle container now stacks from flex-start. */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              gap: 28,
              marginTop: 6,
            }}
          >
            {answer ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  flex: 1,
                  maxWidth: 760,
                  position: 'relative',
                }}
              >
                {/* V10.6.11 — Drop-quote mark bumped 72 → 84pt
                    to balance the larger title above. */}
                <span style={{
                  display: 'flex',
                  fontSize: 84,
                  fontWeight: 800,
                  color: '#a855f7',
                  lineHeight: 0.7,
                  marginRight: 14,
                  marginTop: -6,
                }}>
                  &ldquo;
                </span>
                <span
                  style={{
                    display: 'flex',
                    fontSize: 24,
                    fontWeight: 500,
                    lineHeight: 1.28,
                    color: '#e5e7eb',
                  }}
                >
                  {answer}
                </span>
              </div>
            ) : (
              <div style={{ display: 'flex', flex: 1 }} />
            )}

            {/* V10.6.11 — Category chip switched from outlined to
                tinted-fill. The thin border was reading as a UI
                widget; the tinted fill reads as a brand chip and
                holds its weight against the larger drop-quote
                to its left. */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 18px',
                borderRadius: 999,
                border: `1.5px solid ${hexToRgba(catColor, 0.55)}`,
                background: hexToRgba(catColor, 0.18),
                flexShrink: 0,
              }}
            >
              <span style={{ display: 'flex', width: 10, height: 10, borderRadius: '50%', background: catColor }} />
              <span style={{ display: 'flex', fontSize: 19, fontWeight: 700, color: '#ffffff' }}>{catLabel}</span>
            </div>
          </div>

          {/* V10.6.8 — Social proof strip. Bumped legibility from
              #94a3b8 → #cbd5e1 per panel ('whispery'). Added 'Read
              on Paradocs →' clickable affordance on the right so
              the card screams 'click me'. */}
          {(totalReports || totalProfiles) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginTop: 14,
                paddingTop: 12,
                borderTop: '1px solid rgba(255,255,255,0.10)',
                fontSize: 16,
                color: '#cbd5e1',
                fontWeight: 500,
                letterSpacing: '0.03em',
              }}
            >
              {totalProfiles && totalProfiles > 0 && (
                <span style={{ display: 'flex' }}>{compact(totalProfiles)} experiencers</span>
              )}
              {totalProfiles && totalReports && (
                <span style={{ display: 'flex', color: '#475569' }}>·</span>
              )}
              {totalReports && totalReports > 0 && (
                <span style={{ display: 'flex' }}>{compact(totalReports)} reports archived</span>
              )}
              <span style={{ display: 'flex', flex: 1 }} />
              {/* V10.6.11 — CTA pulled forward. Bigger text, purple
                  accent, larger arrow — reads as a clear call-to-tap
                  on every share platform that renders OG cards. */}
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f1f1f8', fontSize: 18, fontWeight: 700 }}>
                Read on Paradocs
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 9 H15 M10 4 L15 9 L10 14" stroke="#a855f7" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </div>
          )}
        </div>
      ),
      {
        width: 1200,
        height: 630,
        // V10.6.8 — pass Changa at three weights so the whole card
        // renders in the brand family with proper hierarchy.
        // Satori picks the closest weight per element.
        fonts: [
          ...(changa500 ? [{ name: 'Changa' as const, data: changa500, weight: 500 as const, style: 'normal' as const }] : []),
          ...(changa700 ? [{ name: 'Changa' as const, data: changa700, weight: 700 as const, style: 'normal' as const }] : []),
          ...(changa800 ? [{ name: 'Changa' as const, data: changa800, weight: 800 as const, style: 'normal' as const }] : []),
        ],
      },
    )
  } catch (err: any) {
    console.error('[og report] error:', err)
    return errorImage('Paradocs', 'Image error')
  }
}

// ── Helpers ─────────────────────────────────────────────────

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
          fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
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

function formatWhen(raw?: string | null): string | null {
  if (!raw) return null
  const t = raw.trim()
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
  if (r.country && r.country !== 'United States' && r.country !== 'USA') parts.push(r.country)
  if (parts.length > 0) return parts.join(', ')
  return r.location_name || null
}

function formatWho(r: ReportRow): string | null {
  const wc = typeof r.witness_count === 'number' ? r.witness_count : null
  if (wc && wc > 1) return wc + ' witnesses'
  if (wc === 1) return 'A single witness'
  return null
}
