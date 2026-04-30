'use client'

/**
 * ConstellationReveal — V2 Constellation visualization
 *
 * The emotional core of Paradocs: after submitting an experience,
 * users see their report matched against the database in a radial
 * constellation centered on their location.
 *
 * Phases: idle → processing → alone (count reveal) → map (constellation)
 *
 * Design system: Inter (body), Changa/Changa One (display),
 * primary purple #9000F0, dark bg rgb(10,10,20).
 *
 * Adapted from the v8 Constellation prototype with:
 * - Real data interfaces (MatchedReport, ConstellationMatch)
 * - Paradocs design tokens
 * - Source attribution (Reddit, NUFORC, MUFON, etc.)
 * - Launch-honest CTAs (read accounts, not meet people)
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react'

// ── Mobile detection ─────────────────────────────────────────────────────────

function useIsMobile(breakpoint?: number) {
  var bp = breakpoint || 640
  var [mobile, setMobile] = useState(false)
  useEffect(function() {
    function check() { setMobile(window.innerWidth < bp) }
    check()
    window.addEventListener('resize', check)
    return function() { window.removeEventListener('resize', check) }
  }, [bp])
  return mobile
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MatchedReport {
  id: string
  title: string
  slug: string
  category: string
  type_name: string
  location_description: string | null
  city: string | null
  state_province: string | null
  country: string | null
  latitude: number | null
  longitude: number | null
  event_date: string | null
  event_time: string | null
  summary: string | null
  description: string | null
  witness_count: number | null
  has_physical_evidence: boolean | null
  has_photo_video: boolean | null
  source_type: string | null
  source_url: string | null
  source_reference: string | null
  credibility: string | null
  match_score: number        // 0–1
  match_dimensions: MatchDimension[]
  locked: boolean
}

export interface MatchDimension {
  label: string
  score: number  // 0–1
}

export interface UserExperience {
  id?: string
  type_name: string
  category: string
  location: string
  latitude: number
  longitude: number
  year: number
  description: string
}

export interface ConstellationRevealProps {
  /** The user's submitted experience */
  userExperience: UserExperience
  /** Matched reports from the API */
  matches: MatchedReport[]
  /** Total experiences in the database */
  totalExperiences?: number
  /** Countries represented */
  totalCountries?: number
  /** Start in map phase directly (for Lab view) */
  startAtMap?: boolean
  /** Called when user taps "Read all" / paywall trigger */
  onPaywall?: () => void
  /** Called when user taps "Notify me" */
  onNotify?: () => void
  /** Called when user taps share */
  onShare?: () => void
  /** Called when user taps reset */
  onReset?: () => void
}

// ── Source system ─────────────────────────────────────────────────────────────

var SOURCES: Record<string, { label: string; color: string; action: string }> = {
  reddit_scrape:     { label: 'Reddit',           color: '#ff6314', action: 'Read on Reddit' },
  nuforc_scrape:     { label: 'NUFORC',           color: '#2dd4bf', action: 'View NUFORC record' },
  mufon_import:      { label: 'MUFON',            color: '#a855f7', action: 'View MUFON report' },
  iands_scrape:      { label: 'IANDS',            color: '#fb923c', action: 'View IANDS account' },
  youtube_scrape:    { label: 'YouTube',           color: '#f87171', action: 'Watch on YouTube' },
  bfro_scrape:       { label: 'BFRO',             color: '#22c55e', action: 'View BFRO report' },
  nderf_scrape:      { label: 'NDERF',            color: '#fb923c', action: 'Read NDERF account' },
  oberf_scrape:      { label: 'OBERF',            color: '#fb923c', action: 'Read OBERF account' },
  forum_scrape:      { label: 'Paranormal Forum',  color: '#a78bfa', action: 'Read original post' },
  user_submission:   { label: 'Paradocs Member',   color: '#34d399', action: 'View account' },
  editorial:         { label: 'Paradocs',          color: '#9000F0', action: 'Read full report' },
}

var INSTITUTIONAL = new Set(['nuforc_scrape', 'mufon_import', 'iands_scrape', 'bfro_scrape', 'nderf_scrape', 'oberf_scrape'])

var TYPE_COLORS: Record<string, string> = {
  'ufos_aliens':              '#22c55e',
  'cryptids':                 '#f59e0b',
  'ghosts_hauntings':         '#a855f7',
  'psychic_phenomena':        '#3b82f6',
  'consciousness_practices':  '#ec4899',
  'psychological_experiences':'#f87171',
  'biological_factors':       '#14b8a6',
  'perception_sensory':       '#6366f1',
  'religion_mythology':       '#fb923c',
  'esoteric_practices':       '#a78bfa',
  'combination':              '#9000F0',
}

// ── Layout engine: position reports in a radial pattern ───────────────────────

function layoutReports(
  matches: MatchedReport[],
  userLat: number,
  userLng: number
): Array<MatchedReport & { x: number; y: number }> {
  // Center user at 50, 48 in SVG viewBox 0–100
  var cx = 50, cy = 48

  return matches.map(function(r, i) {
    // If we have real coordinates, project relative to user
    if (r.latitude && r.longitude) {
      var dlat = (r.latitude - userLat) * 1.2
      var dlng = (r.longitude - userLng) * 0.9
      var dist = Math.sqrt(dlat * dlat + dlng * dlng)
      // Normalize distance to fit within 35 SVG units of center
      var maxDist = Math.max(dist, 0.001)
      var normDist = Math.min(dist / 5, 35)
      // Scale by inverse match score — higher matches closer
      normDist = normDist * (1.2 - r.match_score * 0.5)
      var angle = Math.atan2(dlat, dlng)
      return Object.assign({}, r, {
        x: Math.max(8, Math.min(92, cx + Math.cos(angle) * normDist)),
        y: Math.max(8, Math.min(92, cy + Math.sin(angle) * normDist)),
      })
    }

    // Fallback: arrange in concentric rings by match score
    var ring = r.match_score >= 0.8 ? 1 : r.match_score >= 0.6 ? 2 : 3
    var ringRadius = ring * 12
    var angleStep = (2 * Math.PI) / Math.max(matches.filter(function(m) {
      var mr = m.match_score >= 0.8 ? 1 : m.match_score >= 0.6 ? 2 : 3
      return mr === ring
    }).length, 1)
    var ringIndex = matches.filter(function(m, j) {
      var mr = m.match_score >= 0.8 ? 1 : m.match_score >= 0.6 ? 2 : 3
      return mr === ring && j < i
    }).length
    var a = angleStep * ringIndex - Math.PI / 2
    return Object.assign({}, r, {
      x: Math.max(8, Math.min(92, cx + Math.cos(a) * ringRadius)),
      y: Math.max(8, Math.min(92, cy + Math.sin(a) * ringRadius)),
    })
  })
}

// ── Cluster detection ─────────────────────────────────────────────────────────

interface Cluster {
  id: string
  cx: number
  cy: number
  rx: number
  ry: number
  label: string
}

function detectClusters(
  positioned: Array<{ x: number; y: number; type_name: string; match_score: number }>
): Cluster[] {
  // Simple: group by type_name, compute bounding ellipse for groups >= 3
  var groups: Record<string, Array<{ x: number; y: number }>> = {}
  positioned.forEach(function(r) {
    if (r.match_score < 0.5) return
    if (!groups[r.type_name]) groups[r.type_name] = []
    groups[r.type_name].push({ x: r.x, y: r.y })
  })

  var clusters: Cluster[] = []
  var ci = 0
  Object.keys(groups).forEach(function(typeName) {
    var pts = groups[typeName]
    if (pts.length < 3) return
    var sumX = 0, sumY = 0
    pts.forEach(function(p) { sumX += p.x; sumY += p.y })
    var mcx = sumX / pts.length
    var mcy = sumY / pts.length
    var maxDx = 0, maxDy = 0
    pts.forEach(function(p) {
      maxDx = Math.max(maxDx, Math.abs(p.x - mcx))
      maxDy = Math.max(maxDy, Math.abs(p.y - mcy))
    })
    clusters.push({
      id: 'c' + ci++,
      cx: mcx,
      cy: mcy,
      rx: Math.max(maxDx + 4, 8),
      ry: Math.max(maxDy + 4, 6),
      label: typeName.replace(/_/g, ' '),
    })
  })
  return clusters
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function arcPath(x1: number, y1: number, x2: number, y2: number, matchScore: number): string {
  var bend = 0.28 - matchScore * 0.24
  var mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  var dx = x2 - x1, dy = y2 - y1
  var len = Math.sqrt(dx * dx + dy * dy) || 1
  var off = len * bend
  return 'M' + x1 + ' ' + y1 + ' Q' + (mx + (-dy / len) * off) + ' ' + (my + (dx / len) * off) + ' ' + x2 + ' ' + y2
}

function estimateMiles(x1: number, y1: number, x2: number, y2: number): number {
  return Math.round(Math.sqrt(Math.pow(x1 - x2, 2) + Math.pow(y1 - y2, 2)) * 7.4)
}

function useCountUp(target: number, durationMs: number, active: boolean): number {
  var [n, setN] = useState(0)
  useEffect(function() {
    if (!active) { setN(0); return }
    var start: number | null = null
    var frame: number
    function tick(ts: number) {
      if (!start) start = ts
      var p = Math.min((ts - start) / durationMs, 1)
      setN(Math.round((1 - Math.pow(1 - p, 3)) * target))
      if (p < 1) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return function() { cancelAnimationFrame(frame) }
  }, [active, target, durationMs])
  return n
}

function getTypeColor(category: string): string {
  return TYPE_COLORS[category] || '#9000F0'
}

function getSourceInfo(sourceType: string | null) {
  if (!sourceType) return null
  return SOURCES[sourceType] || SOURCES['editorial']
}

function formatLocation(r: MatchedReport): string {
  if (r.city && r.state_province) return r.city + ', ' + r.state_province
  if (r.location_description) return r.location_description
  if (r.state_province) return r.state_province
  return 'Unknown location'
}

function formatYear(r: MatchedReport): string {
  if (r.event_date) return new Date(r.event_date).getFullYear().toString()
  return ''
}

// ── CSS (design-matched to Paradocs) ──────────────────────────────────────────

var CSS = `
/* Constellation V2 — Paradocs Design System */
.cv2{--bg:#0a0a14;--bg2:#0f0f1e;--surf:#141428;--surf2:#1a1a33;--border:#262640;
  --text:#f1f1f8;--text2:#8888a8;--text3:#555570;
  --brand:#9000f0;--brand-l:#c084fc;--brand-d:#6500a8;--teal:#14b8a6;
  --ff-body:'Inter',system-ui,sans-serif;--ff-display:'Changa One','Changa',system-ui,sans-serif;
  --ff-mono:ui-monospace,SFMono-Regular,'SF Mono',monospace;
  width:100%;height:100%;background:var(--bg);font-family:var(--ff-body);color:var(--text);overflow:hidden;position:relative;}

/* ── Idle ── */
.cv2-idle{position:absolute;inset:0;overflow:hidden;}
.cv2-idle-bg{position:absolute;inset:0;animation:cv2BgDrift 22s ease-in-out infinite;will-change:transform;}
.cv2-idle-veil{position:absolute;inset:0;background:linear-gradient(to top,var(--bg) 0%,var(--bg) 22%,rgba(10,10,20,.93) 38%,rgba(10,10,20,.62) 55%,rgba(10,10,20,.2) 74%,transparent 100%);}
.cv2-idle-fg{position:absolute;bottom:0;left:0;right:0;padding:0 28px 44px;display:flex;flex-direction:column;align-items:center;text-align:center;animation:cv2FadeUp .9s .4s ease both;}
.cv2-eyebrow{font-family:var(--ff-mono);font-size:10px;letter-spacing:.22em;text-transform:uppercase;color:var(--brand);font-weight:500;margin-bottom:20px;}
.cv2-idle-h1{font-family:var(--ff-display);font-size:clamp(28px,6vw,46px);font-weight:400;line-height:1.14;color:var(--text);margin-bottom:12px;}
.cv2-idle-h1 em{font-style:normal;color:var(--brand-l);}
.cv2-idle-sub{font-size:14px;color:var(--text2);line-height:1.7;margin-bottom:20px;max-width:320px;}
.cv2-idle-proof{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:30px;}
.cv2-proof-pill{display:flex;align-items:center;gap:6px;background:rgba(144,0,240,.07);border:1px solid rgba(144,0,240,.14);border-radius:100px;padding:6px 12px;font-family:var(--ff-mono);font-size:10px;color:var(--text3);letter-spacing:.1em;}
.cv2-proof-pill strong{color:var(--brand-l);font-weight:500;}
.cv2-proof-dot{width:4px;height:4px;border-radius:50%;background:var(--teal);flex-shrink:0;}
.cv2-btn-begin{background:linear-gradient(135deg,var(--brand),#6500a8);color:#fff;border:none;padding:15px 40px;border-radius:100px;font-family:var(--ff-body);font-size:15px;font-weight:600;cursor:pointer;letter-spacing:.02em;box-shadow:0 0 40px rgba(144,0,240,.5),0 4px 24px rgba(0,0,0,.5);transition:transform .15s,box-shadow .15s;margin-bottom:10px;will-change:transform;}
.cv2-btn-begin:hover{transform:scale(1.05);}.cv2-btn-begin:active{transform:scale(.97);}
.cv2-btn-explore{background:none;border:none;color:var(--text3);font-family:var(--ff-body);font-size:13px;cursor:pointer;transition:color .2s;padding:8px 16px;}
.cv2-btn-explore:hover{color:var(--text2);}.cv2-btn-explore:active{opacity:.7;}

/* ── Processing ── */
.cv2-proc{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;animation:cv2FadeIn .4s ease both;}
.cv2-scan-grid{display:grid;grid-template-columns:repeat(10,1fr);gap:5px;width:130px;}
.cv2-scan-dot{width:4px;height:4px;border-radius:50%;background:var(--brand);animation:cv2ScanDot 2s ease-in-out infinite;will-change:transform,opacity;}
.cv2-proc-bottom{display:flex;flex-direction:column;align-items:center;gap:10px;}
.cv2-proc-steps{display:flex;gap:6px;}
.cv2-proc-step{width:6px;height:6px;border-radius:50%;background:var(--border);transition:background .3s,transform .3s;will-change:transform;}
.cv2-proc-step.active{background:var(--brand);transform:scale(1.2);}
.cv2-proc-step.done{background:rgba(144,0,240,.35);}
.cv2-proc-lbl{font-family:var(--ff-mono);font-size:11px;letter-spacing:.18em;color:var(--text3);text-transform:uppercase;animation:cv2FadeUp .3s ease both;}

/* ── Alone / Reveal ── */
.cv2-alone{position:absolute;inset:0;background:#050508;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;text-align:center;animation:cv2FadeIn .35s ease both;overflow:hidden;}
.cv2-alone-pulses{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;pointer-events:none;}
.cv2-alone-pulse{position:absolute;width:60px;height:60px;border-radius:50%;border:1px solid rgba(144,0,240,.16);animation:cv2AlonePulse 3.8s ease-out infinite;will-change:transform,opacity;}
.cv2-alone-n{font-family:var(--ff-display);font-size:clamp(100px,22vw,170px);font-weight:400;color:var(--text);line-height:.85;letter-spacing:-.02em;position:relative;z-index:1;text-shadow:0 0 80px rgba(144,0,240,.25);animation:cv2NReveal .7s cubic-bezier(.2,0,0,1) both,cv2NBloom .55s 2.4s ease both;}
.cv2-alone-t{font-family:var(--ff-body);font-size:clamp(15px,2.4vw,20px);font-weight:300;color:rgba(241,241,248,.5);line-height:1.55;max-width:340px;position:relative;z-index:1;animation:cv2FadeUp .65s ease both;}
.cv2-alone-loc{display:flex;align-items:center;justify-content:center;gap:7px;font-family:var(--ff-mono);font-size:10px;color:rgba(144,0,240,.5);letter-spacing:.2em;text-transform:uppercase;position:relative;z-index:1;animation:cv2FadeUp .5s .35s ease both;}
.cv2-alone-loc-dot{width:5px;height:5px;border-radius:50%;background:var(--brand-l);opacity:.6;animation:cv2LivePulse 2s ease-in-out infinite;}
.cv2-alone-s{font-family:var(--ff-mono);font-size:10px;letter-spacing:.2em;text-transform:uppercase;color:rgba(144,0,240,.4);position:relative;z-index:1;animation:cv2FadeUp .6s .2s ease both;}

/* ── Map screen ── */
.cv2-map{position:absolute;inset:0;display:flex;flex-direction:column;animation:cv2FadeIn .5s ease both;}
.cv2-map.cv2-return{animation:cv2ReturnIn .8s cubic-bezier(.25,.46,.45,.94) both;}
.cv2-live-dot{width:5px;height:5px;border-radius:50%;background:#34d399;flex-shrink:0;animation:cv2LivePulse 2s ease-in-out infinite;}
/* Floating stats overlay — sits inside the SVG wrapper */
.cv2-stats-overlay{position:absolute;top:12px;right:16px;z-index:10;display:flex;gap:14px;align-items:center;background:rgba(10,10,20,.75);backdrop-filter:blur(12px);border:1px solid rgba(38,38,64,.5);border-radius:12px;padding:8px 16px;opacity:0;animation:cv2FadeIn .6s 1.8s ease both;}
.cv2-stats{display:flex;gap:14px;align-items:center;}
.cv2-stat{display:flex;flex-direction:column;align-items:flex-end;}
.cv2-stat-n{font-family:var(--ff-mono);font-size:19px;font-weight:500;line-height:1;}
.cv2-stat-l{font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.12em;font-weight:600;margin-top:2px;}
.cv2-sdiv{width:1px;height:26px;background:rgba(38,38,64,.5);}
.cv2-svgw{flex:1;position:relative;overflow:hidden;contain:layout style;}
.cv2-map-svg{width:100%;height:100%;display:block;transform-origin:50% 48%;transform:scale(2.6);transition:transform 2.2s cubic-bezier(.25,.46,.45,.94) .15s;will-change:transform;}
.cv2-svgw.revealed .cv2-map-svg{transform:scale(1);}
.cv2-svgw.live .cv2-map-svg{transform:scale(1);transition:none;animation:cv2MapBreath 9s ease-in-out infinite;}

/* ── Bottom bar ── */
.cv2-btm{flex-shrink:0;display:flex;flex-direction:column;align-items:center;padding:10px 16px 16px;}
.cv2-dock{background:rgba(15,15,30,.85);backdrop-filter:blur(16px);-webkit-backdrop-filter:blur(16px);border:1px solid rgba(138,100,255,.15);border-radius:20px;padding:16px 24px;max-width:620px;width:100%;opacity:0;transform:translateY(6px);transition:opacity .5s 2.2s,transform .5s 2.2s;}
.cv2-dock.vis{opacity:1;transform:translateY(0);}
.cv2-filters{display:flex;gap:6px;justify-content:center;padding-bottom:12px;border-bottom:1px solid rgba(138,100,255,.08);margin-bottom:12px;scrollbar-width:none;overflow-x:auto;}
.cv2-filters::-webkit-scrollbar{display:none;}
.cv2-chip{flex-shrink:0;padding:6px 14px;border-radius:100px;border:1px solid rgba(255,255,255,.1);background:transparent;font-family:var(--ff-body);font-size:11px;font-weight:600;color:var(--text3);cursor:pointer;letter-spacing:.06em;text-transform:uppercase;transition:all .15s;}
.cv2-chip:hover{border-color:#3a3a55;color:var(--text2);}.cv2-chip:active{transform:scale(.95);}
.cv2-chip.on{background:rgba(138,100,255,.25);border-color:rgba(138,100,255,.5);color:var(--brand-l);}
.cv2-callout{display:flex;align-items:center;justify-content:space-between;gap:12px;}
.cv2-cq-big{font-family:var(--ff-display);font-size:17px;font-weight:400;color:var(--text);line-height:1.25;}
.cv2-cq-sm{font-size:12px;color:var(--text2);margin-top:3px;line-height:1.4;}
.cv2-callout-btns{display:flex;gap:7px;flex-shrink:0;}
.cv2-btn-cta{background:linear-gradient(135deg,var(--brand),var(--brand-d));color:#fff;border:none;padding:11px 16px;border-radius:10px;font-family:var(--ff-body);font-size:12px;font-weight:600;cursor:pointer;box-shadow:0 0 18px rgba(144,0,240,.35);transition:transform .15s;white-space:nowrap;will-change:transform;}
.cv2-btn-cta:hover{transform:scale(1.04);}.cv2-btn-cta:active{transform:scale(.97);}
.cv2-btn-notify{background:transparent;border:1px solid rgba(20,184,166,.3);color:var(--teal);padding:11px 14px;border-radius:10px;font-family:var(--ff-body);font-size:12px;font-weight:600;cursor:pointer;transition:all .15s;white-space:nowrap;}
.cv2-btn-notify:hover{background:rgba(20,184,166,.07);border-color:rgba(20,184,166,.5);}.cv2-btn-notify:active{transform:scale(.97);}

/* ── Toast ── */
.cv2-toast{position:absolute;top:76px;left:50%;transform:translateX(-50%) translateY(-130%);background:var(--surf);border:1px solid var(--border);border-radius:14px;padding:10px 16px;display:flex;align-items:center;gap:10px;white-space:nowrap;z-index:25;transition:transform .45s cubic-bezier(.34,1.56,.64,1),opacity .4s;opacity:0;box-shadow:0 8px 32px rgba(0,0,0,.5);}
.cv2-toast.show{transform:translateX(-50%) translateY(0);opacity:1;}
.cv2-toast-dot{width:7px;height:7px;border-radius:50%;background:#34d399;flex-shrink:0;animation:cv2LivePulse 1.5s ease-in-out infinite;}
.cv2-toast-txt{font-size:13px;font-weight:600;color:var(--text);}
.cv2-toast-sub{font-family:var(--ff-mono);font-size:10px;color:var(--text3);}

/* ── Sheet (bottom detail panel) ── */
.cv2-sheet{position:absolute;bottom:0;left:0;right:0;z-index:22;background:var(--surf);border-top:1px solid var(--border);border-radius:22px 22px 0 0;transform:translateY(100%);transition:transform .45s cubic-bezier(.32,.72,0,1);max-height:80vh;overflow-y:auto;box-shadow:0 -24px 60px rgba(0,0,0,.65);}
.cv2-sheet.open{transform:translateY(0);}
.cv2-sh-handle{width:40px;height:4px;border-radius:2px;background:var(--border);margin:12px auto 0;}
.cv2-sh-body{padding:16px 20px 44px;}
.cv2-sh-top{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:4px;}
.cv2-sh-left{flex:1;min-width:0;}
.cv2-sh-badges{display:flex;align-items:center;flex-wrap:wrap;gap:5px;margin-bottom:6px;}
.cv2-sh-type-badge{display:inline-flex;align-items:center;padding:4px 10px;border-radius:100px;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;}
.cv2-sh-inst-badge{display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:100px;font-size:9px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;background:rgba(20,184,166,.1);color:var(--teal);border:1px solid rgba(20,184,166,.2);}
.cv2-sh-source{display:flex;align-items:center;gap:7px;margin-bottom:6px;}
.cv2-sh-source-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0;}
.cv2-sh-source-label{font-family:var(--ff-mono);font-size:11px;font-weight:500;}
.cv2-sh-source-sub{font-family:var(--ff-mono);font-size:10px;color:var(--text3);}
.cv2-sh-loc{font-size:16px;font-weight:600;color:var(--text);margin-bottom:3px;}
.cv2-sh-meta{font-family:var(--ff-mono);font-size:11px;color:var(--text3);line-height:1.7;}
.cv2-sh-match-box{text-align:right;flex-shrink:0;padding-left:12px;}
.cv2-sh-match-num{font-family:var(--ff-display);font-size:34px;font-weight:400;line-height:.9;}
.cv2-sh-match-lbl{font-family:var(--ff-mono);font-size:9px;color:var(--text3);letter-spacing:.14em;text-transform:uppercase;margin-top:3px;}
.cv2-sh-close{background:var(--surf2);border:none;color:var(--text2);width:30px;height:30px;border-radius:9px;cursor:pointer;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-left:10px;transition:background .15s;}
.cv2-sh-close:hover{background:#2a2a44;}.cv2-sh-close:active{transform:scale(.92);}
.cv2-sh-divider{height:1px;background:var(--border);margin:14px 0;}
.cv2-sh-desc{font-size:15px;font-style:italic;color:rgba(241,241,248,.44);line-height:1.75;margin-bottom:18px;}
.cv2-sh-locked-panel{padding:12px 14px;background:var(--surf2);border:1px solid var(--border);border-radius:14px;margin-bottom:16px;}
.cv2-sh-locked-label{font-family:var(--ff-mono);font-size:9px;color:var(--text3);letter-spacing:.14em;text-transform:uppercase;margin-bottom:6px;}
.cv2-sh-locked-preview{font-size:14px;font-style:italic;color:rgba(241,241,248,.28);line-height:1.6;position:relative;}
.cv2-sh-locked-blur{position:absolute;bottom:0;left:0;right:0;height:60%;background:linear-gradient(to top,var(--surf2),transparent);}
.cv2-sh-dims{margin-bottom:20px;}
.cv2-sh-dims-lbl{font-family:var(--ff-mono);font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.16em;margin-bottom:12px;}
.cv2-sh-dim{margin-bottom:12px;}
.cv2-sh-dim:last-child{margin-bottom:0;}
.cv2-sh-dim-top{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px;}
.cv2-sh-dim-label{font-size:12px;color:var(--text2);}
.cv2-sh-dim-pct{font-family:var(--ff-mono);font-size:11px;font-weight:500;}
.cv2-sh-dim-track{height:3px;background:var(--border);border-radius:2px;overflow:hidden;}
.cv2-sh-dim-fill{height:100%;border-radius:2px;transition:width .9s cubic-bezier(.4,0,.2,1) .15s;}
.cv2-btn-read{width:100%;padding:14px;border-radius:14px;background:var(--surf2);border:1px solid var(--border);color:var(--text);font-family:var(--ff-body);font-size:14px;font-weight:600;cursor:pointer;transition:all .15s;display:flex;align-items:center;justify-content:space-between;}
.cv2-btn-read:hover{border-color:#3a3a55;background:rgba(255,255,255,.04);}.cv2-btn-read:active{transform:scale(.98);}
.cv2-btn-read-src{font-family:var(--ff-mono);font-size:10px;font-weight:400;opacity:.6;}
.cv2-btn-unlock{width:100%;padding:14px;border-radius:14px;background:transparent;border:1px solid var(--brand);color:var(--brand-l);font-family:var(--ff-body);font-size:14px;font-weight:600;cursor:pointer;transition:background .15s,transform .15s;}
.cv2-btn-unlock:hover{background:rgba(144,0,240,.1);}.cv2-btn-unlock:active{transform:scale(.98);}

/* ── Scrim + Reset ── */
.cv2-scrim{position:absolute;inset:0;z-index:18;background:rgba(0,0,0,.4);}
.cv2-rst{position:absolute;top:68px;right:14px;z-index:30;background:var(--surf);border:1px solid var(--border);color:var(--text3);font-family:var(--ff-body);font-size:11px;padding:6px 13px;border-radius:100px;cursor:pointer;transition:all .15s;}
.cv2-rst:hover{color:var(--text2);border-color:#3a3a55;}.cv2-rst:active{transform:scale(.96);}

/* ── Mobile overrides ── */
@media(max-width:639px){
  /* Safe area insets for notched phones */
  .cv2-btm{padding-bottom:max(26px,calc(env(safe-area-inset-bottom,0px) + 10px));}
  .cv2-idle-fg{padding-bottom:max(44px,calc(env(safe-area-inset-bottom,0px) + 24px));}

  /* Stats overlay mobile */
  .cv2-stats-overlay{top:8px;right:10px;gap:8px;padding:6px 12px;border-radius:10px;}
  .cv2-stat-n{font-size:14px;}
  .cv2-sdiv{height:18px;}

  /* Mobile bottom bar — more compact, no dock glass */
  .cv2-btm{padding:8px 12px 16px;padding-bottom:max(16px,calc(env(safe-area-inset-bottom,0px) + 8px));align-items:stretch;background:linear-gradient(to top,rgba(10,10,20,1) 55%,transparent);}
  .cv2-dock{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border:none;border-radius:0;padding:0;max-width:none;}
  .cv2-filters{margin-bottom:6px;padding-bottom:6px;border-bottom:none;justify-content:flex-start;}
  .cv2-callout{flex-direction:column;align-items:stretch;background:rgba(144,0,240,.06);border:1px solid rgba(144,0,240,.15);border-radius:14px;padding:10px 12px;gap:8px;}
  .cv2-cq-big{font-size:14px;}
  .cv2-cq-sm{font-size:11px;}
  .cv2-callout-btns{justify-content:stretch;}
  .cv2-callout-btns .cv2-btn-cta,.cv2-callout-btns .cv2-btn-notify{flex:1;text-align:center;justify-content:center;}

  /* Mobile sheet — take more screen, rounded top */
  .cv2-sheet{max-height:72vh;border-radius:18px 18px 0 0;}
  .cv2-sh-body{padding:14px 16px 32px;padding-bottom:max(32px,calc(env(safe-area-inset-bottom,0px) + 16px));}
  .cv2-sh-loc{font-size:15px;}
  .cv2-sh-match-num{font-size:28px;}

  /* Idle screen mobile tweaks */
  .cv2-idle-h1{font-size:clamp(24px,7vw,34px);}
  .cv2-idle-sub{font-size:13px;max-width:280px;}
  .cv2-idle-proof{gap:6px;}
  .cv2-proof-pill{padding:5px 10px;font-size:9px;}

  /* Toast positioning */
  .cv2-toast{top:max(66px,calc(env(safe-area-inset-top,0px) + 56px));}
  .cv2-rst{top:max(58px,calc(env(safe-area-inset-top,0px) + 48px));right:10px;}
}

/* ── Animations ── */
@keyframes cv2FadeUp{from{opacity:0;transform:translateY(16px);}to{opacity:1;transform:translateY(0);}}
@keyframes cv2FadeIn{from{opacity:0;}to{opacity:1;}}
@keyframes cv2BgDrift{0%,100%{transform:scale(1);}33%{transform:scale(1.05)rotate(.5deg);}66%{transform:scale(1.03)rotate(-.4deg);}}
@keyframes cv2ScanDot{0%,100%{opacity:.07;transform:scale(.7);}40%{opacity:.95;transform:scale(1.15);background:var(--brand-l);}}
@keyframes cv2NReveal{from{opacity:0;transform:scale(.75);}to{opacity:1;transform:scale(1);}}
@keyframes cv2NBloom{0%{transform:scale(1);}50%{transform:scale(1.04);}100%{transform:scale(1);}}
@keyframes cv2AlonePulse{0%{transform:scale(1);opacity:.55;}100%{transform:scale(9);opacity:0;}}
@keyframes cv2NodePop{0%{opacity:0;transform:scale(0);}65%{transform:scale(1.3);}100%{opacity:1;transform:scale(1);}}
@keyframes cv2DrawArc{from{stroke-dashoffset:1;}to{stroke-dashoffset:0;}}
@keyframes cv2UserPulse{0%{transform:scale(.3);opacity:.7;}100%{transform:scale(3.2);opacity:0;}}
@keyframes cv2LivePulse{0%,100%{opacity:1;transform:scale(1);}50%{opacity:.35;transform:scale(.65);}}
@keyframes cv2ClusterBreath{0%,100%{stroke-opacity:.2;}50%{stroke-opacity:.42;}}
@keyframes cv2Twinkle{0%,100%{opacity:var(--op);}50%{opacity:calc(var(--op)*.18);}}
@keyframes cv2NewReport{0%{transform:scale(.8);opacity:.75;}60%{transform:scale(2.4);opacity:0;}100%{transform:scale(.8);opacity:0;}}
@keyframes cv2MapBreath{0%,100%{transform:scale(1);}50%{transform:scale(1.006);}}
@keyframes cv2ReturnIn{from{opacity:0;transform:scale(1.03);}to{opacity:1;transform:scale(1);}}
`

// ── Sub-components ────────────────────────────────────────────────────────────

function DiamondMark({ size }: { size?: number }) {
  var s = size || 14
  return (
    <svg width={s} height={s} viewBox="0 0 14 14" style={{ flexShrink: 0 }}>
      <polygon points="7,0.5 13.5,7 7,13.5 0.5,7" fill="#9000F0" />
      <polygon points="7,3.8 10.2,7 7,10.2 3.8,7" fill="#f1f1f8" />
    </svg>
  )
}

function Stars() {
  var data = useRef(
    Array.from({ length: 60 }, function(_, i) {
      return {
        cx: ((i * 7.31 + 13) % 100).toFixed(2),
        cy: ((i * 9.73 + 19) % 100).toFixed(2),
        r: (0.06 + ((i * 3.17) % 100) / 100 * 0.2).toFixed(3),
        op: (0.03 + ((i * 5.79) % 100) / 100 * 0.28).toFixed(2),
        td: (((i * 0.37) % 5) + 1.5).toFixed(1),
      }
    })
  ).current
  return (
    <g>
      {data.map(function(s, i) {
        return (
          <circle key={i} cx={s.cx} cy={s.cy} r={s.r} fill="white"
            style={{
              '--op': s.op,
              opacity: Number(s.op),
              animation: 'cv2Twinkle ' + s.td + 's ease-in-out ' + ((i * 0.09) % 3) + 's infinite',
            } as React.CSSProperties}
          />
        )
      })}
    </g>
  )
}

function LockGlyph({ cx, cy, sz }: { cx: number; cy: number; sz: number }) {
  var s = sz * 0.5
  return (
    <g>
      <rect x={cx - s * 0.5} y={cy - s * 0.12} width={s} height={s * 0.8} rx={s * 0.18}
        fill="none" stroke="currentColor" strokeWidth={s * 0.16} />
      <path d={'M' + (cx - s * 0.27) + ',' + (cy - s * 0.12) + ' Q' + (cx - s * 0.27) + ',' + (cy - s * 0.68) + ' ' + cx + ',' + (cy - s * 0.68) + ' Q' + (cx + s * 0.27) + ',' + (cy - s * 0.68) + ' ' + (cx + s * 0.27) + ',' + (cy - s * 0.12)}
        fill="none" stroke="currentColor" strokeWidth={s * 0.16} />
    </g>
  )
}

// ── Sheet content ─────────────────────────────────────────────────────────────

function SheetContent({
  report, isUser, userExp, onClose, onPaywall,
}: {
  report: (MatchedReport & { x: number; y: number }) | null
  isUser: boolean
  userExp: UserExperience
  onClose: () => void
  onPaywall?: () => void
}) {
  if (!report && !isUser) return null

  if (isUser) {
    var uCol = getTypeColor(userExp.category)
    return (
      <div className="cv2-sh-body">
        <div className="cv2-sh-top">
          <div className="cv2-sh-left">
            <div className="cv2-sh-badges">
              <div className="cv2-sh-type-badge" style={{ background: uCol + '18', color: uCol }}>
                Your Experience
              </div>
            </div>
            <div className="cv2-sh-loc">{userExp.location}</div>
            <div className="cv2-sh-meta">{userExp.year}</div>
          </div>
          <button className="cv2-sh-close" onClick={onClose}>✕</button>
        </div>
        <div className="cv2-sh-divider" />
        <p className="cv2-sh-desc">"{userExp.description}"</p>
      </div>
    )
  }

  var r = report!
  var col = getTypeColor(r.category)
  var mi = estimateMiles(50, 48, (report as any).x, (report as any).y)
  var src = getSourceInfo(r.source_type)
  var inst = r.source_type ? INSTITUTIONAL.has(r.source_type) : false
  var desc = r.summary || r.description || ''

  return (
    <div className="cv2-sh-body">
      <div className="cv2-sh-top">
        <div className="cv2-sh-left">
          <div className="cv2-sh-badges">
            <div className="cv2-sh-type-badge" style={{ background: col + '18', color: col }}>
              {r.type_name}
            </div>
            {inst && <div className="cv2-sh-inst-badge">✓ Institutional</div>}
          </div>
          {src && (
            <div className="cv2-sh-source">
              <div className="cv2-sh-source-dot" style={{ background: src.color }} />
              <span className="cv2-sh-source-label" style={{ color: src.color }}>{src.label}</span>
              {r.source_reference && <span className="cv2-sh-source-sub">· {r.source_reference}</span>}
            </div>
          )}
          <div className="cv2-sh-loc">{formatLocation(r)}</div>
          <div className="cv2-sh-meta">
            {formatYear(r)}{mi > 0 ? ' · ~' + mi + ' miles' : ''}
          </div>
        </div>
        <div className="cv2-sh-match-box">
          <div className="cv2-sh-match-num" style={{ color: col }}>
            {Math.round(r.match_score * 100)}
          </div>
          <div className="cv2-sh-match-lbl">% match</div>
        </div>
        <button className="cv2-sh-close" onClick={onClose}>✕</button>
      </div>

      <div className="cv2-sh-divider" />

      {!r.locked ? (
        <p className="cv2-sh-desc">"{desc}"</p>
      ) : (
        <div className="cv2-sh-locked-panel">
          <div className="cv2-sh-locked-label">Account preview</div>
          <div className="cv2-sh-locked-preview">
            "{desc.slice(0, 80)}…"
            <div className="cv2-sh-locked-blur" />
          </div>
        </div>
      )}

      {!r.locked && r.match_dimensions && r.match_dimensions.length > 0 && (
        <div className="cv2-sh-dims">
          <div className="cv2-sh-dims-lbl">Why this matches</div>
          {r.match_dimensions.map(function(d, i) {
            return (
              <div key={i} className="cv2-sh-dim">
                <div className="cv2-sh-dim-top">
                  <span className="cv2-sh-dim-label">{d.label}</span>
                  <span className="cv2-sh-dim-pct" style={{ color: col }}>
                    {Math.round(d.score * 100)}%
                  </span>
                </div>
                <div className="cv2-sh-dim-track">
                  <div className="cv2-sh-dim-fill" style={{
                    width: d.score * 100 + '%',
                    background: col,
                    transitionDelay: i * 0.08 + 's',
                  }} />
                </div>
              </div>
            )
          })}
        </div>
      )}

      {!r.locked && src && (
        <button className="cv2-btn-read" onClick={function() {
          if (r.source_url) window.open(r.source_url, '_blank')
        }}>
          <span>{src.action}</span>
          <span className="cv2-btn-read-src">{src.label} ↗</span>
        </button>
      )}

      {r.locked && (
        <button className="cv2-btn-unlock" onClick={onPaywall}>
          Unlock full account →
        </button>
      )}
    </div>
  )
}

// ── Processing screen ─────────────────────────────────────────────────────────

var PROC_LABELS = [
  'Scanning the record',
  'Clustering by phenomenon type',
  'Mapping geographic patterns',
  'Finding your matches',
]

function ProcessingScreen() {
  var [idx, setIdx] = useState(0)
  useEffect(function() {
    var t = setInterval(function() { setIdx(function(i) { return (i + 1) % PROC_LABELS.length }) }, 680)
    return function() { clearInterval(t) }
  }, [])

  return (
    <div className="cv2-proc">
      <div className="cv2-scan-grid">
        {Array.from({ length: 60 }, function(_, i) {
          return <div key={i} className="cv2-scan-dot" style={{ animationDelay: (i % 10) * 0.12 + 's' }} />
        })}
      </div>
      <div className="cv2-proc-bottom">
        <div className="cv2-proc-steps">
          {PROC_LABELS.map(function(_, i) {
            return (
              <div key={i} className={'cv2-proc-step' + (i === idx ? ' active' : i < idx ? ' done' : '')} />
            )
          })}
        </div>
        <div className="cv2-proc-lbl" key={idx}>{PROC_LABELS[idx]}</div>
      </div>
    </div>
  )
}

// ── Alone (reveal) screen ─────────────────────────────────────────────────────

function AloneScreen({
  count, textOn, subOn, location
}: {
  count: number; textOn: boolean; subOn: boolean; location: string
}) {
  return (
    <div className="cv2-alone">
      <div className="cv2-alone-pulses">
        {[0, 1.3, 2.6].map(function(d, i) {
          return <div key={i} className="cv2-alone-pulse" style={{ animationDelay: d + 's' }} />
        })}
      </div>
      <div className="cv2-alone-n">{count}</div>
      {textOn && (
        <>
          <div className="cv2-alone-t">
            accounts describe something<br />nearly identical to yours
          </div>
          <div className="cv2-alone-loc">
            <div className="cv2-alone-loc-dot" />
            {location}
          </div>
        </>
      )}
      {subOn && (
        <div className="cv2-alone-s">from Reddit · NUFORC · MUFON · and more</div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function ConstellationReveal({
  userExperience,
  matches,
  totalExperiences,
  totalCountries,
  startAtMap,
  onPaywall,
  onNotify,
  onShare,
  onReset,
}: ConstellationRevealProps) {
  var totalExp = totalExperiences || 2300000
  var totalCo = totalCountries || 43
  var isMobile = useIsMobile()

  // Layout — memoized for performance
  var positioned = useMemo(function() {
    return layoutReports(matches, userExperience.latitude, userExperience.longitude)
  }, [matches, userExperience.latitude, userExperience.longitude])

  var clusters = useMemo(function() {
    return detectClusters(positioned)
  }, [positioned])

  var sortedByDist = useMemo(function() {
    return [...positioned].sort(function(a, b) {
      return Math.sqrt(Math.pow(a.x - 50, 2) + Math.pow(a.y - 48, 2)) -
             Math.sqrt(Math.pow(b.x - 50, 2) + Math.pow(b.y - 48, 2))
    })
  }, [positioned])

  var matchCount = matches.filter(function(r) { return r.match_score >= 0.6 }).length
  var nearbyCount = matches.filter(function(r) { return r.match_score >= 0.7 && !r.locked }).length
  var strongCount = matches.filter(function(r) { return r.match_score >= 0.85 }).length

  // Phase state
  var [phase, setPhase] = useState(startAtMap ? 'map' : 'idle')
  var [shown, setShown] = useState<string[]>(startAtMap ? matches.map(function(m) { return m.id }) : [])
  var [linesOn, setLines] = useState(!!startAtMap)
  var [statsOn, setStats] = useState(!!startAtMap)
  var [sheet, setSheet] = useState<string | null>(null)
  var [filter, setFilter] = useState('all')
  var [textOn, setTextOn] = useState(false)
  var [subOn, setSubOn] = useState(false)

  // Map reveal state
  var [revealed, setRevealed] = useState(!!startAtMap)
  var [live, setLive] = useState(!!startAtMap)

  // Counting animations
  var revN = useCountUp(matchCount, 1600, phase === 'alone')
  var sM = useCountUp(matchCount, 900, statsOn)
  var sN = useCountUp(nearbyCount, 900, statsOn)
  var sS = useCountUp(strongCount, 900, statsOn)

  // Toast — disabled until wired to real new-report data (POST-INGESTION)
  var [toast, setToast] = useState(false)
  // Future: trigger setToast(true) when a real new report arrives via
  // websocket or polling, then auto-dismiss after 4500ms.

  // Map reveal timing
  useEffect(function() {
    if (phase !== 'map' || startAtMap) return
    var t1 = setTimeout(function() { setRevealed(true) }, 80)
    var t2 = setTimeout(function() { setLive(true) }, 2700)
    return function() { clearTimeout(t1); clearTimeout(t2) }
  }, [phase, startAtMap])

  var begin = useCallback(function() {
    // Mobile: compressed ~3s total. Desktop: full ~7s reveal.
    var procDelay = isMobile ? 1400 : 2600
    var textDelay = isMobile ? 1000 : 1900
    var subDelay = isMobile ? 1600 : 2700
    var mapDelay = isMobile ? 2200 : 4200
    var nodeStagger = isMobile ? 40 : 75
    var lineDelay = isMobile ? 600 : 1050
    var statsDelay = isMobile ? 1100 : 1900

    setPhase('processing')
    setTimeout(function() {
      setPhase('alone')
      setTimeout(function() { setTextOn(true) }, textDelay)
      setTimeout(function() { setSubOn(true) }, subDelay)
      setTimeout(function() {
        setPhase('map')
        sortedByDist.forEach(function(r, i) {
          setTimeout(function() {
            setShown(function(p) { return p.concat([r.id]) })
          }, i * nodeStagger + 200)
        })
        setTimeout(function() { setLines(true) }, lineDelay)
        setTimeout(function() { setStats(true) }, statsDelay)
      }, mapDelay)
    }, procDelay)
  }, [sortedByDist, isMobile])

  var reset = useCallback(function() {
    setPhase('idle')
    setShown([])
    setLines(false)
    setStats(false)
    setSheet(null)
    setFilter('all')
    setTextOn(false)
    setSubOn(false)
    setRevealed(false)
    setLive(false)
    if (onReset) onReset()
  }, [onReset])

  var visible = positioned.filter(function(r) {
    if (!shown.includes(r.id)) return false
    if (filter === 'strong') return r.match_score >= 0.7
    if (filter === 'nearby') return !r.locked && r.match_score >= 0.7
    return true
  })

  var tap = useCallback(function(id: string, e: React.MouseEvent) {
    e.stopPropagation()
    setSheet(function(p) { return p === id ? null : id })
  }, [])

  function dim(id: string): boolean {
    return sheet !== null && sheet !== id
  }

  var selectedReport = sheet === 'user' ? null : positioned.find(function(r) { return r.id === sheet }) || null

  // Find toast report for display
  var toastReport = matches.length > 1 ? matches[1] : null

  return (
    <>
      <style>{CSS}</style>
      <div className="cv2">
        {/* ── Idle ── */}
        {phase === 'idle' && (
          <div className="cv2-idle">
            <svg className="cv2-idle-bg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice" style={{ opacity: 0.2, position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
              <Stars />
              {positioned.filter(function(r) { return r.match_score >= 0.5 && !r.locked }).map(function(r) {
                return (
                  <path key={r.id} d={arcPath(50, 48, r.x, r.y, r.match_score)}
                    fill="none" stroke="#9000F0" strokeWidth={r.match_score * 0.2} strokeOpacity={r.match_score * 0.5} />
                )
              })}
              {positioned.map(function(r) {
                return (
                  <circle key={'n' + r.id} cx={r.x} cy={r.y}
                    r={r.match_score >= 0.6 ? 0.55 + r.match_score * 0.65 : 0.22 + r.match_score * 0.28}
                    fill={getTypeColor(r.category)} fillOpacity={r.match_score >= 0.6 ? 0.72 : 0.28} />
                )
              })}
              <polygon points="50,45 53,48 50,51 47,48" fill="#f1f1f8" opacity={0.9} />
              <polygon points="50,46.7 51.3,48 50,49.3 48.7,48" fill="#9000F0" />
            </svg>
            <div className="cv2-idle-veil" />
            <div className="cv2-idle-fg">
              <div className="cv2-eyebrow">Paradocs · Constellation</div>
              <h1 className="cv2-idle-h1">
                You are not alone<br />in what you<br /><em>experienced.</em>
              </h1>
              <p className="cv2-idle-sub">
                Millions of unexplained accounts, recorded and mapped. See where yours fits.
              </p>
              <div className="cv2-idle-proof">
                <div className="cv2-proof-pill"><div className="cv2-proof-dot" /><strong>{(totalExp / 1000000).toFixed(1)}M</strong>&nbsp;experiences</div>
                <div className="cv2-proof-pill"><div className="cv2-proof-dot" /><strong>{totalCo}</strong>&nbsp;countries</div>
                <div className="cv2-proof-pill"><div className="cv2-proof-dot" /><strong>Live</strong>&nbsp;updated</div>
              </div>
              <button className="cv2-btn-begin" onClick={begin}>Map My Experience</button>
              <button className="cv2-btn-explore" onClick={begin}>Explore the record →</button>
            </div>
          </div>
        )}

        {/* ── Processing ── */}
        {phase === 'processing' && <ProcessingScreen />}

        {/* ── Alone (reveal) ── */}
        {phase === 'alone' && (
          <AloneScreen
            count={revN}
            textOn={textOn}
            subOn={subOn}
            location={userExperience.location}
          />
        )}

        {/* ── Map ── */}
        {phase === 'map' && (
          <div className={'cv2-map' + (startAtMap ? ' cv2-return' : '')} onClick={function() { setSheet(null) }}>
            <div className={'cv2-svgw' + (revealed ? ' revealed' : '') + (live ? ' live' : '')}>
              {/* Floating stats overlay — top right corner of canvas */}
              {statsOn && (
                <div className="cv2-stats-overlay">
                  <div className="cv2-stat">
                    <div className="cv2-stat-n" style={{ color: '#c084fc' }}>{sM}</div>
                    <div className="cv2-stat-l">matches</div>
                  </div>
                  <div className="cv2-sdiv" />
                  <div className="cv2-stat">
                    <div className="cv2-stat-n" style={{ color: '#14b8a6' }}>{sN}</div>
                    <div className="cv2-stat-l">nearby</div>
                  </div>
                  <div className="cv2-sdiv" />
                  <div className="cv2-stat">
                    <div className="cv2-stat-n" style={{ color: '#f1f1f8' }}>{sS}</div>
                    <div className="cv2-stat-l">strong</div>
                  </div>
                </div>
              )}
              <svg className="cv2-map-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet">
                <defs>
                  <radialGradient id="cv2atmo" cx="50%" cy="48%">
                    <stop offset="0%" stopColor="#2d0060" stopOpacity={0.3} />
                    <stop offset="70%" stopColor="#0c0828" stopOpacity={0.1} />
                    <stop offset="100%" stopColor="#0a0a14" stopOpacity={0} />
                  </radialGradient>
                  <filter id="cv2glow" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="1.1" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="cv2sglow" x="-120%" y="-120%" width="340%" height="340%">
                    <feGaussianBlur stdDeviation="3" />
                  </filter>
                  <filter id="cv2dglow" x="-80%" y="-80%" width="260%" height="260%">
                    <feGaussianBlur stdDeviation="2.2" result="b" />
                    <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
                  </filter>
                  <filter id="cv2lkblur" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation=".35" />
                  </filter>
                </defs>

                <Stars />
                <ellipse cx="50" cy="48" rx="44" ry="44" fill="url(#cv2atmo)" />

                {/* Clusters */}
                {clusters.map(function(c, ci) {
                  return (
                    <g key={c.id} style={{ opacity: linesOn ? 1 : 0, transition: 'opacity 1.4s ' + ci * 0.15 + 's ease' }}>
                      <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry}
                        fill="rgba(144,0,240,.035)" stroke="#9000F0" strokeWidth=".07"
                        style={linesOn ? { animation: 'cv2ClusterBreath 5s ease-in-out ' + ci * 0.8 + 's infinite' } : undefined} />
                      {linesOn && (
                        <text x={c.cx} y={c.cy - c.ry - 2} textAnchor="middle"
                          style={{ fontFamily: 'ui-monospace,monospace', fontSize: '2px', fill: '#9000F0', fillOpacity: 0.28, letterSpacing: '.1px' }}>
                          {c.label.toUpperCase()}
                        </text>
                      )}
                    </g>
                  )
                })}

                {/* Gossamer arcs for low-match outliers */}
                {linesOn && visible.filter(function(r) { return r.match_score < 0.55 }).map(function(r) {
                  return (
                    <path key={'g' + r.id} d={arcPath(50, 48, r.x, r.y, r.match_score)}
                      fill="none" stroke="#262640" strokeWidth=".05"
                      strokeOpacity={dim(r.id) ? 0 : 0.07} strokeDasharray=".4 .7" />
                  )
                })}

                {/* Dashed arcs for mid-match locked */}
                {linesOn && visible.filter(function(r) { return r.locked && r.match_score >= 0.55 && r.match_score < 0.7 }).map(function(r) {
                  return (
                    <path key={'d' + r.id} d={arcPath(50, 48, r.x, r.y, r.match_score)}
                      fill="none" stroke={getTypeColor(r.category)}
                      strokeWidth=".07" strokeOpacity={dim(r.id) ? 0.02 : 0.13} strokeDasharray=".6 .8" />
                  )
                })}

                {/* Solid arcs for strong unlocked matches */}
                {linesOn && visible.filter(function(r) { return !r.locked && r.match_score >= 0.7 }).map(function(r, i) {
                  return (
                    <path key={r.id} d={arcPath(50, 48, r.x, r.y, r.match_score)}
                      fill="none" stroke={getTypeColor(r.category)}
                      strokeWidth={r.match_score * 0.3}
                      strokeOpacity={dim(r.id) ? 0.04 : r.match_score * 0.48}
                      pathLength={1}
                      style={{
                        strokeDasharray: 1,
                        strokeDashoffset: 1,
                        animation: 'cv2DrawArc 1.4s cubic-bezier(.4,0,.2,1) ' + i * 0.09 + 's both',
                      }} />
                  )
                })}

                {/* Nodes */}
                {visible.map(function(r, i) {
                  var col = getTypeColor(r.category)
                  var baseSz = isMobile ? 1.2 + r.match_score * 1.4 : 0.65 + r.match_score * 0.95
                  var sz = baseSz
                  var sel = sheet === r.id
                  var srcInfo = getSourceInfo(r.source_type)
                  var srcColor = srcInfo ? srcInfo.color : null

                  return (
                    <g key={r.id} onClick={function(e) { tap(r.id, e) }}
                      style={{ opacity: dim(r.id) ? 0.15 : 1, transition: 'opacity .3s', cursor: 'pointer' }}>
                      {/* Invisible touch target — larger on mobile for thumb accuracy */}
                      <circle cx={r.x} cy={r.y} r={isMobile ? 8 : 5.5} fill="transparent" />

                      {/* Live pulse on select reports */}
                      {linesOn && !r.locked && i < 3 && (
                        <g style={{ transformBox: 'fill-box' as any, transformOrigin: 'center', animation: 'cv2NewReport 5s ease-out ' + i * 1.2 + 's infinite' }}>
                          <circle cx={r.x} cy={r.y} r={sz + 0.8} fill={col} />
                        </g>
                      )}

                      {/* Selection ring */}
                      {sel && <circle cx={r.x} cy={r.y} r={sz + 2.8} fill="none" stroke={col} strokeWidth=".22" strokeOpacity=".5" />}

                      {/* Glow for strong matches — skip blur filter on mobile for performance */}
                      {r.match_score >= 0.8 && (
                        <circle cx={r.x} cy={r.y} r={sz + 1.8} fill={col} fillOpacity={isMobile ? '.12' : '.07'}
                          style={isMobile ? undefined : { filter: 'url(#cv2sglow)' }} />
                      )}

                      {/* Node */}
                      <g style={{ transformBox: 'fill-box' as any, transformOrigin: 'center', animation: 'cv2NodePop .45s cubic-bezier(.34,1.56,.64,1) ' + i * 0.07 + 's both' }}>
                        <circle cx={r.x} cy={r.y} r={sz}
                          fill={r.locked ? 'transparent' : col}
                          fillOpacity={r.locked ? 0 : 0.88}
                          stroke={col}
                          strokeWidth={r.locked ? 0.18 : 0.1}
                          strokeOpacity={r.locked ? 0.32 : 0.9}
                          style={r.match_score >= 0.8 && !isMobile ? { filter: 'url(#cv2glow)' } : undefined} />
                        {r.locked && (
                          <g style={{ color: col, opacity: 0.4 }} filter="url(#cv2lkblur)">
                            <LockGlyph cx={r.x} cy={r.y} sz={sz * 1.5} />
                          </g>
                        )}
                      </g>

                      {/* Source dot */}
                      {linesOn && srcColor && (
                        <circle cx={r.x + sz * 0.7} cy={r.y - sz * 0.7} r={0.5}
                          fill={srcColor} fillOpacity={0.8} />
                      )}
                    </g>
                  )
                })}

                {/* User diamond */}
                <g onClick={function(e) { tap('user', e) }} style={{ cursor: 'pointer' }}>
                  {[0, 0.9].map(function(d, i) {
                    return (
                      <g key={i} style={{ transformBox: 'fill-box' as any, transformOrigin: 'center', animation: 'cv2UserPulse 2.8s ease-out ' + d + 's infinite' }}>
                        <circle cx={50} cy={48} r={9} fill="none" stroke="#9000F0" strokeWidth=".3" />
                      </g>
                    )
                  })}
                  <circle cx={50} cy={48} r={7} fill="#3b0066" fillOpacity={0.18} style={isMobile ? undefined : { filter: 'url(#cv2sglow)' }} />
                  <polygon points="50,44.2 53.8,48 50,51.8 46.2,48" fill="#f1f1f8" opacity={0.96} style={isMobile ? undefined : { filter: 'url(#cv2dglow)' }} />
                  <polygon points="50,46.7 51.3,48 50,49.3 48.7,48" fill="#9000F0" />
                  {sheet === 'user' && (
                    <g style={{ transformBox: 'fill-box' as any, transformOrigin: 'center', transform: 'scale(1.55)' }}>
                      <polygon points="50,44.2 53.8,48 50,51.8 46.2,48" fill="none" stroke="#c084fc" strokeWidth=".35" />
                    </g>
                  )}
                  <text x={50} y={40.8} textAnchor="middle"
                    style={{ fontFamily: 'ui-monospace,monospace', fontSize: '2.5px', fontWeight: 500, fill: '#c084fc', letterSpacing: '.22px', opacity: 0.9 }}>
                    YOU
                  </text>
                </g>
              </svg>
            </div>

            {/* Bottom bar — unified dock on desktop */}
            <div className="cv2-btm">
              <div className={'cv2-dock' + (statsOn ? ' vis' : '')}>
                <div className="cv2-filters">
                  {[['all', 'All Reports'], ['strong', 'High Match'], ['nearby', 'Nearby']].map(function(pair) {
                    return (
                      <button key={pair[0]} className={'cv2-chip' + (filter === pair[0] ? ' on' : '')}
                        onClick={function() { setFilter(pair[0]) }}>
                        {pair[1]}
                      </button>
                    )
                  })}
                </div>
                <div className="cv2-callout">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="cv2-cq-big">{matchCount} matches found</div>
                    <div className="cv2-cq-sm">
                      {nearbyCount > 0 ? nearbyCount + ' nearby · ' : ''}from Reddit, NUFORC, MUFON + more
                    </div>
                  </div>
                  <div className="cv2-callout-btns">
                    <button className="cv2-btn-cta" onClick={function(e) { e.stopPropagation(); if (onPaywall) onPaywall() }}>
                      Read all
                    </button>
                    <button className="cv2-btn-notify" onClick={function(e) { e.stopPropagation(); if (onNotify) onNotify() }}>
                      Notify me
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Toast */}
            <div className={'cv2-toast' + (toast ? ' show' : '')}>
              <div className="cv2-toast-dot" />
              <div>
                <div className="cv2-toast-txt">New report near you</div>
                <div className="cv2-toast-sub">
                  {toastReport ? formatLocation(toastReport) + ' · ~' + estimateMiles(50, 48, (positioned.find(function(p) { return p.id === toastReport!.id }) || { x: 50, y: 50 }).x, (positioned.find(function(p) { return p.id === toastReport!.id }) || { x: 50, y: 50 }).y) + ' mi' : 'Nearby match found'}
                </div>
              </div>
            </div>

            {/* Bottom sheet */}
            <div className={'cv2-sheet' + (sheet ? ' open' : '')} onClick={function(e) { e.stopPropagation() }}>
              <div className="cv2-sh-handle" />
              <SheetContent
                report={selectedReport}
                isUser={sheet === 'user'}
                userExp={userExperience}
                onClose={function() { setSheet(null) }}
                onPaywall={onPaywall}
              />
            </div>

            {/* Scrim */}
            {sheet && <div className="cv2-scrim" onClick={function() { setSheet(null) }} />}

            {/* Reset */}
            {!startAtMap && (
              <button className="cv2-rst" onClick={reset}>↺ Reset</button>
            )}
          </div>
        )}
      </div>
    </>
  )
}
