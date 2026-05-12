/**
 * Researcher Overlap — V10.3 (QA #6)
 *
 * Scoring engine for the "Researcher Overlap" social feature in
 * the Research Pulse box. Surfaces other Paradocs members whose
 * save library meaningfully overlaps with the current user's.
 *
 * Design constraints (panel consensus — see commit V10.3a):
 *   • At scale (millions of saves), naive "shared count" is
 *     dominated by popular items. Two strangers who both saved
 *     Roswell isn't a kindred-researcher signal.
 *   • Solution: IDF-weighted overlap. Each shared item contributes
 *     a weight inversely proportional to its global popularity:
 *        weight(I) = 1 / log10(global_save_count(I) + 10)
 *     Roswell (saved 1M+ times) → weight ≈ 0.16
 *     A rare BFRO submission (saved 8 times) → weight ≈ 0.83
 *   • Three quality gates must ALL pass before a pair counts:
 *        scoreFloor    — weighted score ≥ 1.5 (≈3 moderate saves)
 *        minItems      — ≥2 distinct shared items
 *        diversity     — ≥1 external OR ≥3 internal shared items
 *   • Two visible tiers in the UI:
 *        Strong   — score ≥ 3.0
 *        Notable  — 1.5 ≤ score < 3.0
 *
 * Thresholds are arguments to `computeResearcherOverlap` so the
 * admin dashboard can A/B-tune them at runtime without redeploys.
 *
 * Privacy:
 *   • Honors profiles.researcher_overlap_visible (mutual gate —
 *     both parties must be visible).
 *   • Anonymous users (no auth) never appear in or receive lists.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

// ── Default thresholds (per V10.3 panel) ─────────────────────
// Exported so the admin dashboard can read + override them.
export const DEFAULT_THRESHOLDS = {
  /** Minimum weighted overlap score for a pair to qualify. */
  scoreFloor: 1.5,
  /** Minimum distinct shared items. Guards against single-item noise. */
  minItems: 2,
  /** Minimum SHARED external (URL) saves. Either this OR minInternal must be met. */
  minExternal: 1,
  /** Minimum SHARED internal (Paradocs report/phenomenon) saves. Either this OR minExternal must be met. */
  minInternal: 3,
  /** Threshold for the "Strong" tier label. Above this = Strong, between scoreFloor and this = Notable. */
  strongTier: 3.0,
  /** Cap on candidates per shared item — protects against viral items pulling in thousands of candidates. */
  perItemFanoutCap: 50,
} as const

export interface OverlapThresholds {
  scoreFloor: number
  minItems: number
  minExternal: number
  minInternal: number
  strongTier: number
  perItemFanoutCap: number
}

export type OverlapItemKind = 'report' | 'phenomenon' | 'external_url_hash'

export interface OverlapSharedItem {
  kind: OverlapItemKind
  id: string
  /** Display title (resolved post-scoring). */
  title?: string
  /** Display thumbnail (resolved post-scoring). */
  thumbnailUrl?: string | null
  /** Optional slug for navigation to /report/[slug] or /phenomena/[slug]. */
  slug?: string
  /** External URL when kind === 'external_url_hash'. */
  url?: string | null
  /** Per-item IDF weight that contributed to the score. */
  weight: number
}

export interface OverlapMatch {
  userId: string
  username: string | null
  displayName: string | null
  avatarUrl: string | null
  /** Total weighted IDF score across all shared items. */
  score: number
  /** Tier label for UI badge. */
  tier: 'strong' | 'notable'
  /** Count breakdown for transparency in the UI. */
  externalCount: number
  internalCount: number
  /** Up to N shared items for the UI preview (caller decides how many to actually render). */
  sharedItems: OverlapSharedItem[]
}

export interface OverlapDebugRow {
  userId: string
  score: number
  externalCount: number
  internalCount: number
  totalItems: number
  passed: boolean
  reasonRejected?: string
}

/** Result of one overlap computation — exposes both the public + debug views. */
export interface OverlapComputeResult {
  /** Final ranked list of matches (post-filtering, post-tier-labeling). */
  matches: OverlapMatch[]
  /** All scored candidates (including rejected) — for admin tuning UI. */
  debug: OverlapDebugRow[]
  /** Sanity counters for the admin dashboard. */
  meta: {
    candidateCount: number
    passedCount: number
    strongCount: number
    notableCount: number
    rejectedByScore: number
    rejectedByItems: number
    rejectedByDiversity: number
    rejectedByVisibility: number
    /** ms — for perf monitoring. */
    durationMs: number
  }
}

// ── Internal types ───────────────────────────────────────────

interface RawSave {
  kind: OverlapItemKind
  itemId: string
}

interface ScoreAccumulator {
  score: number
  externalCount: number
  internalCount: number
  sharedItems: OverlapSharedItem[]
}

// ── IDF weight ───────────────────────────────────────────────

/**
 * IDF-style weight for a single saved item given its global save
 * count. The +10 floor keeps weights bounded for items saved <10
 * times (avoids weights >> 1.0 from extremely rare saves).
 */
export function idfWeight(globalSaveCount: number): number {
  return 1 / Math.log10(Math.max(0, globalSaveCount) + 10)
}

// ── Core scoring entry point ─────────────────────────────────

/**
 * Compute the researcher-overlap list for a single seed user.
 *
 * Strategy:
 *   1. Pull the seed user's saves across all three surfaces.
 *   2. For each saved item, look up which OTHER users also saved
 *      it (capped at `perItemFanoutCap` to bound viral fanout).
 *   3. Look up each item's global save count from the
 *      global_save_counts materialized view; compute IDF weight.
 *   4. Accumulate per-candidate-user: weighted score, distinct
 *      shared items (by kind), and a sample of shared items.
 *   5. Filter by quality gates (scoreFloor, minItems, diversity).
 *   6. Apply visibility gate (mutual researcher_overlap_visible).
 *   7. Resolve display fields (title, thumbnail) and sort.
 *
 * The Supabase client passed in should be a SERVICE-ROLE client
 * when used from an API route — it bypasses RLS to read other
 * users' saves (we manually enforce the visibility gate above).
 */
export async function computeResearcherOverlap(
  supabase: SupabaseClient,
  seedUserId: string,
  thresholds: OverlapThresholds = DEFAULT_THRESHOLDS,
  opts: { limit?: number; resolveDisplay?: boolean } = {},
): Promise<OverlapComputeResult> {
  const startedAt = Date.now()
  const limit = opts.limit ?? 10
  const resolveDisplay = opts.resolveDisplay ?? true

  // ── 0. Seed user's visibility gate ────────────────────────
  // If the seed user has opted out, they receive an empty list
  // (mutual courtesy: they're also not visible to others).
  const { data: seedProfile, error: seedErr } = await supabase
    .from('profiles')
    .select('researcher_overlap_visible')
    .eq('id', seedUserId)
    .single()
  if (seedErr || !seedProfile || seedProfile.researcher_overlap_visible === false) {
    return emptyResult(startedAt)
  }

  // ── 1. Pull seed user's saves ─────────────────────────────
  const seedSaves = await collectUserSaves(supabase, seedUserId)
  if (seedSaves.length === 0) {
    return emptyResult(startedAt)
  }

  // ── 2. Look up global save counts (IDF denominator) ───────
  const counts = await loadGlobalSaveCounts(supabase, seedSaves)

  // ── 3. + 4. For each save, find co-savers and accumulate ──
  const candidateAccum = new Map<string, ScoreAccumulator>()
  for (const save of seedSaves) {
    const globalCount = counts.get(save.kind + ':' + save.itemId) || 1
    const weight = idfWeight(globalCount)

    const coSavers = await fetchCoSavers(supabase, save, seedUserId, thresholds.perItemFanoutCap)
    for (const otherUserId of coSavers) {
      let acc = candidateAccum.get(otherUserId)
      if (!acc) {
        acc = { score: 0, externalCount: 0, internalCount: 0, sharedItems: [] }
        candidateAccum.set(otherUserId, acc)
      }
      acc.score += weight
      if (save.kind === 'external_url_hash') {
        acc.externalCount++
      } else {
        acc.internalCount++
      }
      acc.sharedItems.push({ kind: save.kind, id: save.itemId, weight })
    }
  }

  // ── 5. Apply quality gates + ── 6. visibility ────────────
  const candidateUserIds = Array.from(candidateAccum.keys())
  const visibilityMap = await loadVisibilityMap(supabase, candidateUserIds)

  const debug: OverlapDebugRow[] = []
  const passed: Array<{ userId: string; acc: ScoreAccumulator }> = []

  const meta = {
    candidateCount: candidateUserIds.length,
    passedCount: 0,
    strongCount: 0,
    notableCount: 0,
    rejectedByScore: 0,
    rejectedByItems: 0,
    rejectedByDiversity: 0,
    rejectedByVisibility: 0,
    durationMs: 0,
  }

  // Use forEach for compatibility without downlevelIteration on Maps.
  candidateAccum.forEach((acc, userId) => {
    const totalItems = acc.externalCount + acc.internalCount
    let rejectedReason: string | undefined
    if (visibilityMap.get(userId) === false) {
      rejectedReason = 'visibility'
      meta.rejectedByVisibility++
    } else if (acc.score < thresholds.scoreFloor) {
      rejectedReason = 'score'
      meta.rejectedByScore++
    } else if (totalItems < thresholds.minItems) {
      rejectedReason = 'items'
      meta.rejectedByItems++
    } else if (acc.externalCount < thresholds.minExternal && acc.internalCount < thresholds.minInternal) {
      rejectedReason = 'diversity'
      meta.rejectedByDiversity++
    }

    debug.push({
      userId,
      score: round3(acc.score),
      externalCount: acc.externalCount,
      internalCount: acc.internalCount,
      totalItems,
      passed: !rejectedReason,
      reasonRejected: rejectedReason,
    })

    if (!rejectedReason) {
      passed.push({ userId, acc })
    }
  })

  // ── 7. Resolve display fields ────────────────────────────
  passed.sort((a, b) => b.acc.score - a.acc.score)
  const top = passed.slice(0, limit)

  let matches: OverlapMatch[] = top.map(({ userId, acc }) => {
    const tier: 'strong' | 'notable' = acc.score >= thresholds.strongTier ? 'strong' : 'notable'
    if (tier === 'strong') meta.strongCount++
    else meta.notableCount++
    return {
      userId,
      username: null,
      displayName: null,
      avatarUrl: null,
      score: round3(acc.score),
      tier,
      externalCount: acc.externalCount,
      internalCount: acc.internalCount,
      sharedItems: acc.sharedItems.slice(0, 6), // preview only
    }
  })

  if (resolveDisplay && matches.length > 0) {
    matches = await resolveProfileDisplay(supabase, matches)
    matches = await resolveSharedItemDisplay(supabase, matches)
  }

  meta.passedCount = matches.length
  meta.durationMs = Date.now() - startedAt

  return { matches, debug, meta }
}

// ── Helpers ──────────────────────────────────────────────────

function emptyResult(startedAt: number): OverlapComputeResult {
  return {
    matches: [],
    debug: [],
    meta: {
      candidateCount: 0,
      passedCount: 0,
      strongCount: 0,
      notableCount: 0,
      rejectedByScore: 0,
      rejectedByItems: 0,
      rejectedByDiversity: 0,
      rejectedByVisibility: 0,
      durationMs: Date.now() - startedAt,
    },
  }
}

async function collectUserSaves(supabase: SupabaseClient, userId: string): Promise<RawSave[]> {
  const saves: RawSave[] = []

  const { data: reports } = await supabase
    .from('saved_reports')
    .select('report_id')
    .eq('user_id', userId)
  if (reports) {
    for (const r of reports) if (r.report_id) saves.push({ kind: 'report', itemId: r.report_id })
  }

  const { data: phenomena } = await supabase
    .from('saved_phenomena')
    .select('phenomenon_id')
    .eq('user_id', userId)
  if (phenomena) {
    for (const p of phenomena) if (p.phenomenon_id) saves.push({ kind: 'phenomenon', itemId: p.phenomenon_id })
  }

  const { data: artifacts } = await supabase
    .from('constellation_artifacts')
    .select('external_url_hash')
    .eq('user_id', userId)
    .not('external_url_hash', 'is', null)
    .neq('source_type', 'paradocs_report')
  if (artifacts) {
    for (const a of artifacts) if (a.external_url_hash) saves.push({ kind: 'external_url_hash', itemId: a.external_url_hash })
  }

  return saves
}

async function loadGlobalSaveCounts(supabase: SupabaseClient, saves: RawSave[]): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (saves.length === 0) return map

  // Group keys by kind so we can chunk one IN-list per kind
  // (Supabase / Postgres handles ~thousands of IN values fine).
  const byKind: Record<OverlapItemKind, string[]> = {
    report: [],
    phenomenon: [],
    external_url_hash: [],
  }
  for (const s of saves) byKind[s.kind].push(s.itemId)

  for (const kind of Object.keys(byKind) as OverlapItemKind[]) {
    const ids = Array.from(new Set(byKind[kind]))
    if (ids.length === 0) continue
    const { data } = await supabase
      .from('global_save_counts')
      .select('item_id, save_count')
      .eq('item_kind', kind)
      .in('item_id', ids)
    if (data) {
      for (const row of data) {
        map.set(kind + ':' + row.item_id, Number(row.save_count) || 1)
      }
    }
  }
  return map
}

async function fetchCoSavers(
  supabase: SupabaseClient,
  save: RawSave,
  excludeUserId: string,
  cap: number,
): Promise<string[]> {
  // Pick the right table + column per item kind.
  const { table, column } = TABLES_BY_KIND[save.kind]
  const query = supabase
    .from(table)
    .select('user_id')
    .eq(column, save.itemId)
    .neq('user_id', excludeUserId)
    .limit(cap)
  // For external URL hashes, also filter out paradocs_report
  // shadow rows (those would double-count with saved_reports).
  if (save.kind === 'external_url_hash') {
    query.neq('source_type', 'paradocs_report')
  }
  const { data } = await query
  if (!data) return []
  return data.map((r: any) => r.user_id).filter(Boolean)
}

const TABLES_BY_KIND: Record<OverlapItemKind, { table: string; column: string }> = {
  report:            { table: 'saved_reports',           column: 'report_id' },
  phenomenon:        { table: 'saved_phenomena',         column: 'phenomenon_id' },
  external_url_hash: { table: 'constellation_artifacts', column: 'external_url_hash' },
}

async function loadVisibilityMap(supabase: SupabaseClient, userIds: string[]): Promise<Map<string, boolean>> {
  const map = new Map<string, boolean>()
  if (userIds.length === 0) return map
  const { data } = await supabase
    .from('profiles')
    .select('id, researcher_overlap_visible')
    .in('id', userIds)
  if (data) {
    for (const row of data) {
      map.set(row.id, row.researcher_overlap_visible !== false)
    }
  }
  // Profiles not found default to visible=false (safe).
  for (const id of userIds) if (!map.has(id)) map.set(id, false)
  return map
}

async function resolveProfileDisplay(supabase: SupabaseClient, matches: OverlapMatch[]): Promise<OverlapMatch[]> {
  if (matches.length === 0) return matches
  const ids = matches.map(m => m.userId)
  const { data } = await supabase
    .from('profiles')
    .select('id, username, display_name, avatar_url')
    .in('id', ids)
  const byId = new Map<string, any>()
  if (data) for (const p of data) byId.set(p.id, p)
  return matches.map(m => {
    const p = byId.get(m.userId)
    return {
      ...m,
      username: p?.username || null,
      displayName: p?.display_name || null,
      avatarUrl: p?.avatar_url || null,
    }
  })
}

/**
 * Resolves human-readable titles/thumbnails for the previewed
 * shared items so the UI can render an actual list. Batches per
 * item kind to minimize round-trips.
 */
async function resolveSharedItemDisplay(supabase: SupabaseClient, matches: OverlapMatch[]): Promise<OverlapMatch[]> {
  const byKind: Record<OverlapItemKind, Set<string>> = {
    report: new Set(),
    phenomenon: new Set(),
    external_url_hash: new Set(),
  }
  for (const m of matches) {
    for (const it of m.sharedItems) byKind[it.kind].add(it.id)
  }

  const reportMap = new Map<string, any>()
  if (byKind.report.size > 0) {
    const { data } = await supabase
      .from('reports')
      .select('id, title, slug, image_url')
      .in('id', Array.from(byKind.report))
    if (data) for (const r of data) reportMap.set(r.id, r)
  }

  const phenomMap = new Map<string, any>()
  if (byKind.phenomenon.size > 0) {
    const { data } = await supabase
      .from('phenomena')
      .select('id, name, slug, hero_image_url')
      .in('id', Array.from(byKind.phenomenon))
    if (data) for (const p of data) phenomMap.set(p.id, p)
  }

  const externalMap = new Map<string, any>()
  if (byKind.external_url_hash.size > 0) {
    const { data } = await supabase
      .from('constellation_external_url_signals')
      .select('url_hash, canonical_url, title, thumbnail_url')
      .in('url_hash', Array.from(byKind.external_url_hash))
    if (data) for (const s of data) externalMap.set(s.url_hash, s)
  }

  return matches.map(m => ({
    ...m,
    sharedItems: m.sharedItems.map(it => {
      if (it.kind === 'report') {
        const r = reportMap.get(it.id)
        return r ? { ...it, title: r.title, slug: r.slug, thumbnailUrl: r.image_url } : it
      }
      if (it.kind === 'phenomenon') {
        const p = phenomMap.get(it.id)
        return p ? { ...it, title: p.name, slug: p.slug, thumbnailUrl: p.hero_image_url } : it
      }
      // external_url_hash
      const ext = externalMap.get(it.id)
      return ext
        ? { ...it, title: ext.title || ext.canonical_url, url: ext.canonical_url, thumbnailUrl: ext.thumbnail_url }
        : it
    }),
  }))
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000
}
