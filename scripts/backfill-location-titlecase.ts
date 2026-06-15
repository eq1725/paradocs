/**
 * backfill-location-titlecase.ts — V11.18.34
 *
 * One-time fix for approved reports whose place strings were stored
 * lowercase (e.g. chronicling-america "ebensburg, pennsylvania", reddit
 * "west sacramento"). Title-cases city / state_province / location_name
 * using the SAME exception-aware `smartTitleCase` the ingestion normalizer
 * now uses (single source of truth) — so McKinney / DeKalb / PA / NYC are
 * preserved automatically.
 *
 * SCOPE: approved rows with a lowercase-initial city, location_name, or
 * state_province. EXCLUDES garbage location parses (city begins with a
 * stopword/fragment like "the", "some", "an upscale", or has >4 words) —
 * those are a separate parser-quality problem (capitalizing them only
 * yields "The, WI"); they're left untouched and reported.
 *
 * Reversible: --apply snapshots {id, city, state_province, location_name}
 * (old values) to outputs/location-titlecase-backfill-ids.json; --revert
 * restores them.
 *
 * USAGE (operator terminal or sandbox)
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-location-titlecase.ts            # DRY RUN
 *   npx tsx scripts/backfill-location-titlecase.ts --apply
 *   npx tsx scripts/backfill-location-titlecase.ts --revert
 */

import * as fs from 'fs'
import * as path from 'path'
import { smartTitleCase } from '../src/lib/ingestion/utils/normalize-location'

const SNAP = path.resolve(process.cwd(), 'outputs/location-titlecase-backfill-ids.json')

// Stopword / fragment first-words that signal a bad parse, not a city.
const STOP = new Set([
  'the', 'a', 'an', 'some', 'and', 'or', 'near', 'around', 'upstate', 'downtown',
  'northeastern', 'northern', 'southern', 'eastern', 'western', 'central', 'rural',
  'rual', 'outside', 'various', 'unknown', 'my', 'our', 'several', 'approximately',
  'approx', 'off', 'along', 'between', 'somewhere', 'about',
])

/** A candidate city value that is actually a garbage parse, not a place. */
function isGarbageCity(city: string | null, locationName: string | null): boolean {
  const probe = (city && city.trim()) || (locationName ? locationName.split(',')[0].trim() : '')
  if (!probe) return false
  const words = probe.split(/\s+/)
  if (words.length > 4) return true
  return STOP.has(words[0].toLowerCase())
}

const lc = (s: string | null) => !!s && /^[a-z]/.test(s)

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')

  const dotenv = await import('dotenv')
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing Supabase env. Source .env.local.'); process.exit(1) }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)

  // ── REVERT ───────────────────────────────────────────────────────
  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('No snapshot at ' + SNAP); process.exit(1) }
    const rows: any[] = JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || []
    console.log('[loc-backfill] REVERT: restoring ' + rows.length + ' rows…')
    let done = 0
    await pool(rows, 12, async (r) => {
      await sb.from('reports').update({ city: r.city, state_province: r.state_province, location_name: r.location_name }).eq('id', r.id)
      done++
    })
    console.log('[loc-backfill] reverted ' + done + ' rows.')
    return
  }

  // ── Load candidate rows (lowercase-initial city/location_name/state) ──
  console.log('[loc-backfill] loading candidates (approved, lowercase-initial place strings)…')
  const cand: any[] = []
  let from = 0
  while (true) {
    const r = await sb.from('reports')
      .select('id, city, state_province, location_name, source_type')
      .eq('status', 'approved')
      .or('city.match.^[a-z],state_province.match.^[a-z]')
      .range(from, from + 999)
    if (r.error) { console.error('query error: ' + r.error.message); process.exit(1) }
    const d = r.data || []
    cand.push(...d)
    if (d.length < 1000) break
    from += 1000
  }

  // ── Classify: garbage (skip) vs real (title-case) ────────────────
  const updates: any[] = []
  const snapshot: any[] = []
  let garbage = 0
  const samples: { kind: string; before: string; after: string; src: string }[] = []
  for (const row of cand) {
    if (isGarbageCity(row.city, row.location_name)) { garbage++; continue }
    const newCity = smartTitleCase(row.city)
    const newState = smartTitleCase(row.state_province)
    const newLoc = smartTitleCase(row.location_name)
    if (newCity === row.city && newState === row.state_province && newLoc === row.location_name) continue
    updates.push({ id: row.id, city: newCity, state_province: newState, location_name: newLoc })
    snapshot.push({ id: row.id, city: row.city, state_province: row.state_province, location_name: row.location_name })
    // collect representative samples
    const bShow = (row.city || '') + ' | ' + (row.location_name || '')
    const aShow = (newCity || '') + ' | ' + (newLoc || '')
    const tag =
      /\s/.test((row.city || '').trim()) ? 'multi-word'
      : /-/.test(row.location_name || '') ? 'hyphen'
      : /'/.test(row.location_name || '') ? 'apostrophe'
      : /,\s*[A-Z][a-z]+$/.test(row.location_name || '') && row.source_type !== 'nuforc' ? 'city,country?'
      : 'simple'
    if (samples.filter(s => s.kind === tag).length < 3) samples.push({ kind: tag, before: bShow, after: aShow, src: row.source_type })
  }

  console.log('\n=== loc title-case backfill ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ===')
  console.log('candidates (lowercase-initial):     ' + cand.length)
  console.log('excluded as garbage parse:          ' + garbage + '  (left untouched — separate parser cleanup)')
  console.log('rows to retitle-case:               ' + updates.length)

  console.log('\n--- representative before → after ---')
  for (const s of samples.sort((a, b) => a.kind.localeCompare(b.kind))) {
    console.log('  [' + s.kind + ', ' + s.src + ']  "' + s.before + '"  →  "' + s.after + '"')
  }

  // Prove the exception-aware caser leaves tricky already-correct names alone:
  console.log('\n--- caser no-op proof (already-correct inputs must be unchanged) ---')
  for (const t of ['McKinney', 'DeKalb', 'Las Vegas', 'NYC', "O'Fallon", 'Winston-Salem', 'Ebensburg, PA']) {
    const out = smartTitleCase(t)
    console.log('  "' + t + '" → "' + out + '"' + (out === t ? '  ✓ unchanged' : '  ⚠ CHANGED'))
  }
  console.log('--- and the fixes it should make ---')
  for (const t of ['west sacramento', 'winston-salem', "o'fallon", 'mckinney', 'ebensburg, pennsylvania']) {
    console.log('  "' + t + '" → "' + smartTitleCase(t) + '"')
  }

  if (!apply) {
    console.log('\nDRY RUN — no writes. Re-run with --apply to update ' + updates.length + ' rows (reversible via --revert).')
    return
  }

  // ── APPLY ─────────────────────────────────────────────────────────
  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), rows: snapshot }, null, 0))
  console.log('\n[loc-backfill] snapshot of ' + snapshot.length + ' old values → ' + SNAP)
  let done = 0, errs = 0
  await pool(updates, 12, async (u) => {
    const r = await sb.from('reports').update({ city: u.city, state_province: u.state_province, location_name: u.location_name }).eq('id', u.id)
    if (r.error) { errs++; if (errs <= 5) console.warn('  update err ' + u.id + ': ' + r.error.message) }
    else done++
    if (done % 100 === 0) process.stdout.write('\r  updated ' + done + '/' + updates.length)
  })
  console.log('\n[loc-backfill] done. updated ' + done + ', errors ' + errs + '. Revert: --revert')
}

/** Minimal concurrency pool. */
async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const idx = i++; await fn(items[idx]) }
  }))
}

main().catch(e => { console.error('[loc-backfill] unhandled:', e); process.exit(1) })
