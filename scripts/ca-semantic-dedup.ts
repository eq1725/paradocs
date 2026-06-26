#!/usr/bin/env tsx
/**
 * ca-semantic-dedup.ts
 *
 * SEMANTIC dedup pass for Chronicling-America (CA) reports.
 *
 * The existing content-fingerprint dedup (scripts/ca-dedup.ts) clusters by a
 * normalized fingerprint of the modern description, so it only catches reprints
 * whose modern prose is near-identical. But the SAME syndicated 1900s newspaper
 * story was often EXTRACTED into DIFFERENT prose per copy (different paper,
 * different OCR, different summarizer wording) — same MEANING, different
 * fingerprint. These slip past ca-dedup and pollute the reveal (a single match
 * can surface ~9 near-identical reports of one event, e.g. the "Catterthun
 * shipwreck premonition" event with 9 live copies under different titles).
 *
 * Because the whole corpus is embedded (vector_chunks, pgvector), we detect
 * these by EMBEDDING similarity instead of text fingerprint: cluster CA reports
 * whose first-chunk embeddings are very close (high cosine via the search_vectors
 * RPC), constrained by an event-date proximity guard so we never merge two
 * genuinely-distinct-but-similar accounts from different periods (reprints of one
 * event share that event's date). Keep the single best copy per cluster, archive
 * the rest (status → archived). Fully reversible, dry-run by default.
 *
 * ── Usage (founder, in terminal) ────────────────────────────────────
 *   set -a; source .env.local; set +a
 *
 *   # DRY RUN (default) — gather (cached), embeddings, cluster, summary. NO writes.
 *   npx tsx scripts/ca-semantic-dedup.ts
 *
 *   # APPLY — archive non-canonical members; reversible via --revert.
 *   #   Time-boxed + resumable; re-run in a loop until it stops signalling.
 *   while npx tsx scripts/ca-semantic-dedup.ts --apply | grep -q "time-boxed — re-run"; do :; done
 *
 *   # REVERT — restore prior statuses + clear metadata.semantic_dup_* keys.
 *   npx tsx scripts/ca-semantic-dedup.ts --revert
 *
 * ── Conservative by design ──────────────────────────────────────────
 *   CA-approved rows ONLY (never touches other sources or non-approved rows).
 *   High cosine threshold (default 0.90, env SEMDEDUP_SIM). Date-guarded
 *   (default ±45d, env SEMDEDUP_DAYS; null dates pass). Only clusters of >=2
 *   are touched. Reversible, resumable, idempotent (assigned/processed sets).
 */
import * as fs from 'fs'
import * as path from 'path'

// ── Tunables (env-overridable) ──────────────────────────────────────
const SIM_THRESHOLD = parseFloat(process.env.SEMDEDUP_SIM || '0.90')
const DATE_WINDOW_DAYS = parseInt(process.env.SEMDEDUP_DAYS || '45', 10)
const RUN_BUDGET_SEC = parseInt(process.env.SEMDEDUP_RUN_BUDGET_SEC || '600', 10)
const MATCH_COUNT = parseInt(process.env.SEMDEDUP_MATCH_COUNT || '40', 10)
const SOURCE_TYPE = 'chronicling-america'

const CACHE = path.resolve(process.cwd(), 'outputs/ca-semdedup-cache.json')
const PROC = path.resolve(process.cwd(), 'outputs/ca-semdedup-processed.json')
const CLUSTERS = path.resolve(process.cwd(), 'outputs/ca-semdedup-clusters.json')
const SNAP = path.resolve(process.cwd(), 'outputs/ca-semdedup-snapshot.json')

const START = Date.now()
const GATHER_DEADLINE = START + 25000
const RUN_DEADLINE = START + RUN_BUDGET_SEC * 1000

interface CaRow {
  id: string
  title: string | null
  event_date: string | null
  status: string | null
  created_at: string | null
  has_narrative: boolean
  desc_len: number
  metadata: any
}

function makeSb() {
  return import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
  )
}

// ── Gather all CA approved reports, cached + resumable ──────────────
async function gather(sb: any): Promise<CaRow[]> {
  let cache: { complete: boolean; page: number; rows: CaRow[] } = fs.existsSync(CACHE)
    ? JSON.parse(fs.readFileSync(CACHE, 'utf8'))
    : { complete: false, page: 0, rows: [] }
  if (cache.complete) return cache.rows

  const have = new Set(cache.rows.map(r => r.id))
  while (Date.now() < GATHER_DEADLINE) {
    const from = cache.page * 1000
    const r = await sb
      .from('reports')
      .select('id,title,event_date,status,created_at,paradocs_narrative,description,metadata')
      .eq('source_type', SOURCE_TYPE)
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (r.error) { console.error('[ca-semdedup] gather error:', r.error.message); break }
    const rows: any[] = r.data || []
    for (const row of rows) {
      if (have.has(row.id)) continue
      have.add(row.id)
      // Store only what clustering/canonical-choice needs; keep cache small
      // by collapsing the (large) description to its length.
      cache.rows.push({
        id: row.id,
        title: row.title,
        event_date: row.event_date,
        status: row.status,
        created_at: row.created_at,
        has_narrative: !!(row.paradocs_narrative && String(row.paradocs_narrative).trim().length > 0),
        desc_len: (row.description || '').length,
        metadata: row.metadata,
      })
    }
    cache.page++
    if (rows.length < 1000) { cache.complete = true; break }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  if (!cache.complete) {
    console.log('[ca-semdedup] gather: ' + cache.rows.length + ' so far (incomplete) — re-run to continue.')
    process.exit(0)
  }
  return cache.rows
}

// ── Embeddings: first-chunk (chunk_index=0) per report, batched ─────
// Small batches (each embedding is 1536 floats ~ heavy); a 500-id batch
// returns a payload large enough to trip "fetch failed" on constrained
// networks. 60/batch keeps responses ~2MB. Retry transient fetch errors.
const EMB_BATCH = 60
async function fetchEmbeddings(sb: any, ids: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (let i = 0; i < ids.length; i += EMB_BATCH) {
    const batch = ids.slice(i, i + EMB_BATCH)
    let data: any = null
    let lastErr: any = null
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const res = await sb
          .from('vector_chunks')
          .select('source_id, chunk_index, embedding')
          .eq('source_table', 'report')
          .in('source_id', batch)
          .order('chunk_index', { ascending: true })
        if (res.error) { lastErr = res.error; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); continue }
        data = res.data; lastErr = null; break
      } catch (e: any) {
        lastErr = e; await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
      }
    }
    if (lastErr) { console.error('[ca-semdedup] embedding fetch error (batch skipped after retries):', lastErr.message || lastErr); continue }
    for (const row of (data || []) as any[]) {
      if (map.has(row.source_id)) continue // first chunk only (chunk_index=0 by sort)
      let vec = row.embedding
      // pgvector returns '[a,b,c,...]' string OR an array depending on client.
      if (typeof vec === 'string') {
        try { vec = JSON.parse(vec) } catch (_) { continue }
      }
      if (Array.isArray(vec) && vec.length > 0) map.set(row.source_id, vec)
    }
  }
  return map
}

// ── Date guard: both within window OR either null ───────────────────
function withinDateWindow(a: string | null, b: string | null): boolean {
  if (!a || !b) return true
  const ta = Date.parse(a), tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return true
  const diffDays = Math.abs(ta - tb) / 86400000
  return diffDays <= DATE_WINDOW_DAYS
}

// ── Canonical selection: prefer narrative, then longest desc, then earliest created ──
function createdKey(d: string | null): string { return d || '9999-99-99T99:99:99Z' }
function chooseCanonical(rows: CaRow[]): CaRow {
  return [...rows].sort((a, b) => {
    // narrative first
    if (a.has_narrative !== b.has_narrative) return a.has_narrative ? -1 : 1
    // longest description
    if (a.desc_len !== b.desc_len) return b.desc_len - a.desc_len
    // earliest created_at
    return createdKey(a.created_at).localeCompare(createdKey(b.created_at))
  })[0]
}

interface ClusterMember { id: string; title: string | null; event_date: string | null; sim: number }
interface ClusterOut {
  canonicalId: string
  kept: { id: string; title: string | null; event_date: string | null }
  archived: ClusterMember[]
  size: number
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')

  const d = await import('dotenv')
  d.config({ path: path.resolve(process.cwd(), '.env.local') })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ca-semdedup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.')
    process.exit(1)
  }
  const sb = await makeSb()

  // ── REVERT ──────────────────────────────────────────────────────────
  if (revert) {
    const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP)
      ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
    console.log('[ca-semdedup] REVERT ' + snap.rows.length + ' reports to prior status')
    for (const r of snap.rows) {
      // Restore status and clear the semantic_dup_* markers we stamped.
      const cur = await sb.from('reports').select('metadata').eq('id', r.id).single()
      let meta = (cur.data && (cur.data as any).metadata) || {}
      if (meta && typeof meta === 'object') {
        meta = { ...meta }
        delete meta.semantic_dup_of
        delete meta.semantic_dup_sim
      }
      await sb.from('reports').update({ status: r.status, metadata: meta }).eq('id', r.id)
    }
    console.log('[ca-semdedup] reverted')
    return
  }

  // ── Gather ──────────────────────────────────────────────────────────
  const rows = await gather(sb)
  const byId = new Map<string, CaRow>(rows.map(r => [r.id, r]))
  // CA-approved id set — clustering is restricted to these; we NEVER cluster
  // across source_type or pull in non-approved rows.
  const caApproved = new Set<string>(rows.map(r => r.id))

  // ── Embeddings ──────────────────────────────────────────────────────
  const embeddings = await fetchEmbeddings(sb, rows.map(r => r.id))
  const withEmb = rows.filter(r => embeddings.has(r.id)).length
  const withoutEmb = rows.length - withEmb

  // ── Cluster (time-boxed, resumable) ─────────────────────────────────
  // `assigned` = ids already placed in a cluster (canonical or archived);
  // persisted so a re-run skips them. Clusters accumulate in CLUSTERS json.
  const assigned = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  let clusters: ClusterOut[] = fs.existsSync(CLUSTERS) ? JSON.parse(fs.readFileSync(CLUSTERS, 'utf8')) : []

  const persist = () => {
    fs.mkdirSync(path.dirname(PROC), { recursive: true })
    fs.writeFileSync(PROC, JSON.stringify(Array.from(assigned)))
    fs.writeFileSync(CLUSTERS, JSON.stringify(clusters, null, 2))
  }

  let timedOut = false
  // Stable order: created_at ascending then id.
  const ordered = [...rows].sort((a, b) =>
    createdKey(a.created_at).localeCompare(createdKey(b.created_at)) || a.id.localeCompare(b.id))

  for (const R of ordered) {
    if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
    if (assigned.has(R.id)) continue
    const vec = embeddings.get(R.id)
    if (!vec) continue // no embedding — can't be compared

    let neighbors: any[]
    try {
      const sv = await sb.rpc('search_vectors', {
        query_embedding: '[' + vec.join(',') + ']',
        match_count: MATCH_COUNT,
        similarity_threshold: SIM_THRESHOLD,
        filter_source_table: 'report',
        filter_metadata: null,
      })
      if (sv.error) { console.warn('[ca-semdedup] rpc error ' + R.id + ': ' + sv.error.message); continue }
      neighbors = Array.isArray(sv.data) ? sv.data : []
    } catch (e: any) {
      console.warn('[ca-semdedup] rpc threw ' + R.id + ': ' + (e && e.message))
      continue // skip; retry next run (R stays unassigned)
    }

    // Keep qualifying neighbors: CA-approved, not R, not already assigned,
    // sim >= threshold, and date-guard pass against R.
    const members: { row: CaRow; sim: number }[] = []
    for (const n of neighbors) {
      const nid = n.source_id
      if (!nid || nid === R.id) continue
      if (!caApproved.has(nid)) continue
      if (assigned.has(nid)) continue
      const sim = typeof n.similarity === 'number' ? n.similarity : parseFloat(n.similarity)
      if (!(sim >= SIM_THRESHOLD)) continue
      const nrow = byId.get(nid)
      if (!nrow) continue
      if (!withinDateWindow(R.event_date, nrow.event_date)) continue
      members.push({ row: nrow, sim })
    }

    if (members.length < 1) continue // R has no qualifying neighbor — singleton

    // R + qualifying neighbors form a cluster.
    const clusterRows = [R, ...members.map(m => m.row)]
    const simById = new Map<string, number>()
    simById.set(R.id, 1)
    for (const m of members) simById.set(m.row.id, m.sim)

    const kept = chooseCanonical(clusterRows)
    for (const cr of clusterRows) assigned.add(cr.id)

    const archived: ClusterMember[] = clusterRows
      .filter(cr => cr.id !== kept.id)
      .map(cr => ({ id: cr.id, title: cr.title, event_date: cr.event_date, sim: simById.get(cr.id) ?? 0 }))

    clusters.push({
      canonicalId: kept.id,
      kept: { id: kept.id, title: kept.title, event_date: kept.event_date },
      archived,
      size: clusterRows.length,
    })
  }

  persist()

  const realClusters = clusters.filter(c => c.size >= 2)
  const redundant = realClusters.reduce((a, c) => a + (c.size - 1), 0)

  // Cluster-size distribution
  const dist = new Map<number, number>()
  for (const c of realClusters) dist.set(c.size, (dist.get(c.size) || 0) + 1)
  const distStr = Array.from(dist.entries()).sort((a, b) => a[0] - b[0])
    .map(([sz, n]) => sz + '×:' + n).join('  ')

  console.log('=== CA SEMANTIC dedup (' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('sim threshold: ' + SIM_THRESHOLD + ' | date window: ±' + DATE_WINDOW_DAYS + 'd | match_count: ' + MATCH_COUNT)
  console.log('CA approved scanned: ' + rows.length + ' | with embeddings: ' + withEmb + ' | without (skipped): ' + withoutEmb)
  console.log('clusters (size>=2): ' + realClusters.length + ' | redundant copies (sum(size-1)): ' + redundant)
  console.log('cluster-size distribution: ' + (distStr || '(none)'))

  console.log('\nsample clusters:')
  for (const c of realClusters.slice(0, 8)) {
    console.log('  [' + c.size + '×] KEEP: ' + (c.kept.title || '(untitled)').slice(0, 72) + '  {' + (c.kept.event_date || 'no-date') + '}')
    for (const a of c.archived) {
      console.log('        archive (sim ' + a.sim.toFixed(4) + '): ' + (a.title || '(untitled)').slice(0, 64) + '  {' + (a.event_date || 'no-date') + '}')
    }
  }

  // ── DRY RUN ─────────────────────────────────────────────────────────
  if (!apply) {
    console.log('\nwrote ' + CLUSTERS)
    if (timedOut) console.log('[ca-semdedup] time-boxed — re-run to continue.')
    console.log('DRY RUN — no DB writes. Run with --apply to archive (reversible: --revert).')
    return
  }

  // ── APPLY ───────────────────────────────────────────────────────────
  // Archive non-canonical members; stamp metadata.semantic_dup_of / _sim.
  // Snapshot prior {id,status} for --revert. Idempotent via the snapshot set.
  const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP)
    ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
  const alreadyArchived = new Set(snap.rows.map(r => r.id))
  let archivedN = 0, sinceFlush = 0
  const flush = () => { fs.writeFileSync(SNAP, JSON.stringify(snap)) }

  for (const c of realClusters) {
    if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
    for (const a of c.archived) {
      if (alreadyArchived.has(a.id)) continue
      if (Date.now() >= RUN_DEADLINE) { timedOut = true; break }
      const row = byId.get(a.id)
      const meta = {
        ...((row && row.metadata) || {}),
        semantic_dup_of: c.canonicalId,
        semantic_dup_sim: a.sim,
      }
      snap.rows.push({ id: a.id, status: (row && row.status) || 'approved' })
      alreadyArchived.add(a.id)
      const r = await sb.from('reports').update({ status: 'archived', metadata: meta }).eq('id', a.id)
      if (!r.error) { archivedN++ }
      else console.warn('[ca-semdedup] archive error ' + a.id + ': ' + r.error.message)
      if (++sinceFlush >= 25) { flush(); sinceFlush = 0 }
    }
  }
  flush()
  console.log('\nthis run → archived ' + archivedN + ' | clusters ' + realClusters.length)
  console.log('snapshot: ' + SNAP + ' (revert with --revert)')
  if (timedOut) console.log('[ca-semdedup] time-boxed — re-run to continue.')
}

main().catch(e => { console.error('[ca-semdedup] unhandled:', e); process.exit(1) })
