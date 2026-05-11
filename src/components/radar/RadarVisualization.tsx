'use client'

/**
 * RadarVisualization — V9.11.5 #16
 *
 * Single SVG component used by both:
 *   • /start step 'reveal' (animated entry — Phase 1 reveal sequence)
 *   • /lab RADAR tab (idle persistent state)
 *
 * Data encoding (all four phases per V9.11.5 panel):
 *   • Distance from center  = 1 − match_score (closer = stronger match)
 *   • Angle / quadrant      = phenomenon category (UFOs 12, Ghosts 3, NDE 6, Cryptids 9 — clock face)
 *   • Color                 = category palette (CATEGORY_CONFIG)
 *   • Dot size              = scaled by match_score
 *   • Pulse rate            = scaled by recency (newer matches pulse faster)
 *
 * Filter prop:
 *   • 'all'      — show all matches
 *   • 'high'     — only matches with score ≥ 0.5
 *   • 'nearby'   — only matches with non-null lat/lng within ~500km of user
 *
 * Mode prop:
 *   • 'reveal'   — full entry sequence: rings draw → user node lands → match dots animate in
 *   • 'idle'     — instantly settled state, sweeping radar line + steady dots
 *
 * Reduced-motion: respects `prefers-reduced-motion` — falls back to instant settled state.
 */

import React, { useEffect, useState, useMemo } from 'react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import type { PhenomenonCategory } from '@/lib/database.types'

export interface RadarMatch {
  id: string
  title: string
  slug: string
  category: string
  match_score: number  // 0-1
  /** Optional — when provided, used for "nearby" filter (haversine to user). */
  latitude?: number | null
  longitude?: number | null
  /** Optional ISO timestamp — drives pulse rate. */
  created_at?: string | null
}

export interface RadarUser {
  /** Used for nearby filter haversine. */
  latitude?: number | null
  longitude?: number | null
}

interface RadarVisualizationProps {
  matches: RadarMatch[]
  user: RadarUser
  mode: 'reveal' | 'idle'
  filter?: 'all' | 'high' | 'nearby'
  /** Click handler for a match dot — typically navigates to /report/[slug]. */
  onMatchClick?: (match: RadarMatch) => void
  /**
   * V9.11.5 #31 — click handler for the YOU center node. Lets the
   * parent open an inline preview of the user's own report, scroll
   * to it, etc. When provided, the YOU node renders with a pointer
   * cursor and an accessible role.
   */
  onCenterClick?: () => void
  /** Container size in px. Component is responsive within. */
  size?: number
  /** Optional — when set, displayed as a label under the user node (e.g. 'YOU'). */
  centerLabel?: string
  className?: string
}

// ── Category → angle mapping (clock face) ────────────────────────────────────
// Putting categories at fixed clock positions makes the radar legible: users
// learn over time that "UFO matches show up at the top." Categories not listed
// fall through to 'combination' at 6 o'clock.
const CATEGORY_ANGLES: Record<string, number> = {
  ufos_aliens:               -90,   // 12 o'clock (top, north)
  cryptids:                  180,   // 9 o'clock (left, west)
  ghosts_hauntings:           0,    // 3 o'clock (right, east)
  psychic_phenomena:          90,   // 6 o'clock (bottom, south)
  consciousness_practices:   -45,   // 1-2 o'clock (top-right)
  psychological_experiences:  45,   // 4-5 o'clock (bottom-right)
  biological_factors:        135,   // 7-8 o'clock (bottom-left)
  perception_sensory:       -135,   // 10-11 o'clock (top-left)
  religion_mythology:       -120,   // 11 o'clock-ish
  esoteric_practices:        120,   // 7 o'clock-ish
  combination:                90,   // bottom default
}

// ── Category → color (matches CATEGORY_CONFIG) ────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens:               '#4ade80',   // green
  cryptids:                  '#fbbf24',   // amber
  ghosts_hauntings:          '#c084fc',   // purple
  psychic_phenomena:         '#60a5fa',   // blue
  consciousness_practices:   '#818cf8',   // indigo
  psychological_experiences: '#f472b6',   // pink
  biological_factors:        '#a78bfa',   // light purple
  perception_sensory:        '#22d3ee',   // cyan
  religion_mythology:        '#fb923c',   // orange
  esoteric_practices:        '#a3e635',   // lime
  combination:               '#94a3b8',   // slate
}

const RING_COUNT = 4 // 4 concentric scoring bands

// ── Haversine for "nearby" filter ─────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Recency → pulse rate (slower = older) ────────────────────────────────────
// Returns CSS animation duration in seconds. 1s for fresh today, up to 6s for >30d.
function pulseDurationForRecency(createdAt?: string | null): number {
  if (!createdAt) return 4
  const ageMs = Date.now() - new Date(createdAt).getTime()
  const ageDays = ageMs / (1000 * 60 * 60 * 24)
  if (ageDays < 1) return 1.4
  if (ageDays < 7) return 2.2
  if (ageDays < 30) return 3.4
  return 5
}

// ── Position calculation ──────────────────────────────────────────────────────
function positionForMatch(m: RadarMatch, radius: number, jitterSeed: number): { x: number; y: number } {
  // Base angle from category, jittered ±15° so dots in the same category
  // don't pile on top of each other.
  const baseAngle = CATEGORY_ANGLES[m.category] ?? CATEGORY_ANGLES.combination
  // Deterministic per-match jitter via simple hash on the id.
  let h = 0
  for (let i = 0; i < m.id.length; i++) h = (h * 31 + m.id.charCodeAt(i)) | 0
  const jitter = ((h % 31) - 15) // -15..+15 deg
  const angleDeg = baseAngle + jitter
  const angleRad = angleDeg * Math.PI / 180

  // Distance from center: stronger match = closer.
  // Score 1.0 → 25% of radius (right next to center).
  // Score 0.0 → 95% of radius (at the edge).
  const distRatio = 0.25 + (1 - Math.max(0, Math.min(1, m.match_score))) * 0.7
  const dist = radius * distRatio

  return {
    x: Math.cos(angleRad) * dist,
    y: Math.sin(angleRad) * dist,
  }
}

// ── Component ────────────────────────────────────────────────────────────────
export default function RadarVisualization(props: RadarVisualizationProps) {
  const {
    matches,
    user,
    mode,
    filter = 'all',
    onMatchClick,
    onCenterClick,
    size = 360,
    centerLabel = 'YOU',
    className,
  } = props

  // Reveal sequence state (skipped in 'idle' mode or with reduced-motion).
  const [revealStage, setRevealStage] = useState<0 | 1 | 2 | 3>(mode === 'idle' ? 3 : 0)
  const [reducedMotion, setReducedMotion] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReducedMotion(mq.matches)
    if (mq.matches || mode === 'idle') {
      setRevealStage(3)
      return
    }
    // Reveal sequence: stage 0 → 1 → 2 → 3
    const t1 = setTimeout(() => setRevealStage(1), 200)   // rings fade in
    const t2 = setTimeout(() => setRevealStage(2), 1200)  // user node lands
    const t3 = setTimeout(() => setRevealStage(3), 2200)  // matches appear
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [mode])

  // Apply filter.
  const filtered = useMemo(() => {
    if (filter === 'high') return matches.filter(m => m.match_score >= 0.5)
    if (filter === 'nearby') {
      if (typeof user.latitude !== 'number' || typeof user.longitude !== 'number') return []
      return matches.filter(m => {
        if (typeof m.latitude !== 'number' || typeof m.longitude !== 'number') return false
        return haversineKm(user.latitude as number, user.longitude as number, m.latitude, m.longitude) <= 500
      })
    }
    return matches
  }, [matches, filter, user.latitude, user.longitude])

  // Coordinate system: -size/2 .. +size/2 around center.
  const halfSize = size / 2
  const radius = halfSize - 16 // padding so edge dots don't clip
  const viewBox = `${-halfSize} ${-halfSize} ${size} ${size}`

  return (
    <div className={className} style={{ width: size, height: size, maxWidth: '100%', position: 'relative' }}>
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'visible' }}
        aria-label="RADAR visualization"
        role="img"
      >
        <defs>
          {/* Soft glow for the user node */}
          <radialGradient id="user-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.95" />
            <stop offset="40%" stopColor="#a855f7" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0" />
          </radialGradient>
          {/* Sweeping conic gradient for idle radar sweep */}
          <linearGradient id="sweep-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.35" />
          </linearGradient>
        </defs>

        {/* ── Concentric scoring rings ─────────────────────────────── */}
        <g
          opacity={revealStage >= 1 ? 1 : 0}
          style={{ transition: 'opacity 600ms ease-out' }}
        >
          {Array.from({ length: RING_COUNT }).map((_, i) => {
            const r = radius * (i + 1) / RING_COUNT
            return (
              <circle
                key={i}
                cx={0}
                cy={0}
                r={r}
                fill="none"
                stroke="rgba(168,85,247,0.18)"
                strokeWidth={1}
                strokeDasharray={i === RING_COUNT - 1 ? '0' : '2 4'}
              />
            )
          })}
          {/* Cardinal axes for the clock-face encoding */}
          <line x1={-radius} y1={0} x2={radius} y2={0} stroke="rgba(168,85,247,0.08)" strokeWidth={1} />
          <line x1={0} y1={-radius} x2={0} y2={radius} stroke="rgba(168,85,247,0.08)" strokeWidth={1} />
        </g>

        {/* ── Idle sweep arm ──────────────────────────────────────── */}
        {mode === 'idle' && !reducedMotion && (
          <g style={{ transformOrigin: '0 0', animation: 'radar-sweep 6s linear infinite' }}>
            <path
              d={`M0,0 L${radius},0 A${radius},${radius} 0 0 0 ${Math.cos(-Math.PI / 6) * radius},${Math.sin(-Math.PI / 6) * radius} Z`}
              fill="url(#sweep-grad)"
              opacity={0.6}
            />
          </g>
        )}

        {/* ── Match dots ──────────────────────────────────────────── */}
        <g
          opacity={revealStage >= 3 ? 1 : 0}
          style={{ transition: 'opacity 800ms ease-out' }}
        >
          {filtered.map((m, idx) => {
            const pos = positionForMatch(m, radius, idx)
            const color = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.combination
            const dotSize = 4 + Math.max(0, Math.min(1, m.match_score)) * 6
            const pulseDur = pulseDurationForRecency(m.created_at)
            return (
              <g
                key={m.id}
                transform={`translate(${pos.x},${pos.y})`}
                style={{
                  cursor: onMatchClick ? 'pointer' : 'default',
                  transition: 'transform 600ms cubic-bezier(.4,1.6,.6,1)',
                  transitionDelay: revealStage >= 3 ? `${idx * 60}ms` : '0ms',
                }}
                onClick={() => onMatchClick?.(m)}
              >
                {/* Connecting line to center (subtle) */}
                <line
                  x1={0} y1={0}
                  x2={-pos.x} y2={-pos.y}
                  stroke={color}
                  strokeWidth={0.5}
                  strokeOpacity={0.18}
                />
                {/* Outer pulse ring (animated) */}
                {!reducedMotion && (
                  <circle
                    r={dotSize + 2}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0.7}
                    strokeWidth={1.5}
                    style={{ animation: `radar-pulse ${pulseDur}s ease-out infinite` }}
                  />
                )}
                {/* Solid dot */}
                <circle
                  r={dotSize}
                  fill={color}
                  fillOpacity={0.9}
                  stroke="#0a0a0f"
                  strokeWidth={1}
                />
                <title>{m.title} · {Math.round(m.match_score * 100)}% match</title>
              </g>
            )
          })}
        </g>

        {/* ── User node (center) ───────────────────────────────────── */}
        <g
          opacity={revealStage >= 2 ? 1 : 0}
          style={{
            transition: 'opacity 600ms ease-out, transform 700ms cubic-bezier(.4,1.6,.6,1)',
            transform: revealStage >= 2 ? 'scale(1)' : 'scale(0.4)',
            transformOrigin: '0 0',
            cursor: onCenterClick ? 'pointer' : 'default',
          }}
          role={onCenterClick ? 'button' : undefined}
          tabIndex={onCenterClick ? 0 : undefined}
          aria-label={onCenterClick ? 'Your report — open preview' : undefined}
          onClick={onCenterClick ? () => onCenterClick() : undefined}
          onKeyDown={onCenterClick ? (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onCenterClick() }
          } : undefined}
        >
          {/* Outer pulsing halo */}
          {!reducedMotion && (
            <circle
              r={26}
              fill="url(#user-glow)"
              style={{ animation: 'radar-user-halo 2.4s ease-in-out infinite' }}
            />
          )}
          {/* Invisible hit target — makes the YOU dot easier to tap on mobile */}
          {onCenterClick && (
            <circle r={20} fill="transparent" />
          )}
          {/* Inner solid */}
          <circle r={10} fill="#a855f7" />
          <circle r={4} fill="#ffffff" />
        </g>
      </svg>

      {/* Center label (positioned absolutely so it doesn't get clipped) */}
      {centerLabel && revealStage >= 2 && (
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, calc(-50% + 24px))',
            fontFamily: "'Changa','Helvetica Neue',Helvetica,Arial,sans-serif",
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.18em',
            color: '#a855f7',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            opacity: revealStage >= 2 ? 1 : 0,
            transition: 'opacity 400ms ease-out',
          }}
        >
          {centerLabel}
        </div>
      )}

      {/* Keyframes — scoped to this component instance */}
      <style>{`
        @keyframes radar-pulse {
          0%   { transform: scale(0.9); opacity: 0.7; }
          70%  { transform: scale(1.6); opacity: 0; }
          100% { transform: scale(1.6); opacity: 0; }
        }
        @keyframes radar-user-halo {
          0%, 100% { transform: scale(0.85); opacity: 0.7; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          [data-radar-pulse], [data-radar-halo], [data-radar-sweep] {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
