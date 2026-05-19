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

import React, { useEffect, useState, useMemo, useRef } from 'react'
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
// V10.2.1 — exported so consumers (LabConstellationTab, /start reveal)
// can render a matching legend.
export const CATEGORY_COLORS: Record<string, string> = {
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

// V10.2.1 — short display labels for the legend that appears below
// the dial. Kept terse so a row of 4–5 fits on a 380px viewport.
export const CATEGORY_LABELS: Record<string, string> = {
  ufos_aliens:               'UFOs',
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

  // V10.2 — Real radar behavior: dots ping when the sweep arm crosses
  // them, rather than blinking on independent timers.
  //
  // V10.7.E (QA #1, May 2026) — the previous setTimeout scheduler drifted
  // out of phase with the CSS sweep because (1) `performance.now()` is
  // read inside useEffect AFTER React mounts the SVG, missing the few-ms
  // gap during which the CSS animation has already been running, and
  // (2) cross-browser SVG `transform-box`/`transform-origin` differences
  // can subtly delay when the sweep arm visually reaches angle 0. Chase
  // reported the blip didn't fire when the bright beam crossed it.
  //
  // The fix: drop scheduled timers entirely. Instead, run a single rAF
  // loop that reads the sweep group's actual `getAnimations()[0]`
  // `currentTime` — the same timeline the browser is using to render
  // the rotation — and pings each dot the moment that current animation
  // angle crosses the dot's angle. This makes the JS scheduler and the
  // CSS sweep impossible to drift apart by construction.
  //
  // SWEEP_PERIOD_MS must stay in lockstep with the @keyframes
  // radar-sweep duration in the inline <style> below.
  const SWEEP_PERIOD_MS = 4000
  const dotGroupRefs = useRef<Record<string, SVGGElement | null>>({})
  const sweepGroupRef = useRef<SVGGElement | null>(null)

  useEffect(() => {
    if (reducedMotion) return
    if (mode === 'reveal' && revealStage < 3) return

    // Precompute each dot's angle in degrees clockwise from +x (3
    // o'clock). SVG y is inverted (positive y is down), but atan2(y, x)
    // in SVG space gives us the angle measured clockwise from +x
    // directly — exactly what we want.
    const matchAngles = filtered.map((m, idx) => {
      const pos = positionForMatch(m, radius, idx)
      const rad = Math.atan2(pos.y, pos.x)
      const deg = ((rad * 180) / Math.PI + 360) % 360
      return { id: m.id, deg: deg }
    })

    function pingDot(id: string) {
      const el = dotGroupRefs.current[id]
      if (!el) return
      el.classList.remove('radar-ping-active')
      void el.getBoundingClientRect()
      requestAnimationFrame(function () {
        el.classList.add('radar-ping-active')
      })
    }

    // Last sweep angle we observed (deg). When the current angle wraps
    // past a dot's angle since the previous frame, ping it.
    var lastAngleDeg = -1
    var rafHandle = 0
    var cancelled = false

    function getCurrentSweepDeg(): number {
      // Prefer the actual CSS animation's timeline if available. This
      // makes the JS angle match the rendered angle to sub-frame
      // precision, regardless of when useEffect actually ran.
      var sweepEl = sweepGroupRef.current as any
      if (sweepEl && typeof sweepEl.getAnimations === 'function') {
        var anims = sweepEl.getAnimations()
        if (anims && anims.length > 0) {
          var anim = anims[0]
          var ct = typeof anim.currentTime === 'number' ? anim.currentTime : null
          if (ct !== null) {
            return ((ct % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360
          }
        }
      }
      // Fallback: derive from performance.now() with the assumption
      // the animation started at mount. Less accurate but safe in
      // environments without Web Animations introspection.
      return ((performance.now() % SWEEP_PERIOD_MS) / SWEEP_PERIOD_MS) * 360
    }

    function tick() {
      if (cancelled) return
      var current = getCurrentSweepDeg()
      // Detect each dot crossing in this frame's [lastAngle, current]
      // interval, handling wrap-around at 360→0.
      if (lastAngleDeg >= 0) {
        var wrapped = current < lastAngleDeg
        for (var i = 0; i < matchAngles.length; i++) {
          var ma = matchAngles[i]
          var crossed = wrapped
            ? (ma.deg > lastAngleDeg || ma.deg <= current)
            : (ma.deg > lastAngleDeg && ma.deg <= current)
          if (crossed) pingDot(ma.id)
        }
      }
      lastAngleDeg = current
      rafHandle = window.requestAnimationFrame(tick)
    }

    rafHandle = window.requestAnimationFrame(tick)
    return function () {
      cancelled = true
      if (rafHandle) window.cancelAnimationFrame(rafHandle)
    }
  }, [filtered, reducedMotion, mode, revealStage, radius])

  return (
    <div className={className} style={{ width: size, height: size, maxWidth: '100%', position: 'relative' }}>
      <svg
        viewBox={viewBox}
        width="100%"
        height="100%"
        style={{ display: 'block', overflow: 'hidden' }}
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
          {/* V10.2 — wider phosphor-trail sweep wedge. The wedge spans
              from the leading beam (angle 0, bright outer edge) back
              ~80° behind it, fading from bright purple to transparent.
              Reads more like a real radar than the prior 30° slice. */}
          <radialGradient id="sweep-grad" cx="0" cy="0" r="1">
            <stop offset="0%" stopColor="#a855f7" stopOpacity="0" />
            <stop offset="100%" stopColor="#a855f7" stopOpacity="0.42" />
          </radialGradient>
          {/* V10.2.1 — clip everything in the dot layer to the radar
              circle so the expanding ping rings can't escape past the
              dial outline. Radius is slightly larger than the
              outermost scoring ring so a freshly-pinged edge dot's
              ring still gets a brief outward "halo" before being
              cleanly clipped at the boundary. */}
          <clipPath id="radar-bounds">
            <circle cx={0} cy={0} r={radius + 2} />
          </clipPath>
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

        {/* ── Sweep arm ──────────────────────────────────────────────
            V10.2 — now active in both idle and reveal modes (once
            dots have settled in reveal). Wider trailing wedge (80°)
            with a bright leading-edge line; rotates clockwise. The
            CSS @keyframes radar-sweep duration MUST match the
            SWEEP_PERIOD_MS constant up in the ping-scheduling
            useEffect — bump both together. */}
        {!reducedMotion && (mode === 'idle' || revealStage >= 3) && (
          <g
            ref={sweepGroupRef}
            // V10.7.E.2 — restore the inline transformOrigin: '0 0'
            // form. In our viewBox `-halfSize -halfSize size size` the
            // user-space origin (0, 0) IS the radar center, so this
            // pivots the rotation at the center across browsers
            // (including iOS Safari). The earlier CSS-class form using
            // transform-box: view-box + 50%/50% rendered correctly in
            // Chrome but caused Safari iOS to draw the wedge from a
            // different pivot, producing the over-wide / misplaced
            // wedge Chase reported.
            style={{ transformOrigin: '0 0', animation: 'radar-sweep 4s linear infinite' }}
          >
            {/* Trailing phosphor wedge — sweeps clockwise (the wedge
                sits BEHIND the leading edge, so it trails as the arm
                advances). Drawn going counter-clockwise from +x for
                80°. */}
            <path
              d={`M0,0 L${radius},0 A${radius},${radius} 0 0 0 ${Math.cos(-Math.PI * 80 / 180) * radius},${Math.sin(-Math.PI * 80 / 180) * radius} Z`}
              fill="url(#sweep-grad)"
              opacity={0.95}
            />
            {/* Leading-edge bright line — the actual "sweep beam"
                that crosses dots. Positioned at angle 0 (along +x). */}
            <line
              x1={0}
              y1={0}
              x2={radius}
              y2={0}
              stroke="#a855f7"
              strokeWidth={2}
              strokeOpacity={0.85}
              strokeLinecap="round"
            />
          </g>
        )}

        {/* ── Match dots ──────────────────────────────────────────── */}
        {/* V10.2.1 — clipPath bound to the dial. Any ping-ring scale
            animation that would escape past the radar edge gets
            cleanly clipped instead of "flying off" into the rest of
            the page. */}
        <g
          opacity={revealStage >= 3 ? 1 : 0}
          style={{ transition: 'opacity 800ms ease-out' }}
          clipPath="url(#radar-bounds)"
        >
          {filtered.map((m, idx) => {
            const pos = positionForMatch(m, radius, idx)
            const color = CATEGORY_COLORS[m.category] || CATEGORY_COLORS.combination
            const dotSize = 4 + Math.max(0, Math.min(1, m.match_score)) * 6
            return (
              <g
                key={m.id}
                ref={el => { dotGroupRefs.current[m.id] = el }}
                className="radar-match-dot"
                transform={`translate(${pos.x},${pos.y})`}
                style={{
                  cursor: onMatchClick ? 'pointer' : 'default',
                  transition: 'transform 600ms cubic-bezier(.4,1.6,.6,1)',
                  transitionDelay: revealStage >= 3 ? `${idx * 60}ms` : '0ms',
                  // CSS custom property feeds the keyframes so we can
                  // size the ping ring per-dot without inline styles
                  // on the child circle.
                  ['--dot-size' as any]: dotSize,
                  ['--dot-color' as any]: color,
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
                {/* Ping ring — invisible at baseline; runs a single
                    "expand + fade" animation each time the parent
                    group gains the .radar-ping-active class (driven
                    by the sweep-sync scheduler in useEffect above). */}
                {!reducedMotion && (
                  <circle
                    className="radar-ping-ring"
                    r={dotSize}
                    fill="none"
                    stroke={color}
                    strokeOpacity={0}
                    strokeWidth={2}
                  />
                )}
                {/* Solid dot — dim baseline, brightens to full when
                    the arm passes (via the .radar-ping-active class). */}
                <circle
                  className="radar-dot-core"
                  r={dotSize}
                  fill={color}
                  fillOpacity={reducedMotion ? 0.9 : 0.55}
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

      {/* Keyframes — scoped to this component instance.
          V10.2 — radar-pulse + radar-sweep-then-pulse coordination.
          The sweep arm rotates over SWEEP_PERIOD_MS (4s); when a
          dot's pre-scheduled ping fires (because the JS-side
          scheduler computed the arm just crossed it), the parent
          group gets the .radar-ping-active class which runs:
            - radar-dot-flash on .radar-dot-core (brightens fill)
            - radar-ping-out on .radar-ping-ring (expanding ring) */}
      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        @keyframes radar-user-halo {
          0%, 100% { transform: scale(0.85); opacity: 0.7; }
          50%      { transform: scale(1.05); opacity: 1; }
        }
        @keyframes radar-dot-flash {
          0%   { fill-opacity: 0.55; }
          15%  { fill-opacity: 1; }
          100% { fill-opacity: 0.55; }
        }
        @keyframes radar-ping-out {
          /* V10.2.1 — tightened max scale from 3.2 → 2.0 so the
             expanding ring stays near the dot it pinged instead of
             flying outward. The ring is also clipped to the radar
             boundary at the SVG layer, but a tighter scale keeps it
             from VISUALLY pushing against the edge clip in the first
             place — softer, less "explosive" pulse. */
          0%   { transform: scale(1);   stroke-opacity: 0.9; }
          100% { transform: scale(2.0); stroke-opacity: 0; }
        }
        .radar-match-dot.radar-ping-active .radar-dot-core {
          animation: radar-dot-flash 1200ms ease-out;
        }
        .radar-match-dot.radar-ping-active .radar-ping-ring {
          animation: radar-ping-out 1200ms ease-out;
          /* V10.2.2 — CRITICAL SVG transform-origin fix.
             In SVG, the default transform-box is "view-box", which
             means transform-origin: center resolves to the CENTER OF
             THE SVG VIEWBOX (i.e. the YOU node at 0,0), NOT the ring's
             own center. So scale(2) was flinging each ring radially
             outward from YOU instead of pulsing in place around its
             dot — creating the "rings flying off toward the edge"
             effect Chase reported.
             transform-box: fill-box makes transform-origin resolve to
             the element's own bounding box, so scale(2) now pulses
             cleanly around the dot's local center. */
          transform-box: fill-box;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .radar-match-dot.radar-ping-active .radar-dot-core,
          .radar-match-dot.radar-ping-active .radar-ping-ring {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  )
}
