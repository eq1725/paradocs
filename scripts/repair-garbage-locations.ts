/**
 * repair-garbage-locations.ts — V11.18.35
 *
 * Repairs approved reports whose `city` is a parse artifact rather than a
 * real place (see docs/LOCATION_GARBAGE_PARSE_PLAN.md). Deterministic — no
 * AI — so it runs in-sandbox and is fully reversible:
 *   - RECOVER: strip parentheticals / altitude prefixes / relative
 *     prepositions / trailing descriptors, take the leading place token, and
 *     keep it IF it passes isLikelyPlaceName (then title-case + rebuild
 *     location_name).
 *   - NULL + FLAG: if nothing real is recoverable, set city=null, downgrade
 *     location_precision, set metadata.location_review='unrecoverable_parse',
 *     and rebuild location_name from state/country (never display a fake city).
 *
 * USAGE
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/repair-garbage-locations.ts            # DRY RUN
 *   npx tsx scripts/repair-garbage-locations.ts --apply
 *   npx tsx scripts/repair-garbage-locations.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
import { smartTitleCase, isLikelyPlaceName } from '../src/lib/ingestion/utils/normalize-location'

const SNAP = path.resolve(process.cwd(), 'outputs/garbage-location-repair-ids.json')

/** Deterministic best-effort extraction of a real place token from a noisy city/location string. */
function recoverPlace(rawCity: string | null, rawLoc: string | null): string | null {
  let s = (rawCity || '').trim()
  if (!s && rawLoc) s = String(rawLoc).split(',')[0].trim()
  if (!s) return null
  s = s.replace(/\s*\([^)]*\)/g, ' ').trim()                                   // strip (parentheticals)
  s = s.replace(/^[\d,]+\s*(feet|ft|foot|miles?|mi|km|kilometers?|meters?|m)\b[^A-Za-z]*\b(over|above|from|near|outside|by|past|off|of)\b\s*/i, '') // "20,000 feet over "
  s = s.replace(/^(just outside|just past|somewhere in|somewhere near|off of|near|around|outside|past|off|along|between|approximately|approx\.?|somewhere|the|a|an|and|remote|rural|upstate|downtown|over|above|in|on)\s+/i, '')
  s = s.replace(/[,;]?\s+(looking|heading|facing|toward|towards|direction|area|region|vicinity|in[- ]?flight|enroute|en route)\b.*$/i, '') // trailing descriptors
  let city = s.split(',')[0].trim().replace(/[;:.\-\s]+$/, '').trim()
  return isLikelyPlaceName(city) ? (smartTitleCase(city) as string) : null
}

const isGarbageCity = (city: string | null): boolean => !!city && !isLikelyPlaceName(city)

const JUNK_STATE = new Set(['unspecified', 'unknown', 'n/a', 'na', 'various', 'multiple', 'undisclosed', 'none', 'other'])
/** Title-cased state if it looks like a real subdivision, else null (drops garbage like "Tokyo to Honolulu", "unspecified"). */
function cleanState(s: string | null): string | null {
  if (!s) return null
  const t = String(s).trim()
  if (!t || t.length > 22) return null
  if (/\d/.test(t)) return null
  if (/[^A-Za-z .'-]/.test(t)) return null
  if (/\b(to|of|and|the|near|over|from)\b/i.test(t)) return null   // a phrase, not a state
  if (JUNK_STATE.has(t.toLowerCase())) return null
  if (t.split(/\s+/).length > 3) return null
  return smartTitleCase(t)
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')
  const dotenv = await import('dotenv'); dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) { console.error('Missing Supabase env.'); process.exit(1) }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)

  if (revert) {
    if (!fs.existsSync(SNAP)) { console.error('No snapshot at ' + SNAP); process.exit(1) }
    const rows: any[] = JSON.parse(fs.readFileSync(SNAP, 'utf8')).rows || []
    console.log('[garbage-loc] REVERT ' + rows.length + ' rows…')
    let n = 0
    await pool(rows, 12, async (r) => {
      await sb.from('reports').update({ city: r.city, state_province: r.state_province, location_name: r.location_name, location_precision: r.location_precision, metadata: r.metadata }).eq('id', r.id); n++
    })
    console.log('[garbage-loc] reverted ' + n); return
  }

  // ── Gather candidate garbage rows (union of patterns) ────────────
  const byId = new Map<string, any>()
  const cols = 'id, city, state_province, country, location_name, location_precision, metadata, source_type'
  const pull = async (col: string, op: string, pat: string) => {
    let from = 0
    while (true) {
      const r = await (sb.from('reports').select(cols).eq('status', 'approved') as any).filter(col, op, pat).range(from, from + 999)
      if (r.error) { console.error('q err (' + col + ' ' + op + '): ' + r.error.message); break }
      for (const row of r.data || []) byId.set(row.id, row)
      if (!r.data || r.data.length < 1000) break
      from += 1000
    }
  }
  console.log('[garbage-loc] gathering candidates…')
  await pull('city', 'match', '^.{40,}')                                  // over-captured
  await pull('city', 'match', '^[a-z]')                                   // lowercase residual
  await pull('city', 'imatch', '^(the|a|an|some|and|near|around|upstate|downtown|various|unknown|several|outside|remote|rural|off|along|between|somewhere|approx)( |,)') // stopword-initial
  await pull('location_name', 'imatch', '^(vol|pp|ch|fig)\\.')            // citation, city often null

  // Keep only rows whose city is actually garbage (or null-city citation rows)
  const cand = [...byId.values()].filter(r => isGarbageCity(r.city) || (!r.city && /^(vol|pp|ch|fig)\./i.test(r.location_name || '')))

  // ── Classify recover vs null ──────────────────────────────────────
  const updates: any[] = [], snapshot: any[] = []
  let recovered = 0, nulled = 0
  const samples: any[] = []
  for (const r of cand) {
    const place = recoverPlace(r.city, r.location_name)
    const st = cleanState(r.state_province)
    const ctry = r.country && r.country !== 'United States' ? cleanState(r.country) : null
    let upd: any, kind: string
    if (place) {
      const loc = [place, st, ctry].filter(Boolean).join(', ')
      upd = { city: place, state_province: st, location_name: loc || null }
      kind = 'recovered'; recovered++
    } else {
      const meta = { ...(r.metadata || {}), location_review: 'unrecoverable_parse' }
      const loc = [st, ctry].filter(Boolean).join(', ') || null
      upd = { city: null, state_province: st, location_name: loc, location_precision: st ? 'region' : 'country', metadata: meta }
      kind = 'nulled'; nulled++
    }
    updates.push({ id: r.id, ...upd })
    snapshot.push({ id: r.id, city: r.city, state_province: r.state_province, location_name: r.location_name, location_precision: r.location_precision, metadata: r.metadata })
    if (samples.filter(s => s.kind === kind).length < 4) samples.push({ kind, src: r.source_type, before: (r.city || '∅') + ' | ' + (r.location_name || '∅'), after: (upd.city || '∅') + ' | ' + (upd.location_name || '∅') })
  }

  console.log('\n=== garbage-location repair ' + (apply ? '(APPLY)' : '(DRY RUN)') + ' ===')
  console.log('candidates examined:  ' + cand.length)
  console.log('RECOVERABLE (real place extracted): ' + recovered)
  console.log('UNRECOVERABLE (null + flag):         ' + nulled)
  console.log('\n--- representative before → after ---')
  for (const s of samples.sort((a, b) => a.kind.localeCompare(b.kind))) console.log('  [' + s.kind + ', ' + s.src + ']  "' + s.before + '"  →  "' + s.after + '"')

  if (!apply) { console.log('\nDRY RUN — no writes. --apply to update ' + updates.length + ' rows (reversible via --revert).'); return }

  fs.mkdirSync(path.dirname(SNAP), { recursive: true })
  fs.writeFileSync(SNAP, JSON.stringify({ savedAt: new Date().toISOString(), rows: snapshot }, null, 0))
  console.log('\n[garbage-loc] snapshot ' + snapshot.length + ' → ' + SNAP)
  let done = 0, errs = 0
  await pool(updates, 12, async (u) => {
    const { id, ...fields } = u
    const r = await sb.from('reports').update(fields).eq('id', id)
    if (r.error) { errs++; if (errs <= 5) console.warn('  err ' + id + ': ' + r.error.message) } else done++
    if (done % 100 === 0) process.stdout.write('\r  updated ' + done + '/' + updates.length)
  })
  console.log('\n[garbage-loc] done. updated ' + done + ' (recovered ' + recovered + ', nulled ' + nulled + '), errors ' + errs + '. Revert: --revert')
}

async function pool<T>(items: T[], n: number, fn: (t: T) => Promise<void>): Promise<void> {
  let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const idx = i++; await fn(items[idx]) } }))
}

main().catch(e => { console.error('[garbage-loc] unhandled:', e); process.exit(1) })
