#!/usr/bin/env tsx
/**
 * FAST report embedding backfill (V11.17.36)
 *
 * Replaces the per-report embedAllReports() pattern with:
 *   - Bulk fetch of 100 reports per Supabase query
 *   - Pre-filter already-embedded via single embedding_sync lookup
 *   - Single OpenAI call per 100 inputs (instead of 1 per report)
 *   - Bulk insert of 100 vector_chunks per query
 *   - Bulk upsert of 100 embedding_sync rows per query
 *   - Configurable concurrency (default 4 workers across offset ranges)
 *
 * Throughput estimate: ~80-150 reports/sec at 4 workers (OpenAI tier-1).
 * 135k reports → ~15-30 min. Cost ~$1.36 total (text-embedding-3-small
 * at $0.02/1M tokens × ~500 tokens/report × 135k = $1.36).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/backfill-report-embeddings-fast.ts                # full corpus, 4 workers
 *   tsx scripts/backfill-report-embeddings-fast.ts --limit 1000   # smoke
 *   tsx scripts/backfill-report-embeddings-fast.ts --workers 2    # less concurrent
 *   tsx scripts/backfill-report-embeddings-fast.ts --force        # re-embed all
 */
import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import * as crypto from 'crypto'

const OPENAI_API_KEY = process.env.OPENAI_API_KEY
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const EMBEDDING_MODEL = 'text-embedding-3-small'
const OPENAI_BATCH_SIZE = 100    // inputs per OpenAI call (max 2048; 100 keeps payload reasonable)
const SUPABASE_FETCH_SIZE = 500   // reports per Supabase fetch
const MAX_CHARS_PER_TEXT = 24000  // ~6000 tokens; safely under text-embedding-3-small's 8191 input limit

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    limit: parseInt(flag('--limit', '0') || '0'),
    workers: parseInt(flag('--workers', '4') || '4'),
    force: bool('--force'),
  }
}

function computeContentHash(text: string): string {
  return crypto.createHash('md5').update(text).digest('hex')
}

function buildReportText(r: any): string {
  // Match what src/lib/services/embedding.service.ts does
  const parts: string[] = []
  if (r.title) parts.push(r.title)
  if (r.summary) parts.push(r.summary)
  if (r.description) parts.push(r.description)
  if (r.location_name) parts.push('Location: ' + r.location_name)
  if (r.event_date) parts.push('Date: ' + r.event_date)
  if (r.category) parts.push('Category: ' + r.category)
  let text = parts.join('\n\n').trim()
  if (text.length > MAX_CHARS_PER_TEXT) text = text.substring(0, MAX_CHARS_PER_TEXT)
  return text
}

async function generateEmbeddings(texts: string[], retries = 3): Promise<number[][]> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const resp = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + OPENAI_API_KEY,
        },
        body: JSON.stringify({ model: EMBEDDING_MODEL, input: texts }),
      })
      if (!resp.ok) {
        const body = await resp.text()
        if (resp.status === 429 || resp.status >= 500) {
          // Rate limited or transient — back off + retry
          const wait = Math.min(60000, 2000 * Math.pow(2, attempt))
          console.warn('OpenAI ' + resp.status + ' — backing off ' + wait + 'ms (attempt ' + (attempt + 1) + '/' + retries + ')')
          await new Promise(r => setTimeout(r, wait))
          continue
        }
        throw new Error('OpenAI ' + resp.status + ': ' + body.substring(0, 200))
      }
      const json = await resp.json() as any
      return json.data.map((d: any) => d.embedding)
    } catch (e: any) {
      if (attempt === retries - 1) throw e
      const wait = Math.min(30000, 2000 * Math.pow(2, attempt))
      console.warn('OpenAI error, retrying in ' + wait + 'ms:', (e?.message || e))
      await new Promise(r => setTimeout(r, wait))
    }
  }
  throw new Error('OpenAI embeddings failed after ' + retries + ' retries')
}

interface WorkerStats {
  embedded: number
  skipped: number
  errors: number
  apiCalls: number
}

async function processBatch(reports: any[], supabase: any, stats: WorkerStats, force: boolean): Promise<void> {
  if (reports.length === 0) return

  // Build text + hash for each
  const prepared = reports.map((r: any) => {
    const text = buildReportText(r)
    return { id: r.id, text, hash: computeContentHash(text) }
  }).filter((p: any) => p.text && p.text.length > 50)  // skip tiny/empty reports

  // Pre-filter already-embedded if not forcing
  let toEmbed = prepared
  if (!force && prepared.length > 0) {
    const ids = prepared.map((p: any) => p.id)
    const { data: existing } = await supabase.from('embedding_sync')
      .select('source_id, content_hash')
      .eq('source_table', 'report')
      .in('source_id', ids)
    const existingMap = new Map<string, string>()
    for (const row of existing || []) existingMap.set(row.source_id, row.content_hash)
    toEmbed = prepared.filter((p: any) => existingMap.get(p.id) !== p.hash)
    stats.skipped += prepared.length - toEmbed.length
  }

  if (toEmbed.length === 0) return

  // Generate embeddings for all in one OpenAI call (up to OPENAI_BATCH_SIZE)
  // Caller already chunked reports by OPENAI_BATCH_SIZE so a single call here
  let embeddings: number[][]
  try {
    embeddings = await generateEmbeddings(toEmbed.map((p: any) => p.text))
    stats.apiCalls++
  } catch (e: any) {
    console.error('OpenAI failed for batch of ' + toEmbed.length + ':', e?.message || e)
    stats.errors += toEmbed.length
    return
  }

  // Bulk delete + insert vector_chunks
  const ids = toEmbed.map((p: any) => p.id)
  await supabase.from('vector_chunks').delete().eq('source_table', 'report').in('source_id', ids)

  const insertRows = toEmbed.map((p: any, idx: number) => ({
    source_table: 'report',
    source_id: p.id,
    chunk_index: 0,
    chunk_text: p.text,
    embedding: '[' + embeddings[idx].join(',') + ']',
    metadata: {},
    token_count: Math.ceil(p.text.length / 4),
  }))
  const { error: insertErr } = await supabase.from('vector_chunks').insert(insertRows)
  if (insertErr) {
    console.error('vector_chunks insert failed:', insertErr.message)
    stats.errors += toEmbed.length
    return
  }

  // Bulk upsert embedding_sync
  const syncRows = toEmbed.map((p: any) => ({
    source_table: 'report',
    source_id: p.id,
    content_hash: p.hash,
    chunk_count: 1,
    last_embedded_at: new Date().toISOString(),
  }))
  await supabase.from('embedding_sync').upsert(syncRows, { onConflict: 'source_table,source_id' })

  stats.embedded += toEmbed.length
}

async function worker(workerId: number, supabase: any, args: ReturnType<typeof parseArgs>, totalLimit: number, sharedOffset: { value: number }, stats: WorkerStats): Promise<void> {
  while (true) {
    // Claim next chunk of reports
    const myOffset = sharedOffset.value
    sharedOffset.value += SUPABASE_FETCH_SIZE
    if (totalLimit > 0 && myOffset >= totalLimit) break

    const fetchLimit = totalLimit > 0 ? Math.min(SUPABASE_FETCH_SIZE, totalLimit - myOffset) : SUPABASE_FETCH_SIZE

    const { data: reports, error } = await supabase
      .from('reports')
      .select('id, title, description, summary, category, location_name, country, state_province, event_date')
      .eq('status', 'approved')
      .order('created_at', { ascending: true })
      .range(myOffset, myOffset + fetchLimit - 1)

    if (error) {
      console.error('[worker ' + workerId + '] fetch failed:', error.message)
      break
    }
    if (!reports || reports.length === 0) break

    // Process in OPENAI_BATCH_SIZE chunks
    for (let i = 0; i < reports.length; i += OPENAI_BATCH_SIZE) {
      await processBatch(reports.slice(i, i + OPENAI_BATCH_SIZE), supabase, stats, args.force)
    }

    if (reports.length < fetchLimit) break  // exhausted
  }
}

async function main() {
  const args = parseArgs()
  if (!OPENAI_API_KEY) { console.error('OPENAI_API_KEY missing'); process.exit(1) }
  console.log('Fast report embedding backfill V11.17.36')
  console.log('Args:', JSON.stringify(args))

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  const { count: total } = await supabase.from('reports').select('*', { count: 'exact', head: true }).eq('status', 'approved')
  console.log('Total approved reports:', total)
  const { count: alreadyEmbedded } = await supabase.from('embedding_sync').select('*', { count: 'exact', head: true }).eq('source_table', 'report')
  console.log('Already embedded:', alreadyEmbedded, '/', total)

  const startMs = Date.now()
  const stats: WorkerStats = { embedded: 0, skipped: 0, errors: 0, apiCalls: 0 }
  const sharedOffset = { value: 0 }
  const totalLimit = args.limit > 0 ? args.limit : (total || 0)

  // Heartbeat
  const hb = setInterval(() => {
    const elapsedMin = Math.floor((Date.now() - startMs) / 60000)
    const elapsedSec = Math.floor(((Date.now() - startMs) % 60000) / 1000)
    const rate = stats.embedded / ((Date.now() - startMs) / 1000)
    const remaining = totalLimit - stats.embedded - stats.skipped
    const etaSec = rate > 0 ? remaining / rate : 0
    const etaMin = Math.floor(etaSec / 60)
    console.log('[+' + elapsedMin + 'm ' + elapsedSec + 's] embedded=' + stats.embedded + ' skipped=' + stats.skipped + ' errors=' + stats.errors + ' apiCalls=' + stats.apiCalls + ' rate=' + rate.toFixed(1) + '/s eta=' + etaMin + 'm')
  }, 15000)

  // Launch workers
  const workers: Promise<void>[] = []
  for (let i = 0; i < args.workers; i++) workers.push(worker(i, supabase, args, totalLimit, sharedOffset, stats))
  await Promise.all(workers)

  clearInterval(hb)
  const elapsedMin = Math.floor((Date.now() - startMs) / 60000)
  const elapsedSec = Math.floor(((Date.now() - startMs) % 60000) / 1000)
  console.log('\n========== FINAL ==========')
  console.log('Elapsed:        ' + elapsedMin + 'm ' + elapsedSec + 's')
  console.log('Embedded:       ' + stats.embedded)
  console.log('Skipped:        ' + stats.skipped)
  console.log('Errors:         ' + stats.errors)
  console.log('OpenAI calls:   ' + stats.apiCalls)
  console.log('Est. cost:      $' + ((stats.embedded * 500 / 1_000_000) * 0.02).toFixed(2))
}
main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
