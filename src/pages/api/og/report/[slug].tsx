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

const CATEGORY_DISPLAY: Record<string, string> = {
  ufos_aliens:               'UFOs & Aliens',
  cryptids:                  'Cryptids',
  ghosts_hauntings:          'Ghosts',
  psychic_phenomena:         'Psychic',
  consciousness_practices:   'Consciousness',
  psychological_experiences: 'Psychological',
  biological_factors:        'Biological',
  perception_sensory:        'Perception',
  religion_mythology:        'Religion',
  esoteric_practices:        'Esoteric',
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

export default async function handler(req: NextRequest) {
  try {
    const { searchParams, pathname } = new URL(req.url)
    // Edge runtime — query.slug isn't available; pull from path.
    const slug = pathname.split('/').pop() || searchParams.get('slug') || ''
    if (!slug) return new Response('Missing slug', { status: 400 })

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
      return errorImage('Paradocs', 'Image unavailable')
    }

    const url = `${SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/reports?slug=eq.${encodeURIComponent(slug)}&status=eq.approved&select=title,answer_line,category,event_date,city,state_province,country,location_name,witness_count,paradocs_narrative,feed_hook&limit=1`
    const resp = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: 'Bearer ' + SUPABASE_ANON_KEY,
      },
    })
    if (!resp.ok) return errorImage('Paradocs', 'Report not found')
    const rows = (await resp.json()) as ReportRow[]
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

    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            background: 'linear-gradient(135deg, #0a0a14 0%, #1a0a24 100%)',
            color: '#f1f1f8',
            padding: '60px 70px',
            fontFamily: 'Inter, -apple-system, system-ui, sans-serif',
          }}
        >
          {/* Top row: wordmark + category chip */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 0 }}>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#ffffff', letterSpacing: '-0.02em' }}>Paradocs</span>
              <span style={{ fontSize: 36, fontWeight: 800, color: '#a855f7' }}>.</span>
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                padding: '10px 18px',
                borderRadius: 999,
                border: `1px solid ${catColor}`,
                background: 'rgba(255,255,255,0.04)',
              }}
            >
              <span style={{ width: 12, height: 12, borderRadius: '50%', background: catColor, display: 'block' }} />
              <span style={{ fontSize: 22, fontWeight: 600, color: '#ffffff' }}>{catLabel}</span>
            </div>
          </div>

          {/* Title — main hero */}
          <div
            style={{
              display: 'flex',
              flex: 1,
              flexDirection: 'column',
              justifyContent: 'center',
              gap: 24,
              marginTop: 36,
            }}
          >
            <div
              style={{
                display: 'flex',
                fontSize: title.length > 70 ? 56 : 68,
                fontWeight: 800,
                lineHeight: 1.1,
                color: '#ffffff',
                letterSpacing: '-0.02em',
              }}
            >
              {title}
            </div>

            {/* Meta row: When · Where · Who */}
            <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'center' }}>
              {whenStr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#fcd34d' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.12em' }}>WHEN</span>
                  <span style={{ fontSize: 22, fontWeight: 500, color: '#e5e7eb' }}>{whenStr}</span>
                </div>
              )}
              {whereStr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#6ee7b7' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.12em' }}>WHERE</span>
                  <span style={{ fontSize: 22, fontWeight: 500, color: '#e5e7eb' }}>{whereStr}</span>
                </div>
              )}
              {whoStr && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#67e8f9' }}>
                  <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '0.12em' }}>WHO</span>
                  <span style={{ fontSize: 22, fontWeight: 500, color: '#e5e7eb' }}>{whoStr}</span>
                </div>
              )}
            </div>
          </div>

          {/* Bottom kicker: answer line */}
          {answer && (
            <div
              style={{
                display: 'flex',
                marginTop: 12,
                paddingTop: 24,
                borderTop: '1px solid rgba(255,255,255,0.08)',
                fontSize: 22,
                lineHeight: 1.4,
                color: '#cbd5e1',
                fontStyle: 'italic',
              }}
            >
              &ldquo;{answer}&rdquo;
            </div>
          )}
        </div>
      ),
      { width: 1200, height: 630 },
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
