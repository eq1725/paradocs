/**
 * useCanvasRenderer — Canvas drawing logic for the constellation star map.
 *
 * Renders background stars, category nebulae, entry star nodes, connection lines,
 * and labels. Drawing detail scales with zoom level.
 */

import { useCallback, useRef } from 'react'
import type { SimNode, SimEdge, CategoryCenter } from './useForceSimulation'

// ── Color Constants ──

const VERDICT_COLORS: Record<string, string> = {
  compelling: '#fbbf24',   // amber-400
  inconclusive: '#60a5fa', // blue-400
  skeptical: '#9ca3af',    // gray-400
  needs_info: '#a78bfa',   // purple-400
}

const CATEGORY_GLOW: Record<string, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#3b82f6',
  consciousness_practices: '#8b5cf6',
  psychological_experiences: '#ec4899',
  biological_factors: '#14b8a6',
  perception_sensory: '#06b6d4',
  religion_mythology: '#f97316',
  esoteric_practices: '#6366f1',
  combination: '#64748b',
}

// ── Background Stars ──

interface BgStar {
  x: number
  y: number
  size: number
  alpha: number
  twinkleSpeed: number
  twinklePhase: number
}

function generateBgStars(count: number): BgStar[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    size: Math.random() * 1.5 + 0.3,
    alpha: Math.random() * 0.6 + 0.2,
    twinkleSpeed: Math.random() * 0.02 + 0.005,
    twinklePhase: Math.random() * Math.PI * 2,
  }))
}