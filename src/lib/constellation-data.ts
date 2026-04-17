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

// ── Keyword → Category Inference ──
// Used to place external artifacts (YouTube videos, Reddit posts, etc.) into
// the appropriate ring segment when the user hasn't manually picked a category.
// Tuned conservatively: ambiguous tags fall through to 'combination' instead
// of forcing a bad fit.

const CATEGORY_KEYWORDS: Record<PhenomenonCategory, string[]> = {
  ufos_aliens: [
    'ufo', 'uap', 'uaps', 'ufos', 'alien', 'aliens', 'extraterrestrial', 'et',
    'abduction', 'abducted', 'craft', 'saucer', 'disk', 'flying-saucer',
    'nuforc', 'mufon', 'nhi', 'non-human', 'roswell', 'triangle',
  ],
  cryptids: [
    'bigfoot', 'sasquatch', 'cryptid', 'cryptids', 'mothman', 'chupacabra',
    'yeti', 'loch-ness', 'nessie', 'dogman', 'skinwalker', 'jersey-devil',
    'bfro', 'squatch',
  ],
  ghosts_hauntings: [
    'ghost', 'ghosts', 'haunted', 'haunting', 'poltergeist', 'apparition',
    'spirit', 'spirits', 'spectral', 'paranormal', 'ema', 'evp', 'residual',
    'entity',
  ],
  psychic_phenomena: [
    'psychic', 'esp', 'telepathy', 'precognition', 'remote-viewing',
    'clairvoyance', 'telekinesis', 'pk', 'psychokinesis', 'medium',
    'mediumship', 'premonition',
  ],
  consciousness_practices: [
    'meditation', 'astral', 'astral-projection', 'lucid-dream', 'lucid-dreaming',
    'altered-state', 'consciousness', 'oobe', 'out-of-body', 'obe',
    'kundalini', 'third-eye', 'mindfulness',
  ],
  psychological_experiences: [
    'nde', 'near-death', 'sleep-paralysis', 'deja-vu', 'dissociation',
    'derealization', 'jamais-vu', 'depersonalization', 'hypnagogic',
    'hypnopompic',
  ],
  biological_factors: [
    'electromagnetic', 'emf', 'infrasound', 'bioelectric', 'neurology',
    'brain-chemistry', 'dmt', 'pineal', 'electrosensitivity',
  ],
  perception_sensory: [
    'synesthesia', 'visual-anomaly', 'auditory-anomaly', 'perception',
    'sensory', 'hallucination', 'illusion',
  ],
  religion_mythology: [
    'vision', 'miracle', 'divine', 'angel', 'angels', 'demon', 'religious',
    'prophecy', 'prophet', 'marian', 'fatima', 'stigmata', 'myth',
    'mythology', 'folklore',
  ],
  esoteric_practices: [
    'occult', 'ritual', 'magick', 'magic', 'divination', 'hermetic', 'tarot',
    'scrying', 'ouija', 'sigil', 'chaos-magic', 'thelema', 'kabbalah',
  ],
  combination: [], // fallback category — matches nothing explicitly
}

/**
 * Infer the most likely phenomena category for an artifact based on its tags.
 * Returns 'combination' if no strong match is found.
 *
 * Matching rules:
 * - Tags are normalized to lowercase with spaces → hyphens for lookup.
 * - A match in any CATEGORY_KEYWORDS list scores that category by 1.
 * - Category with the highest score wins. Ties → earliest in CATEGORY_KEYWORDS.
 * - No matches → 'combination'.
 */
export function inferCategoryFromTags(tags: string[]): PhenomenonCategory {
  if (!tags || tags.length === 0) return 'combination'

  const normalized = tags.map(t => t.toLowerCase().trim().replace(/\s+/g, '-'))
  const scores: Partial<Record<PhenomenonCategory, number>> = {}

  for (const tag of normalized) {
    for (const [cat, keywords] of Object.entries(CATEGORY_KEYWORDS) as Array<
      [PhenomenonCategory, string[]]
    >) {
      for (const kw of keywords) {
        if (tag === kw || tag.includes(kw)) {
          scores[cat] = (scores[cat] || 0) + 1
          break
        }
      }
    }
  }

  let bestCat: PhenomenonCategory = 'combination'
  let bestScore = 0
  for (const [cat, score] of Object.entries(scores) as Array<
    [PhenomenonCategory, number]
  >) {
    if (score > bestScore) {
      bestScore = score
      bestCat = cat
    }
  }
  return bestCat
}

// ── Emergent Pattern Detector ──
//
// Analyzes the user's entries and surfaces likely-meaningful connections
// without requiring them to draw anything manually. The detector combines
// four signals: tag similarity (Jaccard), temporal proximity, shared
// location name, and category+verdict alignment. Pairs that score above
// the threshold get rendered as dashed cyan filaments.
//
// Design intent: users shouldn't need to study their own evidence to find
// patterns — the map should do it for them. This is the "Ancestry.com
// automatically suggests branches" experience, transplanted to the paranormal
// research context.

export interface EmergentConnection {
  /** source entry ID */
  source: string
  /** target entry ID */
  target: string
  /** normalized strength 0-1 (higher = stronger pattern signal) */
  strength: number
  /** human-readable reasons the detector matched this pair */
  reasons: string[]
}

interface DetectorEntry {
  id: string
  category: string
  verdict: string
  tags: string[]
  eventDate: string | null
  locationName: string | null
}

const TEMPORAL_WINDOW_DAYS = 30
const MIN_JACCARD = 0.25
const MIN_SCORE = 0.45

/**
 * Returns all pairs of entries with enough combined signal to merit showing
 * a connection. Runs in O(n²) over entries — fine for user collections up
 * to a few hundred entries. Above that we'd want to bucket by category or
 * tag index first.
 */
export function detectEmergentConnections(entries: DetectorEntry[]): EmergentConnection[] {
  const out: EmergentConnection[] = []

  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i]
      const b = entries[j]

      // Skip self-connections and entries with no signal at all.
      if (!a.tags?.length && !b.tags?.length && !a.eventDate && !b.eventDate) continue

      let score = 0
      const reasons: string[] = []

      // ── Tag similarity (Jaccard) ──
      if (a.tags?.length && b.tags?.length) {
        const setA = new Set(a.tags.map(t => t.toLowerCase()))
        const setB = new Set(b.tags.map(t => t.toLowerCase()))
        const sharedArr = Array.from(setA).filter(t => setB.has(t))
        const union = new Set([...Array.from(setA), ...Array.from(setB)])
        const jaccard = sharedArr.length / Math.max(union.size, 1)
        if (jaccard >= MIN_JACCARD && sharedArr.length >= 1) {
          score += jaccard * 0.6
          reasons.push(`${sharedArr.length} shared tag${sharedArr.length === 1 ? '' : 's'}`)
        }
      }

      // ── Temporal proximity ──
      if (a.eventDate && b.eventDate) {
        const da = new Date(a.eventDate).getTime()
        const db = new Date(b.eventDate).getTime()
        if (!isNaN(da) && !isNaN(db)) {
          const days = Math.abs(da - db) / 86400000
          if (days < TEMPORAL_WINDOW_DAYS) {
            const proximity = 1 - days / TEMPORAL_WINDOW_DAYS
            score += proximity * 0.35
            if (days < 1) reasons.push('same day')
            else if (days < 7) reasons.push(`${Math.round(days)} days apart`)
            else reasons.push(`within ${Math.round(days)} days`)
          }
        }
      }

      // ── Same location (text match, case-insensitive) ──
      if (
        a.locationName && b.locationName &&
        a.locationName.trim().toLowerCase() === b.locationName.trim().toLowerCase()
      ) {
        score += 0.45
        reasons.push(`same location (${a.locationName})`)
      }

      // ── Category + both-compelling ──
      if (
        a.category === b.category &&
        a.verdict === 'compelling' && b.verdict === 'compelling'
      ) {
        score += 0.25
        reasons.push('both compelling · same category')
      }

      if (score >= MIN_SCORE) {
        out.push({
          source: a.id,
          target: b.id,
          strength: Math.min(1, score),
          reasons,
        })
      }
    }
  }

  return out
}

// ── Library-wide Insight Aggregator ──
//
// While detectEmergentConnections returns pairwise links between stars,
// detectInsights rolls patterns up to library level — the kind of
// observations a research assistant would write in a margin note:
//
//   "5 of your saves share the tag 'military' — mostly compelling UFO reports."
//   "3 reports cluster in Arizona between May and July 2024."
//   "You have 4 compelling ghost-hauntings in the last 6 months."
//
// These are what surface in the Insights panel as text cards, and what
// interleave between entry rows in the List view.

export interface Insight {
  id: string
  type: 'tag_cluster' | 'location_cluster' | 'temporal_cluster' | 'category_compelling' | 'cross_category'
  title: string
  body: string
  /** IDs of entries this insight references — used to pan/highlight the canvas */
  entryIds: string[]
  /** 0-1 significance — controls sort order and card prominence */
  strength: number
  /** Optional category id for color-coding */
  category?: string
}

interface InsightEntry {
  id: string
  category: string
  verdict: string
  tags: string[]
  eventDate: string | null
  locationName: string | null
}

const TAG_CLUSTER_MIN = 3
const LOCATION_CLUSTER_MIN = 2
const TEMPORAL_WINDOW_DAYS_INSIGHT = 60
const TEMPORAL_CLUSTER_MIN = 3
const CATEGORY_COMPELLING_MIN = 3

export function detectInsights(entries: InsightEntry[]): Insight[] {
  if (entries.length < 2) return []
  const out: Insight[] = []

  // ── Tag clusters ──
  const byTag: Record<string, string[]> = {}
  for (const e of entries) {
    for (const raw of e.tags || []) {
      const t = raw.trim().toLowerCase()
      if (!t) continue
      if (!byTag[t]) byTag[t] = []
      byTag[t].push(e.id)
    }
  }
  for (const [tag, ids] of Object.entries(byTag)) {
    if (ids.length < TAG_CLUSTER_MIN) continue
    // Strength rises with cluster size but caps so super-common tags don't
    // dominate the insight feed.
    const strength = Math.min(0.9, 0.4 + ids.length * 0.08)
    out.push({
      id: `tag:${tag}`,
      type: 'tag_cluster',
      title: `${ids.length} saves share #${tag}`,
      body: `You've tagged ${ids.length} sources with "${tag}". Tap to highlight them on the galaxy.`,
      entryIds: ids,
      strength,
    })
  }

  // ── Location clusters ──
  const byLocation: Record<string, string[]> = {}
  for (const e of entries) {
    if (!e.locationName) continue
    const key = e.locationName.trim().toLowerCase()
    if (!key) continue
    if (!byLocation[key]) byLocation[key] = []
    byLocation[key].push(e.id)
  }
  for (const [loc, ids] of Object.entries(byLocation)) {
    if (ids.length < LOCATION_CLUSTER_MIN) continue
    // Pretty-print location from the first entry that used it
    const label = entries.find(e => e.locationName?.trim().toLowerCase() === loc)?.locationName || loc
    const strength = Math.min(0.9, 0.55 + ids.length * 0.1)
    out.push({
      id: `loc:${loc}`,
      type: 'location_cluster',
      title: `${ids.length} reports from ${label}`,
      body: `Geographic cluster — ${ids.length} of your sources reference ${label}.`,
      entryIds: ids,
      strength,
    })
  }

  // ── Temporal clusters (60-day rolling window) ──
  const dated = entries
    .filter(e => e.eventDate)
    .map(e => ({ id: e.id, t: new Date(e.eventDate!).getTime() }))
    .filter(e => !isNaN(e.t))
    .sort((a, b) => a.t - b.t)
  const seenTemporalIds = new Set<string>()
  for (let i = 0; i < dated.length; i++) {
    const windowStart = dated[i].t
    const windowEnd = windowStart + TEMPORAL_WINDOW_DAYS_INSIGHT * 86400000
    const group: string[] = [dated[i].id]
    for (let j = i + 1; j < dated.length; j++) {
      if (dated[j].t <= windowEnd) group.push(dated[j].id)
      else break
    }
    if (group.length >= TEMPORAL_CLUSTER_MIN && !group.every(id => seenTemporalIds.has(id))) {
      group.forEach(id => seenTemporalIds.add(id))
      const start = new Date(windowStart).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      const end = new Date(Math.min(windowEnd, dated[i + group.length - 1]?.t ?? windowEnd))
        .toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
      const strength = Math.min(0.85, 0.5 + group.length * 0.06)
      out.push({
        id: `time:${windowStart}`,
        type: 'temporal_cluster',
        title: `${group.length} events, ${start}${start !== end ? '–' + end : ''}`,
        body: `A burst of ${group.length} events within a ${TEMPORAL_WINDOW_DAYS_INSIGHT}-day window. Often a sign of a wave or investigation thread.`,
        entryIds: group,
        strength,
      })
    }
  }

  // ── Category-compelling clusters ──
  const compellingByCat: Record<string, string[]> = {}
  for (const e of entries) {
    if (e.verdict !== 'compelling') continue
    if (!compellingByCat[e.category]) compellingByCat[e.category] = []
    compellingByCat[e.category].push(e.id)
  }
  for (const [cat, ids] of Object.entries(compellingByCat)) {
    if (ids.length < CATEGORY_COMPELLING_MIN) continue
    const node = CONSTELLATION_NODES.find(n => n.id === cat)
    const catLabel = node?.label || cat
    const strength = Math.min(0.95, 0.6 + ids.length * 0.08)
    out.push({
      id: `compelling:${cat}`,
      type: 'category_compelling',
      title: `${ids.length} compelling ${catLabel} sources`,
      body: `${ids.length} of your ${catLabel} saves are marked compelling — your strongest evidence concentration in this category.`,
      entryIds: ids,
      strength,
      category: cat,
    })
  }

  // Sort by strength descending, cap at 20 for sanity
  return out.sort((a, b) => b.strength - a.strength).slice(0, 20)
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
