#!/usr/bin/env tsx
/**
 * ca-dedup.ts — V11.20.10
 *
 * Backfill dedup pass for Chronicling-America (CA) reports.
 *
 * Syndicated 1900s–1910s newspaper stories were reprinted across many papers;
 * the CA harvester ingested each printing as a separate report, so the archive
 * has heavy duplication (a sample of 6,000 approved CA rows had 133 duplicate
 * clusters / 221 redundant copies; one story appeared 28×). The existing
 * seen-ledger dedup (scripts/ca-extract-ingest.ts) only catches EXACT OCR
 * snippet sha256 — it misses reprints (different paper, different OCR). This
 * pass clusters by a normalized CONTENT FINGERPRINT of the modern description,
 * keeps ONE canonical per cluster, and archives the rest.
 *
 * The contentFp() below is the EXACT validated logic that correctly clustered
 * the 6k sample. Rows whose fingerprint is shorter than 30 chars are treated as
 * "no fingerprint" and are NEVER clustered or archived.
 *
 * ── Usage (founder, in terminal) ────────────────────────────────────
 *   set -a; source .env.local; set +a
 *
 *   # DRY RUN (default) — gather (cached), cluster, write clusters JSON, summary.
 *   npx tsx scripts/ca-dedup.ts
 *
 *   # APPLY — archive non-canonical rows, stamp canonicals with content_fp.
 *   #   Reversible via --revert. Time-boxed + resumable (re-run until done).
 *   npx tsx scripts/ca-dedup.ts --apply
 *
 *   # REVERT — restore prior statuses from the apply snapshot.
 *   npx tsx scripts/ca-dedup.ts --revert
 *
 *   # SEED LEDGER — write every existing metadata.content_fp into the
 *   #   ingest guard's ledger so the guard starts populated. Read-only on DB.
 *   npx tsx scripts/ca-dedup.ts --seed-ledger
 *
 * ── Conservative by design ──────────────────────────────────────────
 *   Only rows inside clusters of >=2 members are touched. Singletons and
 *   short/empty-fingerprint rows are never archived.
 */
import * as fs from 'fs'
import * as path from 'path'

// ── Content fingerprint (VALIDATED — keep identical to ca-extract-ingest.ts) ──
// Lowercase, strip non-alphanumerics to spaces, collapse whitespace; drop a
// leading reporting verb/phrase so "X published an account of <story>" and
// "<story>" land on the same family; take the first 90 chars. Fingerprints
// shorter than 30 chars are treated as no-fingerprint (never clustered).
function contentFp(desc: string | null | undefined): string {
  let d = (desc || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const m = d.match(/\b(published|reported|recount|account of|describes|tells)\b/)
  if (m) d = d.slice((m.index || 0) + m[0].length)
  d = d.replace(/\s+/g, ' ').trim()
  return d.slice(0, 90)
}
const FP_MIN_LEN = 30

// V11.21.6 — source-configurable so this dedups Reddit crossposts (same
// author posting identical text to multiple subreddits) as well as CA
// syndication. DEDUP_SOURCE=reddit (default chronicling-america). Cache/
// snapshot/clusters files are namespaced per source so runs don't collide.
const DEDUP_SOURCE = process.env.DEDUP_SOURCE || 'chronicling-america'
const TAG = DEDUP_SOURCE === 'chronicling-america' ? 'ca' : DEDUP_SOURCE.replace(/[^a-z0-9]/gi, '')
const CACHE = path.resolve(process.cwd(), 'outputs/' + TAG + '-dedup-cache.json')
const CLUSTERS = path.resolve(process.cwd(), 'outputs/' + TAG + '-dedup-clusters.json')
const SNAP = path.resolve(process.cwd(), 'outputs/' + TAG + '-dedup-snapshot.json')
const PROC = path.resolve(process.cwd(), 'outputs/' + TAG + '-dedup-processed.json')
const FP_LEDGER = process.env.CA_CONTENT_FP_LEDGER
  ? path.resolve(process.cwd(), process.env.CA_CONTENT_FP_LEDGER)
  : path.resolve(process.cwd(), 'outputs/' + TAG + '-content-fp-ledger.txt')

const START = Date.now()
const GATHER_DEADLINE = START + 25000
const APPLY_DEADLINE = START + 34000

interface CaRow {
  id: string
  title: string | null
  description: string | null
  event_date: string | null
  location_name: string | null
  paradocs_narrative: string | null
  source_label: string | null
  status: string | null
  created_at: string | null
  metadata: any
}

function makeSb() {
  return import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!),
  )
}

// ── Gather all CA reports (approved + pending_review), cached + resumable ──
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
      .select('id,title,description,event_date,location_name,paradocs_narrative,source_label,status,created_at,metadata')
      .eq('source_type', DEDUP_SOURCE)
      .in('status', ['approved', 'pending_review'])
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (r.error) { console.error('[ca-dedup] gather error:', r.error.message); break }
    const rows: CaRow[] = r.data || []
    for (const row of rows) if (!have.has(row.id)) { have.add(row.id); cache.rows.push(row) }
    cache.page++
    if (rows.length < 1000) { cache.complete = true; break }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  if (!cache.complete) {
    console.log('[ca-dedup] gather: ' + cache.rows.length + ' so far (incomplete) — re-run to continue.')
    process.exit(0)
  }
  return cache.rows
}

interface Cluster { fp: string; rows: CaRow[] }

// V11.20.12 — the 90-char content fingerprint over-clusters when distinct
// stories share a boilerplate lede (e.g. items in a "famous ghost stories"
// roundup that open identically). Verify each fp-group with a token-Jaccard
// against the fullest-description member; members below SIM_THRESHOLD are NOT
// genuine reprints and get dropped from the cluster (kept as singletons).
const SIM_THRESHOLD = 0.4
function descTokens(s: string | null | undefined): Set<string> {
  return new Set((s || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3))
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let inter = 0; a.forEach(w => { if (b.has(w)) inter++ })
  return inter / (a.size + b.size - inter)
}

function buildClusters(rows: CaRow[]): Cluster[] {
  const byFp = new Map<string, CaRow[]>()
  for (const row of rows) {
    const fp = contentFp(row.description)
    if (fp.length < FP_MIN_LEN) continue // no-fingerprint: never clustered
    if (!byFp.has(fp)) byFp.set(fp, [])
    byFp.get(fp)!.push(row)
  }
  const clusters: Cluster[] = []
  for (const [fp, members] of Array.from(byFp.entries())) {
    if (members.length < 2) continue
    // Reference = fullest description in the group.
    const ref = members.reduce((m, r) => (r.description || '').length > (m.description || '').length ? r : m, members[0])
    const rt = descTokens(ref.description)
    const verified = members.filter(r => r.id === ref.id || jaccard(descTokens(r.description), rt) >= SIM_THRESHOLD)
    if (verified.length >= 2) clusters.push({ fp, rows: verified })
  }
  // Largest clusters first (stable, useful for summaries + resumable apply order).
  clusters.sort((a, b) => b.rows.length - a.rows.length)
  return clusters
}

function hasNarrative(r: CaRow): boolean {
  return !!(r.paradocs_narrative && r.paradocs_narrative.trim().length > 0)
}
function hasLocation(r: CaRow): boolean {
  return !!(r.location_name && r.location_name.trim().length > 0)
}
function dateKey(d: string | null): string { return d || '9999-99-99' }
function createdKey(d: string | null): string { return d || '9999-99-99T99:99:99Z' }

/** Canonical selection: prefer narrative + location, then earliest event_date,
 *  then earliest created_at. If none have a narrative, keep earliest event_date. */
function chooseCanonical(rows: CaRow[]): CaRow {
  const withNarr = rows.filter(hasNarrative)
  if (withNarr.length > 0) {
    const withBoth = withNarr.filter(hasLocation)
    const pool = withBoth.length > 0 ? withBoth : withNarr
    return [...pool].sort((a, b) =>
      dateKey(a.event_date).localeCompare(dateKey(b.event_date)) ||
      createdKey(a.created_at).localeCompare(createdKey(b.created_at)),
    )[0]
  }
  return [...rows].sort((a, b) =>
    dateKey(a.event_date).localeCompare(dateKey(b.event_date)) ||
    createdKey(a.created_at).localeCompare(createdKey(b.created_at)),
  )[0]
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const seedLedger = process.argv.includes('--seed-ledger')

  const d = await import('dotenv')
  d.config({ path: path.resolve(process.cwd(), '.env.local') })
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('[ca-dedup] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.')
    process.exit(1)
  }
  const sb = await makeSb()

  // ── REVERT ──────────────────────────────────────────────────────────
  if (revert) {
    const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP)
      ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
    console.log('[ca-dedup] REVERT ' + snap.rows.length + ' reports to prior status')
    for (const r of snap.rows) await sb.from('reports').update({ status: r.status }).eq('id', r.id)
    console.log('[ca-dedup] reverted')
    return
  }

  // ── SEED LEDGER ─────────────────────────────────────────────────────
  // Write every existing metadata.content_fp into the ingest guard ledger so
  // the guard starts populated. Read-only on the DB. (After --apply stamps
  // canonicals, re-run this to refresh the ledger.)
  if (seedLedger) {
    const fps = new Set<string>()
    let from = 0
    while (true) {
      const { data, error } = await sb
        .from('reports')
        .select('metadata')
        .eq('source_type', DEDUP_SOURCE)
        .range(from, from + 999)
      if (error) { console.error('[ca-dedup] seed fetch error:', error.message); break }
      for (const r of (data || []) as any[]) {
        const fp = r.metadata && r.metadata.content_fp
        if (typeof fp === 'string' && fp.length >= FP_MIN_LEN) fps.add(fp)
      }
      if (!data || data.length < 1000) break
      from += 1000
    }
    fs.mkdirSync(path.dirname(FP_LEDGER), { recursive: true })
    // Merge with any existing ledger so seeding is idempotent.
    const existing = new Set<string>()
    if (fs.existsSync(FP_LEDGER)) for (const l of fs.readFileSync(FP_LEDGER, 'utf8').split('\n')) { const s = l.trim(); if (s) existing.add(s) }
    let added = 0
    for (const fp of Array.from(fps)) if (!existing.has(fp)) { existing.add(fp); added++ }
    fs.writeFileSync(FP_LEDGER, Array.from(existing).join('\n') + (existing.size ? '\n' : ''))
    console.log('[ca-dedup] --seed-ledger: ' + fps.size + ' content_fp found in DB; ledger now ' + existing.size + ' fps (+' + added + ')')
    console.log('[ca-dedup] ledger: ' + FP_LEDGER)
    return
  }

  // ── Gather + cluster ────────────────────────────────────────────────
  const rows = await gather(sb)
  const clusters = buildClusters(rows)
  const redundant = clusters.reduce((a, c) => a + (c.rows.length - 1), 0)

  // Canonical selection stats
  let narrCanon = 0, noNarrCanon = 0
  const clusterOut = clusters.map(c => {
    const kept = chooseCanonical(c.rows)
    if (hasNarrative(kept)) narrCanon++; else noNarrCanon++
    const archived = c.rows.filter(r => r.id !== kept.id)
    return {
      fp: c.fp,
      size: c.rows.length,
      kept: { id: kept.id, title: kept.title, event_date: kept.event_date, source_label: kept.source_label },
      archived: archived.map(r => ({ id: r.id, title: r.title, event_date: r.event_date, source_label: r.source_label })),
    }
  })

  console.log('=== CA dedup (' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('CA rows scanned (approved+pending): ' + rows.length)
  console.log('duplicate clusters (>=2): ' + clusters.length)
  console.log('rows that would be archived (redundant copies): ' + redundant)
  console.log('canonical has narrative: ' + narrCanon + ' | canonical lacks narrative: ' + noNarrCanon)
  console.log('\ntop 10 clusters by size:')
  for (const c of clusterOut.slice(0, 10)) {
    console.log('  [' + c.size + '×] KEEP: ' + (c.kept.title || '(untitled)').slice(0, 70))
    for (const a of c.archived.slice(0, 3)) console.log('        archive: ' + (a.title || '(untitled)').slice(0, 64))
    if (c.archived.length > 3) console.log('        … +' + (c.archived.length - 3) + ' more archived')
  }

  // ── DRY RUN ─────────────────────────────────────────────────────────
  if (!apply) {
    fs.mkdirSync(path.dirname(CLUSTERS), { recursive: true })
    fs.writeFileSync(CLUSTERS, JSON.stringify(clusterOut, null, 2))
    console.log('\nwrote ' + CLUSTERS)
    console.log('DRY RUN — no DB writes. Run with --apply to archive (reversible: --revert).')
    return
  }

  // ── APPLY (time-boxed, resumable) ───────────────────────────────────
  const processed = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  const snap: { rows: { id: string; status: string }[] } = fs.existsSync(SNAP)
    ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
  const now = new Date().toISOString()
  let archivedN = 0, stampedN = 0, sinceFlush = 0
  const flush = () => {
    fs.writeFileSync(PROC, JSON.stringify(Array.from(processed)))
    fs.writeFileSync(SNAP, JSON.stringify(snap))
  }

  for (const c of clusters) {
    if (Date.now() >= APPLY_DEADLINE) { console.log('[ca-dedup] time-boxed — re-run --apply to continue.'); break }
    const kept = chooseCanonical(c.rows)

    // Stamp the canonical with content_fp so the ingest guard recognizes the family.
    if (!processed.has('canon:' + kept.id)) {
      const meta = { ...(kept.metadata || {}), content_fp: c.fp }
      const r = await sb.from('reports').update({ metadata: meta }).eq('id', kept.id)
      if (!r.error) { stampedN++; processed.add('canon:' + kept.id) }
      else console.warn('[ca-dedup] stamp error ' + kept.id + ': ' + r.error.message)
    }

    for (const row of c.rows) {
      if (row.id === kept.id) continue
      if (processed.has(row.id)) continue
      if (Date.now() >= APPLY_DEADLINE) break
      const meta = {
        ...(row.metadata || {}),
        qa_removed: 'syndicated_duplicate',
        dup_canonical: kept.id,
        qa_removed_at: now,
      }
      snap.rows.push({ id: row.id, status: row.status || 'approved' })
      const r = await sb.from('reports').update({ status: 'archived', metadata: meta }).eq('id', row.id)
      if (!r.error) { archivedN++; processed.add(row.id) }
      else console.warn('[ca-dedup] archive error ' + row.id + ': ' + r.error.message)
      if (++sinceFlush >= 25) { flush(); sinceFlush = 0 }
    }
  }
  flush()
  console.log('\nthis run → archived ' + archivedN + ' | canonicals stamped ' + stampedN)
  console.log('snapshot: ' + SNAP + ' (revert with --revert)')
  const remaining = redundant - processed.size // rough; processed includes canon: keys
  console.log('re-run --apply if time-boxed before all clusters processed.')
  void remaining
}

main().catch(e => { console.error('[ca-dedup] unhandled:', e); process.exit(1) })
