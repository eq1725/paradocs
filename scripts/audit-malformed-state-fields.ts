#!/usr/bin/env tsx
/**
 * Audit approved reports whose state_province field doesn't match any
 * canonical state/province name for the report's country.
 *
 * V11.17.39 — operator spot-check found "Ouija Board" report with
 * state_province="AS", city="OUIJ" — both clearly corrupted strings,
 * not real location data. The wrong-country geocode audit fixed the
 * coords, but the string fields still render as-is on report cards,
 * showing "AS" in the location badge. Need a string-level cleanup.
 *
 * Detection:
 *   status='approved' AND state_province IS NOT NULL AND
 *   state_province NOT IN canonical state names/aliases for the
 *   report's country (per state-centroids.json)
 *
 * Haiku verdict:
 *   - "keep"    : state_province IS valid (false positive — maybe a
 *                 long-tail subdivision we don't have in our JSON, or
 *                 a legitimate spelling variant)
 *   - "null"    : state_province is garbage, null it out
 *   - "correct" : state_province is a recoverable typo / short form;
 *                 Haiku provides the canonical name
 *
 * Default DRY-RUN.
 *
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/audit-malformed-state-fields.ts --dry-run
 *   npx tsx scripts/audit-malformed-state-fields.ts --apply
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Anthropic from '@anthropic-ai/sdk'
import countryCentroids from '../src/lib/ingestion/utils/country-centroids.json'
import stateCentroids from '../src/lib/ingestion/utils/state-centroids.json'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    apply: bool('--apply'),
    dryRun: bool('--dry-run') || !bool('--apply'),
    limit: parseInt(flag('--limit', '0') || '0'),
    concurrency: parseInt(flag('--concurrency', '8') || '8'),
  }
}

function buildCountryNameMap(): Record<string, string> {
  const map: Record<string, string> = {}
  for (const [iso2, entry] of Object.entries(countryCentroids as any)) {
    if (typeof entry !== 'object' || !entry || iso2.startsWith('$')) continue
    const e = entry as any
    if (e.name) map[e.name.toLowerCase()] = iso2
    if (Array.isArray(e.aliases)) for (const a of e.aliases) map[String(a).toLowerCase()] = iso2
  }
  return map
}

// Build country → set of canonical state names + ISO codes
function buildStateNameSet(): Record<string, Set<string>> {
  const out: Record<string, Set<string>> = {}
  for (const [iso2, states] of Object.entries(stateCentroids as any)) {
    if (typeof states !== 'object' || !states || iso2.startsWith('$')) continue
    out[iso2] = new Set<string>()
    for (const [key, entry] of Object.entries(states as any)) {
      if (typeof entry !== 'object' || !entry) continue
      const e = entry as any
      out[iso2].add(key.toLowerCase())  // e.g. "CA"
      if (e.name) out[iso2].add(String(e.name).toLowerCase())  // e.g. "california"
    }
  }
  return out
}

const HAIKU_PROMPT = `You audit Paradocs (a paranormal-experience platform) reports for malformed state_province values. The system has flagged this report because the stored state_province field doesn't match any canonical state name or ISO code for the report's claimed country.

Possible reasons:
  - The field is genuinely garbage (random characters, truncated string, an unrelated word that got captured during extraction)
  - The field is a legitimate spelling variant or long-tail subdivision we just don't have in our canonical list
  - The field is a recoverable typo of a real state (e.g. "Texa" → "Texas", "Califonia" → "California")

Decide:
  - "keep"    : the value is a legitimate state/province that we just don't recognize. Pass through unchanged. Use when you can verify it's a real subdivision from the report's full description.

  - "null"    : the value is genuinely garbage (e.g. "AS" with city "OUIJ" — clearly Ouija-board fragment). Set state_province to null. Use when nothing in the report description supports the stored value AND the string itself looks malformed (very short, all-caps acronym in an unexpected context, etc.).

  - "correct" : the value is a typo or short form recoverable to a canonical state/province name. Provide the corrected canonical name. Only use when the typo is unambiguous AND the description supports the corrected location.

Conservative bias: prefer "null" over "correct" when uncertain. We'd rather null out a bad value than guess at a "correction" that might be wrong.

Respond with valid JSON only (no markdown):
{
  "verdict": "keep" | "null" | "correct",
  "corrected_name": "<canonical state name, only when verdict=correct>",
  "confidence": "high" | "medium" | "low",
  "reason": "<one sentence>"
}`

interface Candidate {
  id: string
  slug: string
  title: string
  country: string
  state_province: string
  city: string | null
  description: string | null
  _verdict?: { verdict: string; corrected_name?: string; confidence: string; reason: string }
}

async function classify(anth: Anthropic, c: Candidate): Promise<Candidate['_verdict'] | null> {
  try {
    const userBlock =
      'TITLE: ' + c.title + '\n' +
      'CLAIMED country: ' + c.country + '\n' +
      'STORED state_province: "' + c.state_province + '"\n' +
      'STORED city: ' + (c.city ? '"' + c.city + '"' : 'null') + '\n\n' +
      'DESCRIPTION (first 1500 chars): ' + (c.description || '').substring(0, 1500)
    const resp = await anth.messages.create({
      model: 'claude-haiku-4-5',
      max_tokens: 220,
      system: HAIKU_PROMPT,
      messages: [{ role: 'user', content: userBlock }],
    })
    const block = resp.content[0]
    if (block.type !== 'text') return null
    const cleaned = block.text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned)
  } catch (_e) { return null }
}

async function main() {
  const args = parseArgs()
  console.log('Audit malformed state_province — V11.17.39')
  console.log('Mode:', args.apply ? 'APPLY' : 'DRY-RUN')
  console.log()

  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }
  const s = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const anth = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

  const countryNameMap = buildCountryNameMap()
  const stateNameSet = buildStateNameSet()

  // Page through approved reports with state_province + country set.
  const candidates: Candidate[] = []
  let lastId = ''
  let scanned = 0
  while (true) {
    let q = s.from('reports')
      .select('id, slug, title, country, state_province, city, description')
      .eq('status', 'approved')
      .not('state_province', 'is', null)
      .not('country', 'is', null)
      .order('id', { ascending: true })
      .limit(1000)
    if (lastId) q = q.gt('id', lastId) as any
    const { data, error } = await q
    if (error) { console.error('fetch failed:', error.message); process.exit(1) }
    if (!data || data.length === 0) break

    for (const r of data as any[]) {
      scanned++
      const countryRaw = (r.country || '').toString().toLowerCase().trim()
      const iso2 = countryNameMap[countryRaw]
      if (!iso2) continue  // country not in our canonical list — skip
      const stateSet = stateNameSet[iso2]
      if (!stateSet) continue  // we don't have first-class state coverage for this country
      const stateRaw = (r.state_province || '').toString().toLowerCase().trim()
      if (!stateRaw) continue
      if (stateSet.has(stateRaw)) continue  // valid canonical match → skip

      candidates.push({
        id: r.id,
        slug: r.slug,
        title: r.title || '',
        country: r.country,
        state_province: r.state_province,
        city: r.city,
        description: r.description,
      })
    }
    lastId = data[data.length - 1].id
    if (scanned % 5000 === 0) console.log('  scanned: ' + scanned + ' / candidates: ' + candidates.length)
    if (data.length < 1000) break
  }
  console.log()
  console.log('Scanned:    ' + scanned)
  console.log('Candidates: ' + candidates.length)
  if (candidates.length === 0) { console.log('Nothing to audit.'); return }

  const cap = args.limit > 0 ? Math.min(args.limit, candidates.length) : candidates.length
  const sample = candidates.slice(0, cap)
  console.log('Will Haiku-classify: ' + sample.length)
  console.log()

  const toKeep: Candidate[] = []
  const toNull: Candidate[] = []
  const toCorrect: Candidate[] = []
  const failed: Candidate[] = []
  let processed = 0
  const startMs = Date.now()

  const queue = sample.slice()
  async function worker() {
    while (queue.length > 0) {
      const c = queue.shift()
      if (!c) break
      const v = await classify(anth, c)
      if (!v) { failed.push(c) }
      else {
        c._verdict = v
        if (v.verdict === 'keep') toKeep.push(c)
        else if (v.verdict === 'null') toNull.push(c)
        else if (v.verdict === 'correct' && typeof v.corrected_name === 'string' && v.corrected_name) toCorrect.push(c)
        else failed.push(c)
      }
      processed++
      if (processed % 50 === 0) {
        const elapsedSec = (Date.now() - startMs) / 1000
        const rate = processed / elapsedSec
        const eta = Math.floor((sample.length - processed) / Math.max(rate, 0.01))
        console.log('[+' + Math.floor(elapsedSec) + 's] ' + processed + '/' + sample.length +
          ' keep=' + toKeep.length + ' null=' + toNull.length + ' correct=' + toCorrect.length +
          ' rate=' + rate.toFixed(1) + '/s eta=' + Math.floor(eta / 60) + 'm')
      }
    }
  }
  const workers: Promise<void>[] = []
  for (let w = 0; w < args.concurrency; w++) workers.push(worker())
  await Promise.all(workers)

  console.log()
  console.log('=== Pre-flight ===')
  console.log('keep    (legit long-tail): ' + toKeep.length)
  console.log('null    (garbage):         ' + toNull.length)
  console.log('correct (recoverable):     ' + toCorrect.length)
  console.log('Haiku-failed:              ' + failed.length)
  console.log()

  function shuffle<T>(arr: T[]): T[] {
    const a = arr.slice()
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  function printSample(label: string, list: Candidate[], n: number) {
    if (list.length === 0) return
    console.log(label + ' sample (' + Math.min(n, list.length) + ' random):')
    for (const c of shuffle(list).slice(0, n)) {
      const extra = c._verdict?.verdict === 'correct' ? ' → "' + c._verdict.corrected_name + '"' : ''
      console.log('  ' + c.id.substring(0, 8) + ' | ' + c.country + ' / "' + c.state_province + '"' +
        (c.city ? ' / "' + c.city + '"' : '') + extra)
      console.log('       title: ' + (c.title || '').substring(0, 70))
      if (c._verdict) console.log('       [' + (c._verdict.confidence || '?') + '] ' + (c._verdict.reason || '').substring(0, 120))
    }
    console.log()
  }
  printSample('KEEP', toKeep, 15)
  printSample('NULL', toNull, 30)
  printSample('CORRECT', toCorrect, 30)

  if (args.dryRun) {
    console.log('Dry-run complete. Re-run with --apply to update ' + (toNull.length + toCorrect.length) + ' reports.')
    return
  }
  if (toNull.length === 0 && toCorrect.length === 0) {
    console.log('Nothing to update.'); return
  }

  // Apply nulls in batches of 100. We null state_province AND city
  // when state is being nulled — if state was garbage and city was
  // also garbage (typical co-occurrence: "AS" + "OUIJ"), both go.
  // If city looks plausible (>= 5 chars, has lowercase), preserve it.
  let nulled = 0
  let errors = 0
  for (let i = 0; i < toNull.length; i += 100) {
    const batch = toNull.slice(i, i + 100)
    for (const c of batch) {
      const cityLooksGarbage = !c.city || c.city.length < 5 || /^[A-Z]+$/.test(c.city)
      const update: any = {
        state_province: null,
        moderation_notes: 'V11.17.39 — malformed-state audit: state_province was garbage ("' + c.state_province + '")',
      }
      if (cityLooksGarbage && c.city) update.city = null
      const { error } = await s.from('reports').update(update).eq('id', c.id)
      if (error) errors++
      else nulled++
    }
    console.log('  null batch ' + Math.floor(i / 100 + 1) + ': ' + batch.length + ' processed')
  }

  let corrected = 0
  for (const c of toCorrect) {
    if (!c._verdict || !c._verdict.corrected_name) continue
    const { error } = await s.from('reports').update({
      state_province: c._verdict.corrected_name,
      moderation_notes: 'V11.17.39 — malformed-state audit: "' + c.state_province + '" → "' + c._verdict.corrected_name + '"',
    }).eq('id', c.id)
    if (error) errors++
    else corrected++
    if (corrected % 50 === 0) console.log('  corrected: ' + corrected + '/' + toCorrect.length)
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Nulled out: ' + nulled)
  console.log('Corrected:  ' + corrected)
  console.log('Errors:     ' + errors)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
