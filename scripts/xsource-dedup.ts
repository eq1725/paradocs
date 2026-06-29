#!/usr/bin/env tsx
/**
 * xsource-dedup.ts — V11.36 (production apply path; see DEDUP_HARDENING_PANEL_REVIEW.md)
 *
 * Source-AGNOSTIC cross-source MERGE pass. Collapses re-publications of the
 * SAME account (NUFORC↔CUFOS catalogue overlap, wire-story reprints, Reddit
 * cross-posts) to a single canonical row — reversibly, with provenance.
 *
 * It NEVER merges independent witnesses of the same event (Phoenix-Lights
 * protection). The merge rule (validated in scripts/xsource-dedup-dryrun.ts):
 *   MERGE iff
 *     (a) near-verbatim text  : word-shingle Jaccard >= MERGE_TEXT  (any source), OR
 *     (b) editorial reprint   : both sources EDITORIAL and cosine >= EDITORIAL_MERGE_COSINE
 *   gated by event-date proximity (<= DAYS) and geo proximity (<= KM).
 * Everything else that's semantically close is corroboration — left untouched
 * here; event-clustering ("N reports of this event") is a separate pass.
 *
 * Canonical selection: prefer narrative → longest description → earliest created.
 * Non-canonical members are ARCHIVED (status='archived') with:
 *   metadata.duplicate_of   = <canonical id>
 *   metadata.dup_method     = 'near-verbatim' | 'editorial-reprint'
 *   metadata.dup_sim        = cosine
 * and the canonical gets metadata.also_reported_in = [distinct source_types].
 * Reversible: prior {id,status} snapshotted; --revert restores + clears markers.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *   set -a; source .env.local; set +a
 *   # DRY RUN (default) — gather + cluster + summary, NO writes. UFO first.
 *   npx tsx scripts/xsource-dedup.ts --category ufos_aliens
 *   # APPLY (time-boxed + resumable; loop until done):
 *   while npx tsx scripts/xsource-dedup.ts --category ufos_aliens --apply | grep -q "re-run"; do :; done
 *   # WIDEN later: --category all
 *   # REVERT:
 *   npx tsx scripts/xsource-dedup.ts --revert
 *
 * Conservative + reversible by design. Approved rows only. Default-to-keep.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(name); return i >= 0 ? process.argv[i + 1] : def
}
function has(name: string): boolean { return process.argv.indexOf(name) >= 0 }

const CATEGORY = flag('--category', 'ufos_aliens')
const COSINE_CLUSTER = parseFloat(flag('--cosine-cluster', '0.88'))
const MERGE_TEXT = parseFloat(flag('--merge-text', '0.60'))
const EDITORIAL_MERGE_COSINE = parseFloat(flag('--editorial-cosine', '0.93'))
const DAYS = parseInt(flag('--days', '3'), 10)
const KM = parseFloat(flag('--km', '50'))
const MATCH_COUNT = parseInt(flag('--match-count', '20'), 10)
const RUN_BUDGET_SEC = parseInt(flag('--budget', '600'), 10)

const SLUG = CATEGORY.replace(/[^a-z0-9]+/gi, '_')
const CACHE = path.resolve(process.cwd(), `outputs/xsource-cache-${SLUG}.json`)
const PROC = path.resolve(process.cwd(), `outputs/xsource-processed-${SLUG}.json`)
const CLUSTERS = path.resolve(process.cwd(), `outputs/xsource-clusters-${SLUG}.json`)
const SNAP = path.resolve(process.cwd(), `outputs/xsource-snapshot-${SLUG}.json`)

const START = Date.now()
const GATHER_DEADLINE = START + 25000
let RUN_DEADLINE = START + RUN_BUDGET_SEC * 1000

const EDITORIAL_SOURCES = new Set(['chronicling-america', 'news', 'wikipedia', 'spr', 'pd-text', 'duchas'])
const isEditorial = (s: string | null) => !!s && EDITORIAL_SOURCES.has(s)

// ── text-identity (separates same-account reprint from independent witness) ──
function shingles(text: string, k = 3): Set<string> {
  const w = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const s = new Set<string>()
  for (let i = 0; i + k <= w.length; i++) s.add(w.slice(i, i + k).join(' '))
  return s
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0; a.forEach(x => { if (b.has(x)) inter++ })
  return inter / (a.size + b.size - inter)
}
function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371, r = (d: number) => d * Math.PI / 180
  const dLa = r(la2 - la1), dLo = r(lo2 - lo1)
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(r(la1)) * Math.cos(r(la2)) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
function dateGapDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a), tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(ta - tb) / 86400000
}

interface Lite {
  id: string; title: string | null; event_date: string | null; source_type: string | null
  latitude: number | null; longitude: number | null
  has_narrative: boolean; desc_len: number; created_at: string | null
}

function makeSb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

async function gather(sb: SupabaseClient): Promise<Lite[]> {
  let cache: { complete: boolean; page: number; rows: Lite[] } = fs.existsSync(CACHE)
    ? JSON.parse(fs.readFileSync(CACHE, 'utf8')) : { complete: false, page: 0, rows: [] }
  if (cache.complete) return cache.rows
  const have = new Set(cache.rows.map(r => r.id))
  while (Date.now() < GATHER_DEADLINE) {
    const from = cache.page * 1000
    let q = sb.from('reports')
      .select('id,title,event_date,source_type,latitude,longitude,paradocs_narrative,description,created_at')
      .eq('status', 'approved').order('created_at', { ascending: true }).range(from, from + 999)
    if (CATEGORY !== 'all') q = q.eq('category', CATEGORY)
    const r = await q
    if (r.error) { console.error('[xsource] gather error:', r.error.message); break }
    const rows: any[] = r.data || []
    for (const row of rows) {
      if (have.has(row.id)) continue
      have.add(row.id)
      cache.rows.push({
        id: row.id, title: row.title, event_date: row.event_date, source_type: row.source_type,
        latitude: row.latitude == null ? null : Number(row.latitude),
        longitude: row.longitude == null ? null : Number(row.longitude),
        has_narrative: !!(row.paradocs_narrative && String(row.paradocs_narrative).trim()),
        desc_len: (row.description || '').length, created_at: row.created_at,
      })
    }
    cache.page++
    if (rows.length < 1000) { cache.complete = true; break }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  if (!cache.complete) { console.log(`[xsource] gather: ${cache.rows.length} so far (incomplete) — re-run to continue.`); process.exit(0) }
  return cache.rows
}

async function fetchEmbeddings(sb: SupabaseClient, ids: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (let i = 0; i < ids.length; i += 60) {
    const batch = ids.slice(i, i + 60)
    let data: any = null
    for (let a = 0; a < 4; a++) {
      const res = await sb.from('vector_chunks').select('source_id, chunk_index, embedding')
        .eq('source_table', 'report').in('source_id', batch).order('chunk_index', { ascending: true })
      if (!res.error) { data = res.data; break }
      await new Promise(r => setTimeout(r, 400 * (a + 1)))
    }
    for (const row of (data || []) as any[]) {
      if (map.has(row.source_id)) continue
      let v = row.embedding
      if (typeof v === 'string') { try { v = JSON.parse(v) } catch { continue } }
      if (Array.isArray(v) && v.length) map.set(row.source_id, v)
    }
  }
  return map
}

// Lazy description fetch (textId needs the text; cache to avoid refetch).
const descCache = new Map<string, string>()
async function getDescriptions(sb: SupabaseClient, ids: string[]): Promise<void> {
  const need = ids.filter(id => !descCache.has(id))
  for (let i = 0; i < need.length; i += 100) {
    const batch = need.slice(i, i + 100)
    const { data } = await sb.from('reports').select('id, description').in('id', batch)
    for (const r of (data || []) as any[]) descCache.set(r.id, r.description || '')
    for (const id of batch) if (!descCache.has(id)) descCache.set(id, '')
  }
}

function createdKey(d: string | null) { return d || '9999-99-99T99:99:99Z' }
function chooseCanonical(rows: Lite[]): Lite {
  return [...rows].sort((a, b) => {
    if (a.has_narrative !== b.has_narrative) return a.has_narrative ? -1 : 1
    if (a.desc_len !== b.desc_len) return b.desc_len - a.desc_len
    return createdKey(a.created_at).localeCompare(createdKey(b.created_at))
  })[0]
}

interface MergeCluster {
  canonicalId: string
  canonicalSource: string | null
  members: { id: string; title: string | null; source_type: string | null; sim: number; method: string }[]
  alsoReportedIn: string[]
}

async function main() {
  const apply = has('--apply'), revert = has('--revert')
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[xsource] Missing Supabase env. Source .env.local first.'); process.exit(1)
  }
  const sb = makeSb()

  // ── REVERT ──────────────────────────────────────────────────────────
  if (revert) {
    const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
    console.log(`[xsource] REVERT ${snap.rows.length} archived rows + clearing markers`)
    for (const r of snap.rows) {
      const cur = await sb.from('reports').select('metadata').eq('id', r.id).single()
      let meta = (cur.data && (cur.data as any).metadata) || {}
      if (meta && typeof meta === 'object') { meta = { ...meta }; delete meta.duplicate_of; delete meta.dup_method; delete meta.dup_sim }
      await sb.from('reports').update({ status: r.status, metadata: meta }).eq('id', r.id)
    }
    console.log('[xsource] reverted (note: also_reported_in left on canonicals — harmless provenance)')
    return
  }

  console.log(`=== Cross-source MERGE pass (${apply ? 'APPLY' : 'DRY RUN'}) — category=${CATEGORY} ===`)
  console.log(`MERGE if textId>=${MERGE_TEXT} OR editorial↔editorial & cosine>=${EDITORIAL_MERGE_COSINE} | gate date<=${DAYS}d geo<=${KM}km`)

  const rows = await gather(sb)
  const byId = new Map<string, Lite>(rows.map(r => [r.id, r]))
  const inScope = new Set<string>(rows.map(r => r.id))
  const embeddings = await fetchEmbeddings(sb, rows.map(r => r.id))
  const withEmb = rows.filter(r => embeddings.has(r.id)).length
  console.log(`scope: ${rows.length} approved (${CATEGORY}) | embedded: ${withEmb}`)

  const assigned = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  let clusters: MergeCluster[] = fs.existsSync(CLUSTERS) ? JSON.parse(fs.readFileSync(CLUSTERS, 'utf8')) : []
  const persist = () => {
    fs.mkdirSync(path.dirname(PROC), { recursive: true })
    fs.writeFileSync(PROC, JSON.stringify(Array.from(assigned)))
    fs.writeFileSync(CLUSTERS, JSON.stringify(clusters, null, 2))
  }

  RUN_DEADLINE = Date.now() + RUN_BUDGET_SEC * 1000
  const ordered = [...rows].sort((a, b) => createdKey(a.created_at).localeCompare(createdKey(b.created_at)) || a.id.localeCompare(b.id))
  let timedOut = false

  for (const R of ordered) {
    if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
    if (assigned.has(R.id)) continue
    const vec = embeddings.get(R.id)
    if (!vec) continue

    let neighbors: any[] = []
    try {
      const sv = await sb.rpc('search_vectors', {
        query_embedding: '[' + vec.join(',') + ']', match_count: MATCH_COUNT,
        similarity_threshold: COSINE_CLUSTER, filter_source_table: 'report', filter_metadata: null,
      })
      neighbors = Array.isArray(sv.data) ? sv.data : []
    } catch { continue }

    // Cheap gates first (cosine/date/geo/scope/assigned), then fetch text.
    const cand: { row: Lite; cosine: number }[] = []
    for (const n of neighbors) {
      const nid = n.source_id
      if (!nid || nid === R.id || !inScope.has(nid) || assigned.has(nid)) continue
      const cosine = typeof n.similarity === 'number' ? n.similarity : parseFloat(n.similarity)
      if (!(cosine >= COSINE_CLUSTER)) continue
      const N = byId.get(nid); if (!N) continue
      const gap = dateGapDays(R.event_date, N.event_date)
      if (gap === null || gap > DAYS) continue                       // require real date agreement
      if (R.latitude != null && R.longitude != null && N.latitude != null && N.longitude != null) {
        if (haversineKm(R.latitude, R.longitude, N.latitude, N.longitude) > KM) continue
      }
      cand.push({ row: N, cosine })
    }
    if (!cand.length) continue

    await getDescriptions(sb, [R.id, ...cand.map(c => c.row.id)])
    const aSh = shingles(descCache.get(R.id) || '')

    // Classify each candidate; collect only MERGE members (same account).
    const mergeMembers: { row: Lite; sim: number; method: string }[] = []
    for (const c of cand) {
      const textId = jaccard(aSh, shingles(descCache.get(c.row.id) || ''))
      const nearVerbatim = textId >= MERGE_TEXT
      const editorialReprint = isEditorial(R.source_type) && isEditorial(c.row.source_type) && c.cosine >= EDITORIAL_MERGE_COSINE
      if (nearVerbatim || editorialReprint) {
        mergeMembers.push({ row: c.row, sim: c.cosine, method: nearVerbatim ? 'near-verbatim' : 'editorial-reprint' })
      }
      // else: corroboration — left for the clustering pass, not archived here.
    }
    if (!mergeMembers.length) continue

    const clusterRows = [R, ...mergeMembers.map(m => m.row)]
    const kept = chooseCanonical(clusterRows)
    for (const cr of clusterRows) assigned.add(cr.id)
    const methodById = new Map<string, { sim: number; method: string }>()
    for (const m of mergeMembers) methodById.set(m.row.id, { sim: m.sim, method: m.method })

    const members = clusterRows.filter(cr => cr.id !== kept.id).map(cr => ({
      id: cr.id, title: cr.title, source_type: cr.source_type,
      sim: methodById.get(cr.id)?.sim ?? 1, method: methodById.get(cr.id)?.method ?? 'near-verbatim',
    }))
    const alsoReportedIn = Array.from(new Set(clusterRows.map(cr => cr.source_type).filter(Boolean) as string[]))
    clusters.push({ canonicalId: kept.id, canonicalSource: kept.source_type, members, alsoReportedIn })
  }
  persist()

  const real = clusters.filter(c => c.members.length >= 1)
  const redundant = real.reduce((a, c) => a + c.members.length, 0)
  const crossSrc = real.filter(c => c.alsoReportedIn.length >= 2).length
  console.log(`\nmerge clusters: ${real.length} | rows to archive (sum members): ${redundant} | cross-source clusters: ${crossSrc}`)
  console.log('\nsample merge clusters:')
  for (const c of real.slice(0, 10)) {
    const k = byId.get(c.canonicalId)
    console.log(`  KEEP [${c.canonicalSource}] ${(k?.title || '(untitled)').slice(0, 64)}  also_in=[${c.alsoReportedIn.join(',')}]`)
    for (const m of c.members) console.log(`     archive [${m.source_type}] ${m.method} sim=${m.sim.toFixed(3)}: ${(m.title || '(untitled)').slice(0, 56)}`)
  }

  if (!apply) {
    console.log(`\nwrote ${CLUSTERS}`)
    if (timedOut) console.log('[xsource] time-boxed — re-run to continue.')
    console.log('DRY RUN — no DB writes. --apply to archive (reversible: --revert).')
    return
  }

  // ── APPLY ───────────────────────────────────────────────────────────
  const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP) ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
  const done = new Set(snap.rows.map(r => r.id))
  let archived = 0, sinceFlush = 0
  const flush = () => fs.writeFileSync(SNAP, JSON.stringify(snap))
  RUN_DEADLINE = Date.now() + RUN_BUDGET_SEC * 1000
  for (const c of real) {
    if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
    // Stamp provenance on the canonical (merge into existing metadata).
    try {
      const cur = await sb.from('reports').select('metadata').eq('id', c.canonicalId).single()
      const meta = { ...((cur.data as any)?.metadata || {}) }
      const prior: string[] = Array.isArray(meta.also_reported_in) ? meta.also_reported_in : []
      meta.also_reported_in = Array.from(new Set([...prior, ...c.alsoReportedIn]))
      await sb.from('reports').update({ metadata: meta }).eq('id', c.canonicalId)
    } catch { /* non-fatal */ }
    for (const m of c.members) {
      if (done.has(m.id)) continue
      if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
      const cur = await sb.from('reports').select('status, metadata').eq('id', m.id).single()
      const status = (cur.data as any)?.status || 'approved'
      const meta = { ...((cur.data as any)?.metadata || {}), duplicate_of: c.canonicalId, dup_method: m.method, dup_sim: m.sim }
      snap.rows.push({ id: m.id, status }); done.add(m.id)
      const r = await sb.from('reports').update({ status: 'archived', metadata: meta }).eq('id', m.id)
      if (!r.error) archived++; else console.warn('[xsource] archive error ' + m.id + ': ' + r.error.message)
      if (++sinceFlush >= 25) { flush(); sinceFlush = 0 }
    }
  }
  flush()
  console.log(`\nthis run → archived ${archived} | merge clusters ${real.length}`)
  console.log(`snapshot: ${SNAP} (revert with --revert)`)
  if (timedOut) console.log('[xsource] time-boxed — re-run to continue.')
}

main().catch(e => { console.error('[xsource] unhandled:', e); process.exit(1) })
