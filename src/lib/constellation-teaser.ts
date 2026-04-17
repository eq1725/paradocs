/**
 * Teaser galaxy for the constellation empty state.
 *
 * When the user has fewer than 5 real logged entries, we blend in ghost
 * entries + ghost connections so the canvas never looks empty. This turns
 * the cold-start problem into a progression mechanic: new users see a
 * beautiful preview of what their own galaxy could look like, with a
 * CTA overlay telling them how many more saves to unlock it.
 *
 * Ghost entries:
 *   - Deterministic — same seed → same ghost galaxy (no jitter on refresh)
 *   - Distributed across categories so every nebula lights up
 *   - Carry isGhost: true so the renderer dims them and hit-testing skips them
 *   - Have fake IDs (prefixed `ghost-`) so they can't collide with real data
 */

import type { EntryNode } from './constellation-types'

const GHOST_ENTRIES: Array<{
  id: string
  category: string
  verdict: string
  tags: string[]
}> = [
  // A curated set of ~15 ghost stars spread across categories and connected
  // by shared tags — enough to form a visible network shape. Tag overlaps
  // are hand-tuned so the force simulation produces a pleasing silhouette.
  { id: 'ghost-1', category: 'ufos_aliens',              verdict: 'compelling',   tags: ['ufo', 'triangle', 'military'] },
  { id: 'ghost-2', category: 'ufos_aliens',              verdict: 'inconclusive', tags: ['ufo', 'dashcam'] },
  { id: 'ghost-3', category: 'cryptids',                 verdict: 'inconclusive', tags: ['bigfoot', 'forest', 'witness'] },
  { id: 'ghost-4', category: 'cryptids',                 verdict: 'compelling',   tags: ['mothman', 'bridge'] },
  { id: 'ghost-5', category: 'ghosts_hauntings',         verdict: 'inconclusive', tags: ['apparition', 'residual', 'witness'] },
  { id: 'ghost-6', category: 'ghosts_hauntings',         verdict: 'needs_info',   tags: ['poltergeist', 'evp'] },
  { id: 'ghost-7', category: 'psychic_phenomena',        verdict: 'compelling',   tags: ['remote-viewing', 'esp'] },
  { id: 'ghost-8', category: 'psychic_phenomena',        verdict: 'inconclusive', tags: ['telepathy', 'esp'] },
  { id: 'ghost-9', category: 'consciousness_practices',  verdict: 'compelling',   tags: ['astral', 'meditation', 'esp'] },
  { id: 'ghost-10', category: 'psychological_experiences', verdict: 'needs_info', tags: ['nde', 'tunnel', 'witness'] },
  { id: 'ghost-11', category: 'psychological_experiences', verdict: 'compelling', tags: ['sleep-paralysis', 'apparition'] },
  { id: 'ghost-12', category: 'religion_mythology',      verdict: 'inconclusive', tags: ['vision', 'nde'] },
  { id: 'ghost-13', category: 'esoteric_practices',      verdict: 'needs_info',   tags: ['ritual', 'tarot'] },
  { id: 'ghost-14', category: 'perception_sensory',      verdict: 'skeptical',    tags: ['synesthesia', 'sensory'] },
  { id: 'ghost-15', category: 'biological_factors',      verdict: 'inconclusive', tags: ['emf', 'sensory'] },
]

/**
 * Returns a list of ghost EntryNodes to blend into the canvas. All ghosts
 * share `reportId = ''` and `slug = ''` so they can't be navigated to, and
 * they're tagged with `isGhost: true` for the renderer to dim them.
 */
export function getTeaserGhosts(): EntryNode[] {
  return GHOST_ENTRIES.map(g => ({
    id: g.id,
    reportId: '',
    name: '',             // ghosts never show names on hover
    slug: '',
    category: g.category,
    imageUrl: null,
    locationName: null,
    eventDate: null,
    summary: null,
    note: '',
    verdict: g.verdict,
    tags: g.tags,
    loggedAt: new Date(Date.now() - Math.random() * 7776000000).toISOString(),
    updatedAt: new Date().toISOString(),
    isGhost: true,
  }))
}

/**
 * Build synthetic tag connections from the ghost set so the force
 * simulation produces visible filament bridges in the teaser view.
 * Mirrors what the user-map API does for real entries: groups ghost IDs
 * by shared tag, only keeping groups with 2+ members.
 */
export function getTeaserTagConnections(): Array<{ tag: string; entryIds: string[] }> {
  const byTag: Record<string, string[]> = {}
  for (const g of GHOST_ENTRIES) {
    for (const tag of g.tags) {
      if (!byTag[tag]) byTag[tag] = []
      byTag[tag].push(g.id)
    }
  }
  return Object.entries(byTag)
    .filter(([, ids]) => ids.length >= 2)
    .map(([tag, entryIds]) => ({ tag, entryIds }))
}

/** Threshold below which the teaser blends in. 5 and above, real-only. */
export const TEASER_THRESHOLD = 5
