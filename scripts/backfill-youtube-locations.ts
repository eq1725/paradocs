#!/usr/bin/env tsx
/**
 * Backfill location fields for YouTube-sourced reports.
 *
 * V11.17.39 (#111) — the YouTube adapter doesn't run NLP location
 * extraction on comment/transcript text. As a result, 39 YouTube
 * reports have NULL location_name despite many having explicit
 * geography in their title/body ("Hiker Loses Keys During Florida Heat
 * Ordeal" → Florida). This script runs Claude Haiku to extract
 * location-relevant entities, then MapTiler to resolve them to
 * lat/lng.
 *
 * Why a one-shot (vs patching the adapter): the YouTube corpus is
 * small (48 total, 39 missing), volume is low, and a backfill +
 * upstream-fix-later is faster than refactoring the adapter mid-
 * session. Adapter patch is filed as a follow-up.
 *
 * Pipeline per report:
 *   1. Haiku: extract {city, state_province, country} from title +
 *      summary + description. Strict JSON. Returns nulls for any
 *      field not explicitly mentioned (no hallucination).
 *   2. If at least one field is set, build a geocode query and resolve
 *      via MapTiler. Write back location_name + structured fields +
 *      lat/lng + location_precision.
 *   3. If Haiku returns all-nulls, mark with location_name="(unknown)"
 *      so we don't re-process on subsequent runs. The UI placeholder
 *      we shipped earlier ("Location: Not specified in source") still
 *      fires for rows with no city/state/country.
 *
 * Cost: 39 reports × ~$0.00006/call = ~$0.003 total. Negligible.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-youtube-locations.ts            # all 39
 *   npx tsx scripts/backfill-youtube-locations.ts --limit 5  # smoke
 *   npx tsx scripts/backfill-youtube-locations.ts --dry-run  # log only
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import { geocodeLocation, buildLocationQuery } from '../src/lib/services/geocoding.service'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string): string { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    limit: parseInt(flag('--limit', '0')),
    dryRun: bool('--dry-run'),
    // V11.17.52 — single-slug override (process one report regardless
    // of source_type / location_name state). Useful for one-off
    // operator fixes when a specific report has location in its title
    // or description but the DB fields are null. Skips the "Total
    // … rows w/o location" pre-count and the source filter.
    slug: flag('--slug', ''),
    // V11.17.52 — source override (default 'youtube' for back-compat).
    // Pass --source any to process across all source types.
    source: flag('--source', 'youtube'),
    // V11.17.52.2 — bounded concurrency for the 106k-row sweep.
    // Default 8 (~1k RPM, fits Anthropic Tier 2 with headroom).
    // Bump to 16-24 on higher tiers. Each worker pulls the next row
    // from a shared index counter.
    concurrency: Math.max(1, parseInt(flag('--concurrency', '8'))),
    // V11.17.52.3 — loop batches of --limit until the table is empty
    // (zero rows fetched). Lets the operator run a single command
    // for the whole sweep instead of a shell while-loop.
    untilDone: bool('--until-done'),
  }
}

interface ReportRow {
  id: string
  title: string | null
  summary: string | null
  description: string | null
}

interface ExtractedLocation {
  city: string | null
  state_province: string | null
  country: string | null
  confidence: 'high' | 'medium' | 'low' | 'none'
  rationale: string
}

const EXTRACT_PROMPT = `You extract geographic location ENTITIES from paranormal/anomalous experience reports.

CRITICAL RULES:
1. Only return locations EXPLICITLY mentioned in the text. Never infer from context.
2. "High desert" or "the woods" are NOT locations (too vague).
3. "Florida", "Texas", "Pacific Northwest" ARE locations.
4. "National Park" alone is NOT a location; "Yellowstone" IS.
5. Witness ethnicity/language clues (e.g., "I'm from Brazil") count.
6. If the report mentions multiple locations, pick the location WHERE THE EVENT HAPPENED, not where the witness now lives.
7. Always respond with valid JSON matching the schema below — no markdown fences, no prose.

Schema:
{
  "city": string | null,
  "state_province": string | null,
  "country": string | null,
  "confidence": "high" | "medium" | "low" | "none",
  "rationale": string (one short sentence explaining what you saw or why "none")
}

Confidence:
- "high"   = explicit city or state/province named
- "medium" = country named OR ambiguous regional reference ("the Midwest")
- "low"    = only vague hint ("out west", "back east")
- "none"   = no geographic anchor at all`

async function extractLocation(anth: Anthropic, row: ReportRow): Promise<ExtractedLocation | null> {
  const text = [row.title, row.summary, row.description]
    .filter(Boolean)
    .join('\n\n')
    .substring(0, 3000)
  if (!text.trim()) return null

  try {
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 256,
      system: EXTRACT_PROMPT,
      messages: [{ role: 'user', content: 'Report text:\n\n' + text }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const raw = block.text.trim()
    // Strip ```json fences if present
    const cleaned = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    const parsed = JSON.parse(cleaned)
    return {
      city: parsed.city || null,
      state_province: parsed.state_province || null,
      country: parsed.country || null,
      confidence: parsed.confidence || 'none',
      rationale: parsed.rationale || '',
    }
  } catch (e: any) {
    console.warn('  ! Haiku failed:', e?.message || e)
    return null
  }
}

function precisionFromAccuracy(accuracy: string): 'exact' | 'region' | 'country' {
  if (accuracy === 'address' || accuracy === 'street' || accuracy === 'locality') return 'exact'
  if (accuracy === 'region') return 'region'
  return 'country'
}

// V11.17.52.3 — single-batch run loop. Returns true when more rows
// remain (zero or more processed but the source still has work);
// false when the fetch came back empty.
async function runBatch(
  supabase: any,
  anth: Anthropic,
  args: ReturnType<typeof parseArgs>,
  cumulative: { extracted: number; geocoded: number; failed: number; unknown: number; processed: number }
): Promise<boolean> {

  // V11.17.52 — single-slug path bypasses the source / null-location
  // filters; processes exactly one report by its slug.
  let q: any
  if (args.slug) {
    q = supabase.from('reports')
      .select('id, title, summary, description')
      .eq('slug', args.slug)
      .limit(1)
    console.log('Single-slug mode: ' + args.slug)
  } else {
    const sourceFilter = args.source === 'any' ? null : args.source
    let countQ = supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')
      .is('location_name', null)
    if (sourceFilter) countQ = countQ.eq('source_type', sourceFilter)
    const { count: total } = await countQ
    console.log('Total rows w/o location' + (sourceFilter ? ' (' + sourceFilter + ')' : ' (all sources)') + ':', total, '\n')

    q = supabase.from('reports')
      .select('id, title, summary, description')
      .eq('status', 'approved')
      .is('location_name', null)
      .order('id', { ascending: true })
    if (sourceFilter) q = q.eq('source_type', sourceFilter)
    if (args.limit > 0) q = q.limit(args.limit)
  }

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No rows to process.'); return false }

  console.log('Concurrency:  ' + args.concurrency + ' workers\n')

  // Per-batch counters; accumulated into `cumulative` for the
  // --until-done loop summary.
  let extracted = 0
  let unknown = 0
  let geocoded = 0
  let failed = 0
  let processed = 0
  const total = rows.length
  const startedMs = Date.now()

  // V11.17.52.2 — worker pool. Each worker pulls the next row from a
  // shared index until the array is exhausted. Stats are incremented
  // mutably; JS is single-threaded so no races between awaits.
  let nextIndex = 0
  async function processRow(row: ReportRow): Promise<void> {
    if (args.dryRun) {
      console.log(row.id.substring(0, 8) + ' [DRY] ' + (row.title || '').substring(0, 60))
      return
    }

    const loc = await extractLocation(anth, row)
    if (!loc || loc.confidence === 'none') {
      unknown++
      await supabase.from('reports')
        .update({ location_name: '(location unknown)' })
        .eq('id', row.id)
      console.log(row.id.substring(0, 8) + ' → none')
      return
    }
    extracted++

    const query = buildLocationQuery({
      city: loc.city,
      stateProvince: loc.state_province,
      country: loc.country,
    })
    if (!query) {
      unknown++
      // V11.17.52.4 — mark the row so the next --until-done batch
      // doesn't re-pull it. Previous version printed "→ no query"
      // but left location_name NULL, causing an infinite loop on
      // rows where Haiku returned confidence != 'none' but no
      // specific city/state/country fields.
      await supabase.from('reports')
        .update({ location_name: '(location unknown)' })
        .eq('id', row.id)
      console.log(row.id.substring(0, 8) + ' → no query')
      return
    }

    const geo = await geocodeLocation(query)
    if (!geo) {
      const locationName = [loc.city, loc.state_province, loc.country].filter(Boolean).join(', ')
      await supabase.from('reports').update({
        location_name: locationName,
        city: loc.city,
        state_province: loc.state_province,
        country: loc.country,
      }).eq('id', row.id)
      failed++
      console.log(row.id.substring(0, 8) + ' → "' + locationName + '" (no geocode)')
      return
    }

    const precision = precisionFromAccuracy(geo.accuracy)
    const synthetic = precision !== 'exact'
    const locationName = [loc.city, loc.state_province, loc.country].filter(Boolean).join(', ')
    await supabase.from('reports').update({
      location_name: locationName,
      city: loc.city,
      state_province: loc.state_province,
      country: loc.country,
      latitude: geo.latitude,
      longitude: geo.longitude,
      location_precision: precision,
      coords_synthetic: synthetic,
    }).eq('id', row.id)

    geocoded++
    console.log(row.id.substring(0, 8) + ' → "' + locationName + '" @ ' + geo.latitude.toFixed(2) + ',' + geo.longitude.toFixed(2) + ' (' + precision + ')')
  }

  async function worker(workerId: number): Promise<void> {
    while (true) {
      const i = nextIndex++
      if (i >= total) return
      const row = rows[i] as ReportRow
      try {
        await processRow(row)
      } catch (e: any) {
        console.warn(row.id.substring(0, 8) + ' ! error: ' + (e?.message || e))
      }
      processed++
      // Lightweight progress every 50 rows.
      if (processed % 50 === 0) {
        const el = (Date.now() - startedMs) / 1000
        const rate = processed / el
        const eta = (total - processed) / rate
        console.log('--- progress: ' + processed + '/' + total + ' | rate ' + rate.toFixed(1) + '/s | ETA ' + Math.round(eta / 60) + 'm ---')
      }
    }
  }

  const workers = Array.from({ length: args.concurrency }, (_, i) => worker(i))
  await Promise.all(workers)

  const elapsed = ((Date.now() - startedMs) / 1000).toFixed(1)
  console.log('\n========== BATCH SUMMARY ==========')
  console.log('Processed:    ' + rows.length + ' in ' + elapsed + 's')
  console.log('Extracted:    ' + extracted, '(Haiku found a location)')
  console.log('Geocoded:     ' + geocoded, '(MapTiler resolved to lat/lng)')
  console.log('Text-only:    ' + failed,   '(location text written but no coords)')
  console.log('Unknown:      ' + unknown,  '(no location anywhere in source)')

  cumulative.extracted += extracted
  cumulative.geocoded += geocoded
  cumulative.failed += failed
  cumulative.unknown += unknown
  cumulative.processed += rows.length

  return true
}

async function main() {
  const args = parseArgs()
  console.log('Backfill YouTube locations — V11.17.52.3')
  console.log('args:', JSON.stringify(args))

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const cumulative = { extracted: 0, geocoded: 0, failed: 0, unknown: 0, processed: 0 }
  const startedMs = Date.now()

  if (args.untilDone && args.slug) {
    console.warn('--until-done ignored when --slug is set (single-row mode).')
  }

  let batchNum = 0
  while (true) {
    batchNum++
    if (args.untilDone && !args.slug) {
      console.log('\n========== BATCH ' + batchNum + ' ==========')
    }
    const more = await runBatch(supabase, anth, args, cumulative)
    if (!args.untilDone || args.slug) break
    if (!more) break
  }

  if (args.untilDone && !args.slug) {
    const totalMin = ((Date.now() - startedMs) / 1000 / 60).toFixed(1)
    console.log('\n========== ALL DONE ==========')
    console.log('Batches:     ' + batchNum)
    console.log('Total time:  ' + totalMin + ' min')
    console.log('Processed:   ' + cumulative.processed)
    console.log('Extracted:   ' + cumulative.extracted)
    console.log('Geocoded:    ' + cumulative.geocoded)
    console.log('Text-only:   ' + cumulative.failed)
    console.log('Unknown:     ' + cumulative.unknown)
  }
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
