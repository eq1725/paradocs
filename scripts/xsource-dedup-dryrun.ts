#!/usr/bin/env tsx
/**
 * xsource-dedup-dryrun.ts — V11.35 (Phase 1 of DEDUP_HARDENING_PANEL_REVIEW)
 *
 * Source-AGNOSTIC cross-source dedup DRY RUN. Produces example proposed
 * MERGES and CLUSTERS for founder review — NO DB writes. This is the
 * precision-validation step locked in the panel (founder call #1: trust the
 * threshold, but review examples first).
 *
 * THE CORE DISTINCTION (the panel's air-tight rule):
 *   - MERGE   = the SAME account re-published (NUFORC case also in a newspaper
 *               / CUFOS catalogue / Reddit cross-post). Requires high embedding
 *               cosine AND high TEXTUAL near-identity AND date+geo agreement.
 *               → would collapse to a canonical (later phase).
 *   - CLUSTER = the SAME event, INDEPENDENT witnesses (Phoenix Lights, a flap).
 *               High semantic cosine + date/geo agreement but textually DISTINCT.
 *               → keep both, link as an event cluster. NEVER merged.
 *   - else    = independent. No action.
 *
 * Semantic similarity alone is a CLUSTER signal, never a MERGE signal. Textual
 * near-identity (word-shingle Jaccard on the descriptions) is what separates a
 * re-publication from an independent witness. Default-to-keep on any doubt.
 *
 * ── Usage ───────────────────────────────────────────────────────────
 *   set -a; source .env.local; set +a
 *   # UFO first (densest cross-source overlap), scan a capped sample:
 *   npx tsx scripts/xsource-dedup-dryrun.ts --category ufos_aliens --limit 2000
 *   # widen later: --category all
 *
 * Tunables (flags): --cosine-merge 0.93 --cosine-cluster 0.88
 *                   --merge-text 0.50 --days 3 --km 50 --examples 25
 *
 * Output: outputs/xsource-dedup-examples.json (full lists) + a console summary
 * with sample MERGE and CLUSTER pairs (titles, sources, cosine, text-identity,
 * date gap, km, description snippets) so the merge decisions can be eyeballed.
 */
import * as fs from 'fs'
import * as path from 'path'
import * as dotenv from 'dotenv'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

function flag(name: string, def: string): string {
  const i = process.argv.indexOf(name)
  return i >= 0 ? process.argv[i + 1] : def
}
const CATEGORY = flag('--category', 'ufos_aliens')        // 'all' to ignore category
const SCAN_LIMIT = parseInt(flag('--limit', '2000'), 10)   // reports scanned (dry-run sample)
const COSINE_CLUSTER = parseFloat(flag('--cosine-cluster', '0.88'))   // floor to consider a pair at all
const MERGE_TEXT = parseFloat(flag('--merge-text', '0.60'))           // word-shingle Jaccard floor → "same account" (any source)
const EDITORIAL_MERGE_COSINE = parseFloat(flag('--editorial-cosine', '0.93')) // reworded-reprint merge (editorial↔editorial only)
const DAYS = parseInt(flag('--days', '3'), 10)
const KM = parseFloat(flag('--km', '50'))
const EXAMPLES = parseInt(flag('--examples', '25'), 10)
const MATCH_COUNT = parseInt(flag('--match-count', '15'), 10)
const SOURCE_TYPE = flag('--source-type', '')             // restrict scan to one source (regression)
const EVENT_FROM = flag('--event-from', '')               // event_date >= (regression window)
const EVENT_TO = flag('--event-to', '')                   // event_date <  (regression window)
const OUT = path.resolve(process.cwd(), 'outputs/xsource-dedup-examples.json')

// Source NATURE — the heart of the merge-vs-cluster rule.
//   EDITORIAL = secondary/published accounts (a newspaper reprint of one wire
//   story is the SAME account even when reworded) → may merge on cosine.
//   WITNESS   = primary first-person submissions (two people describing the
//   same event are INDEPENDENT) → merge ONLY on near-verbatim text; otherwise
//   cluster. This is the Phoenix-Lights corroboration guard.
const EDITORIAL_SOURCES = new Set(['chronicling-america', 'news', 'wikipedia', 'spr', 'pd-text', 'duchas'])
function isEditorial(s: string | null): boolean { return !!s && EDITORIAL_SOURCES.has(s) }

interface Row {
  id: string; title: string | null; description: string | null
  event_date: string | null; source_type: string | null
  latitude: number | null; longitude: number | null
  city: string | null; state_province: string | null; category: string | null
}

function makeSb(): SupabaseClient {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// ── word-shingle Jaccard: separates "same words" (reprint) from "same
//    meaning, different words" (independent witness). k=3 consecutive words.
function shingles(text: string, k = 3): Set<string> {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const s = new Set<string>()
  for (let i = 0; i + k <= words.length; i++) s.add(words.slice(i, i + k).join(' '))
  return s
}
function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let inter = 0
  a.forEach(x => { if (b.has(x)) inter++ })
  return inter / (a.size + b.size - inter)
}

function haversineKm(la1: number, lo1: number, la2: number, lo2: number): number {
  const R = 6371, toRad = (d: number) => d * Math.PI / 180
  const dLa = toRad(la2 - la1), dLo = toRad(lo2 - lo1)
  const x = Math.sin(dLa / 2) ** 2 + Math.cos(toRad(la1)) * Math.cos(toRad(la2)) * Math.sin(dLo / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(x))
}
function dateGapDays(a: string | null, b: string | null): number | null {
  if (!a || !b) return null
  const ta = Date.parse(a), tb = Date.parse(b)
  if (Number.isNaN(ta) || Number.isNaN(tb)) return null
  return Math.abs(ta - tb) / 86400000
}

const SEL = 'id,title,description,event_date,source_type,latitude,longitude,city,state_province,category'

async function fetchRows(sb: SupabaseClient, ids: string[]): Promise<Map<string, Row>> {
  const m = new Map<string, Row>()
  for (let i = 0; i < ids.length; i += 200) {
    const chunk = ids.slice(i, i + 200)
    const { data } = await sb.from('reports').select(SEL).in('id', chunk)
    for (const r of (data || []) as any[]) m.set(r.id, r)
  }
  return m
}

async function fetchEmbeddings(sb: SupabaseClient, ids: string[]): Promise<Map<string, number[]>> {
  const map = new Map<string, number[]>()
  for (let i = 0; i < ids.length; i += 60) {
    const batch = ids.slice(i, i + 60)
    const { data, error } = await sb.from('vector_chunks')
      .select('source_id, chunk_index, embedding')
      .eq('source_table', 'report').in('source_id', batch)
      .order('chunk_index', { ascending: true })
    if (error) continue
    for (const row of (data || []) as any[]) {
      if (map.has(row.source_id)) continue
      let vec = row.embedding
      if (typeof vec === 'string') { try { vec = JSON.parse(vec) } catch { continue } }
      if (Array.isArray(vec) && vec.length) map.set(row.source_id, vec)
    }
  }
  return map
}

interface Pair {
  cls: 'MERGE' | 'CLUSTER'
  mergeReason: 'near-verbatim' | 'editorial-reprint' | null
  cosine: number; textId: number; dateGap: number | null; km: number | null
  crossSource: boolean
  a: { id: string; title: string | null; source: string | null; date: string | null; snippet: string }
  b: { id: string; title: string | null; source: string | null; date: string | null; snippet: string }
}

function snippet(s: string | null): string { return (s || '').replace(/\s+/g, ' ').trim().slice(0, 160) }

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing Supabase env. Source .env.local first.'); process.exit(1)
  }
  const sb = makeSb()
  console.log('=== Cross-source dedup DRY RUN (V11.35.1) ===')
  console.log(`category=${CATEGORY}${SOURCE_TYPE ? ' source=' + SOURCE_TYPE : ''}${EVENT_FROM ? ' event=[' + EVENT_FROM + ',' + EVENT_TO + ')' : ''} scan-limit=${SCAN_LIMIT}`)
  console.log(`MERGE if textId>=${MERGE_TEXT} (any src) OR editorial↔editorial & cosine>=${EDITORIAL_MERGE_COSINE} | CLUSTER floor cosine>=${COSINE_CLUSTER} | gate date<=${DAYS}d geo<=${KM}km`)

  // 1. Scan sample: approved reports (optionally one category / source / date window).
  let q = sb.from('reports').select(SEL).eq('status', 'approved').order('created_at', { ascending: false }).limit(SCAN_LIMIT)
  if (CATEGORY !== 'all') q = q.eq('category', CATEGORY)
  if (SOURCE_TYPE) q = q.eq('source_type', SOURCE_TYPE)
  if (EVENT_FROM) q = q.gte('event_date', EVENT_FROM)
  if (EVENT_TO) q = q.lt('event_date', EVENT_TO)
  const { data: scanData, error } = await q
  if (error) { console.error('scan error:', error.message); process.exit(1) }
  const scan = (scanData || []) as Row[]
  console.log(`scanned ${scan.length} reports`)

  const embScan = await fetchEmbeddings(sb, scan.map(r => r.id))
  const byId = new Map<string, Row>(scan.map(r => [r.id, r]))
  const seenPair = new Set<string>()
  const pairs: Pair[] = []
  let compared = 0

  for (const R of scan) {
    const vec = embScan.get(R.id)
    if (!vec) continue
    let neighbors: any[] = []
    try {
      const sv = await sb.rpc('search_vectors', {
        query_embedding: '[' + vec.join(',') + ']',
        match_count: MATCH_COUNT,
        similarity_threshold: COSINE_CLUSTER,
        filter_source_table: 'report',
        filter_metadata: null,
      })
      neighbors = Array.isArray(sv.data) ? sv.data : []
    } catch { continue }

    // Collect neighbor ids we don't already have rows for.
    const needRows = neighbors.map((n: any) => n.source_id).filter((id: string) => id && id !== R.id && !byId.has(id))
    if (needRows.length) {
      const fetched = await fetchRows(sb, Array.from(new Set(needRows)))
      fetched.forEach((row, id) => byId.set(id, row))
    }

    const aSh = shingles(R.description || '')
    for (const n of neighbors) {
      const nid = n.source_id
      if (!nid || nid === R.id) continue
      const key = R.id < nid ? R.id + '|' + nid : nid + '|' + R.id
      if (seenPair.has(key)) continue
      const N = byId.get(nid)
      if (!N) continue
      const cosine = typeof n.similarity === 'number' ? n.similarity : parseFloat(n.similarity)
      if (!(cosine >= COSINE_CLUSTER)) continue

      const gap = dateGapDays(R.event_date, N.event_date)
      const dateAgree = gap === null ? false : gap <= DAYS   // require real date agreement for any link
      let km: number | null = null
      if (R.latitude != null && R.longitude != null && N.latitude != null && N.longitude != null) {
        km = haversineKm(R.latitude, R.longitude, N.latitude, N.longitude)
      }
      const geoAgree = km === null ? true : km <= KM        // missing coords: don't block (text/date carry it)
      if (!dateAgree || !geoAgree) continue

      compared++
      seenPair.add(key)
      const textId = jaccard(aSh, shingles(N.description || ''))
      const crossSource = R.source_type !== N.source_type

      // Refined rule (V11.35.1):
      //   MERGE if near-verbatim text (same account — any source: resubmission,
      //     metadata-variant, literal cross-post / catalogue copy), OR both
      //     sources are EDITORIAL and cosine is high (reworded reprint of one
      //     wire story). Mixed editorial+witness never merges on cosine — only
      //     on near-verbatim text — so a press write-up + a witness submission
      //     of the same event CLUSTER (corroboration), not merge.
      //   CLUSTER otherwise: semantically + date/geo aligned but textually
      //     distinct, with a witness source involved → independent witnesses.
      const nearVerbatim = textId >= MERGE_TEXT
      const editorialReprint = isEditorial(R.source_type) && isEditorial(N.source_type) && cosine >= EDITORIAL_MERGE_COSINE
      const cls: 'MERGE' | 'CLUSTER' = (nearVerbatim || editorialReprint) ? 'MERGE' : 'CLUSTER'
      const mergeReason = cls === 'MERGE' ? (nearVerbatim ? 'near-verbatim' : 'editorial-reprint') : null

      pairs.push({
        cls, mergeReason, cosine: +cosine.toFixed(4), textId: +textId.toFixed(3), dateGap: gap === null ? null : +gap.toFixed(1),
        km: km === null ? null : +km.toFixed(1), crossSource,
        a: { id: R.id, title: R.title, source: R.source_type, date: R.event_date, snippet: snippet(R.description) },
        b: { id: N.id, title: N.title, source: N.source_type, date: N.event_date, snippet: snippet(N.description) },
      })
    }
  }

  const merges = pairs.filter(p => p.cls === 'MERGE')
  const clusters = pairs.filter(p => p.cls === 'CLUSTER')
  const mergeX = merges.filter(p => p.crossSource).length
  const clusterX = clusters.filter(p => p.crossSource).length

  console.log(`\ncandidate pairs evaluated (date+geo aligned): ${compared}`)
  console.log(`MERGE proposals:   ${merges.length}  (cross-source: ${mergeX})`)
  console.log(`CLUSTER proposals: ${clusters.length}  (cross-source: ${clusterX})`)

  const show = (label: string, list: Pair[]) => {
    console.log(`\n──────── sample ${label} (prioritizing cross-source) ────────`)
    const ordered = [...list].sort((a, b) => Number(b.crossSource) - Number(a.crossSource) || b.cosine - a.cosine)
    for (const p of ordered.slice(0, EXAMPLES)) {
      console.log(`\n[${p.cls}${p.mergeReason ? ':' + p.mergeReason : ''}] cosine=${p.cosine} textId=${p.textId} dateGap=${p.dateGap}d km=${p.km} ${p.crossSource ? 'CROSS-SOURCE' : 'same-source'}`)
      console.log(`  A (${p.a.source}) ${p.a.date || 'no-date'}: ${(p.a.title || '').slice(0, 70)}`)
      console.log(`     “${p.a.snippet}”`)
      console.log(`  B (${p.b.source}) ${p.b.date || 'no-date'}: ${(p.b.title || '').slice(0, 70)}`)
      console.log(`     “${p.b.snippet}”`)
    }
  }
  show('MERGE proposals', merges)
  show('CLUSTER proposals', clusters)

  fs.mkdirSync(path.dirname(OUT), { recursive: true })
  fs.writeFileSync(OUT, JSON.stringify({ params: { CATEGORY, SOURCE_TYPE, EVENT_FROM, EVENT_TO, SCAN_LIMIT, EDITORIAL_MERGE_COSINE, COSINE_CLUSTER, MERGE_TEXT, DAYS, KM }, merges, clusters }, null, 2))
  console.log(`\nwrote ${OUT}  (full lists for review)`)
  console.log('DRY RUN — no DB writes. Review the MERGE proposals: each should be the SAME account re-published, not two independent witnesses.')
}

main().catch(e => { console.error('unhandled:', e); process.exit(1) })
