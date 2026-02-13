/**
 * Constellation Map Data Model
 *
 * Defines the category nodes, their positions in the "night sky",
 * and the connections between them with strength weights and descriptions.
 * Used by the ConstellationMap component to render the D3 force-directed graph.
 */

import { PhenomenonCategory } from './database.types'

// ── Node Types ──

export interface ConstellationNode {
  id: PhenomenonCategory
  label: string
  icon: string
  color: string        // Tailwind color name (e.g., 'green', 'purple')
  glowColor: string    // Hex color for SVG glow filter
  description: string
  // Default position in normalized coordinates (0-1 range, mapped to viewport)
  x: number
  y: number
}

export interface ConstellationEdge {
  source: PhenomenonCategory
  target: PhenomenonCategory
  strength: number     // 0-1, controls edge opacity and thickness
  description: string  // Why these are connected
  bidirectional: boolean
}

export interface ConstellationStats {
  category: PhenomenonCategory
  reportCount: number
  trendingCount: number // new this week
  userJournalEntries: number
}

// ── Node Definitions ──
// Positions arranged to create visually pleasing constellation clusters
// Layout: consciousness/psychic cluster top-center, UFO/crypto bottom-left,
// ghosts/perception right side, religion/esoteric bottom-right

export const CONSTELLATION_NODES: ConstellationNode[] = [
  {
    id: 'ufos_aliens',
    label: 'UFOs & Aliens',
    icon: '🛸',
    color: 'green',
    glowColor: '#22c55e',
    description: 'Unidentified aerial phenomena, extraterrestrial encounters, and non-human intelligence',
    x: 0.2,
    y: 0.65,
  },
  {
    id: 'cryptids',
    label: 'Cryptids',
    icon: '🦶',
    color: 'amber',
    glowColor: '#f59e0b',
    description: 'Unknown creatures, Bigfoot, Mothman, and undiscovered species',
    x: 0.12,
    y: 0.35,
  },
  {
    id: 'ghosts_hauntings',
    label: 'Ghosts & Hauntings',
    icon: '👻',
    color: 'purple',
    glowColor: '#a855f7',
    description: 'Apparitions, poltergeists, haunted locations, and spirit communication',
    x: 0.72,
    y: 0.3,
  },
  {
    id: 'psychic_phenomena',
    label: 'Psychic Phenomena',
    icon: '🔮',
    color: 'blue',
    glowColor: '#3b82f6',
    description: 'ESP, telepathy, precognition, remote viewing, and psychokinesis',
    x: 0.5,
    y: 0.2,
  },
  {
    id: 'consciousness_practices',
    label: 'Consciousness',
    icon: '🧘',
    color: 'indigo',
    glowColor: '#6366f1',
    description: 'Meditation, astral projection, lucid dreaming, and altered states',
    x: 0.38,
    y: 0.08,
  },
  {
    id: 'psychological_experiences',
    label: 'Psychological',
    icon: '🧠',
    color: 'pink',
    glowColor: '#ec4899',
    description: 'NDEs, sleep paralysis, déjà vu, and anomalous psychological events',
    x: 0.62,
    y: 0.08,
  },
  {
    id: 'biological_factors',
    label: 'Biological',
    icon: '🧬',
    color: 'emerald',
    glowColor: '#10b981',
    description: 'Physiological influences, electromagnetic sensitivity, and body anomalies',
    x: 0.85,
    y: 0.55,
  },
  {
    id: 'perception_sensory',
    label: 'Perception',
    icon: '👁️',
    color: 'cyan',
    glowColor: '#06b6d4',
    description: 'Visual and auditory anomalies, synesthesia, and sensory distortions',
    x: 0.88,
    y: 0.25,
  },
  {
    id: 'religion_mythology',
    label: 'Religion & Myth',
    icon: '⚡',
    color: 'yellow',
    glowColor: '#eab308',
    description: 'Religious visions, miracles, mythological encounters, and divine phenomena',
    x: 0.3,
    y: 0.85,
  },
  {
    id: 'esoteric_practices',
    label: 'Esoteric',
    icon: '✨',
    color: 'violet',
    glowColor: '#8b5cf6',
    description: 'Occult practices, ritual magic, divination, and hermetic traditions',
    x: 0.55,
    y: 0.88,
  },
  {
    id: 'combination',
    label: 'Multi-Disciplinary',
    icon: '🔄',
    color: 'gray',
    glowColor: '#9ca3af',
    description: 'Cases spanning multiple phenomenon categories',
    x: 0.5,
    y: 0.5,
  },
]

// ── Edge Definitions ──
// Strength: 0.9 = very strong connection, 0.3 = loose association

export const CONSTELLATION_EDGES: ConstellationEdge[] = [
  // UFO cluster connections
  {
    source: 'ufos_aliens',
    target: 'consciousness_practices',
    strength: 0.8,
    description: 'Contactee experiences often involve altered states of consciousness, and many abduction accounts describe telepathic communication',
    bidirectional: true,
  },
  {
    source: 'ufos_aliens',
    target: 'psychic_phenomena',
    strength: 0.7,
    description: 'UFO witnesses frequently report developing psychic abilities after encounters, and remote viewers have claimed to perceive craft',
    bidirectional: true,
  },
  {
    source: 'ufos_aliens',
    target: 'psychological_experiences',
    strength: 0.6,
    description: 'Abduction experiences share patterns with sleep paralysis and NDEs, including tunnel vision and time distortion',
    bidirectional: true,
  },
  {
    source: 'ufos_aliens',
    target: 'religion_mythology',
    strength: 0.5,
    description: 'Ancient astronaut theory connects UFO phenomena to religious texts and mythological accounts of sky beings',
    bidirectional: true,
  },

  // Consciousness cluster
  {
    source: 'consciousness_practices',
    target: 'psychic_phenomena',
    strength: 0.9,
    description: 'Meditation and altered states are the primary gateway to psychic experiences across virtually all traditions',
    bidirectional: true,
  },
  {
    source: 'consciousness_practices',
    target: 'psychological_experiences',
    strength: 0.85,
    description: 'NDEs, lucid dreams, and astral projection share neural correlates and phenomenological features',
    bidirectional: true,
  },
  {
    source: 'consciousness_practices',
    target: 'esoteric_practices',
    strength: 0.7,
    description: 'Esoteric traditions use consciousness-altering techniques as their primary methodology',
    bidirectional: true,
  },

  // Psychic cluster
  {
    source: 'psychic_phenomena',
    target: 'ghosts_hauntings',
    strength: 0.75,
    description: 'Mediumship and psychic sensitivity are central to ghost investigation and spirit communication',
    bidirectional: true,
  },
  {
    source: 'psychic_phenomena',
    target: 'esoteric_practices',
    strength: 0.6,
    description: 'Divination, scrying, and ritual practices often produce psychic-like results',
    bidirectional: true,
  },

  // Ghost cluster
  {
    source: 'ghosts_hauntings',
    target: 'perception_sensory',
    strength: 0.7,
    description: 'Haunting experiences are primarily perceptual — visual apparitions, auditory phenomena, and temperature anomalies',
    bidirectional: true,
  },
  {
    source: 'ghosts_hauntings',
    target: 'psychological_experiences',
    strength: 0.6,
    description: 'Ghost encounters overlap with hypnagogic states, grief hallucinations, and environmental psychology',
    bidirectional: true,
  },
  {
    source: 'ghosts_hauntings',
    target: 'religion_mythology',
    strength: 0.5,
    description: 'Concepts of spirits, afterlife, and haunting are deeply embedded in religious and mythological frameworks',
    bidirectional: true,
  },

  // Perception/Biology cluster
  {
    source: 'perception_sensory',
    target: 'psychological_experiences',
    strength: 0.8,
    description: 'Sensory anomalies and psychological experiences share neurological pathways and often co-occur',
    bidirectional: true,
  },
  {
    source: 'perception_sensory',
    target: 'biological_factors',
    strength: 0.75,
    description: 'Electromagnetic sensitivity, infrasound effects, and neurological conditions directly affect perception',
    bidirectional: true,
  },
  {
    source: 'biological_factors',
    target: 'psychological_experiences',
    strength: 0.7,
    description: 'Brain chemistry, DMT release during NDEs, and physiological stress responses trigger anomalous experiences',
    bidirectional: true,
  },
  {
    source: 'biological_factors',
    target: 'consciousness_practices',
    strength: 0.5,
    description: 'Meditation measurably alters brain structure and chemistry; biological factors influence consciousness expansion',
    bidirectional: true,
  },

  // Cryptid connections
  {
    source: 'cryptids',
    target: 'perception_sensory',
    strength: 0.5,
    description: 'Cryptid sightings often involve ambiguous visual conditions and pattern recognition in natural environments',
    bidirectional: true,
  },
  {
    source: 'cryptids',
    target: 'biological_factors',
    strength: 0.4,
    description: 'Some cryptids may represent undiscovered species, while others correlate with environmental conditions',
    bidirectional: true,
  },
  {
    source: 'cryptids',
    target: 'religion_mythology',
    strength: 0.6,
    description: 'Many cryptids originate from indigenous mythology and religious folklore traditions worldwide',
    bidirectional: true,
  },

  // Religion/Esoteric cluster
  {
    source: 'religion_mythology',
    target: 'esoteric_practices',
    strength: 0.8,
    description: 'Esoteric traditions often draw from and reinterpret religious and mythological frameworks',
    bidirectional: true,
  },

  // Combination node connects to major clusters
  {
    source: 'combination',
    target: 'ufos_aliens',
    strength: 0.4,
    description: 'Multi-phenomenon cases frequently involve UFO components alongside other anomalies',
    bidirectional: true,
  },
  {
    source: 'combination',
    target: 'psychic_phenomena',
    strength: 0.4,
    description: 'Cross-disciplinary cases often include psychic elements connecting different phenomenon types',
    bidirectional: true,
  },
  {
    source: 'combination',
    target: 'consciousness_practices',
    strength: 0.4,
    description: 'Consciousness research bridges multiple phenomenon categories through shared experiential features',
    bidirectional: true,
  },
]

// ── Helper Functions ──

/**
 * Get all edges connected to a given category
 */
export function getEdgesForCategory(category: PhenomenonCategory): ConstellationEdge[] {
  return CONSTELLATION_EDGES.filter(
    e => e.source === category || e.target === category
  )
}

/**
 * Get connected categories for a given category, sorted by connection strength
 */
export function getConnectedCategories(category: PhenomenonCategory): { category: PhenomenonCategory; strength: number; description: string }[] {
  const edges = getEdgesForCategory(category)
  return edges
    .map(e => ({
      category: e.source === category ? e.target : e.source,
      strength: e.strength,
      description: e.description,
    }))
    .sort((a, b) => b.strength - a.strength)
}

/**
 * Get a node by its category ID
 */
export function getNode(category: PhenomenonCategory): ConstellationNode | undefined {
  return CONSTELLATION_NODES.find(n => n.id === category)
}

/**
 * Calculate which categories the user should explore next
 * based on their current interests and connection strengths
 */
export function getSuggestedExplorations(
  userInterests: PhenomenonCategory[],
  maxSuggestions = 3
): { category: PhenomenonCategory; reason: string; strength: number }[] {
  if (userInterests.length === 0) return []

  const suggestions: Map<PhenomenonCategory, { reason: string; strength: number }> = new Map()

  for (const interest of userInterests) {
    const connected = getConnectedCategories(interest)
    for (const conn of connected) {
      // Skip if already an interest
      if (userInterests.includes(conn.category)) continue

      const existing = suggestions.get(conn.category)
      if (!existing || conn.strength > existing.strength) {
        const node = getNode(interest)
        suggestions.set(conn.category, {
          reason: `Connected to ${node?.label || interest}`,
          strength: conn.strength,
        })
      }
    }
  }

  return Array.from(suggestions.entries())
    .map(([category, data]) => ({ category, ...data }))
    .sort((a, b) => b.strength - a.strength)
    .slice(0, maxSuggestions)
}

/**
 * Generate background stars for decorative effect
 */
export function generateBackgroundStars(count: number, seed = 42): { x: number; y: number; size: number; opacity: number }[] {
  // Simple seeded random for deterministic stars
  let s = seed
  function random() {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }

  return Array.from({ length: count }, () => ({
    x: random(),
    y: random(),
    size: random() * 1.5 + 0.3,
    opacity: random() * 0.5 + 0.1,
  }))
}
