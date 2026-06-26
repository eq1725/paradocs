#!/usr/bin/env tsx
/**
 * ca-location-recheck.ts — CA foreign-location corrector
 *
 * PROBLEM: scripts/ca-extract-ingest.ts ingests every Chronicling-America
 * report with a HARDCODED country:'United States' / country_code:'US' (see
 * ~line 751). When a story actually happened ABROAD but the locale name also
 * exists in the US, normalizeLocation resolved it to the same-named US place —
 * e.g. a story explicitly set in "Cheshire, England" got stored as
 * country=United States / state=Idaho / city=Cheshire with Idaho coords;
 * "Toklen, China" landed on Washington DC. The coords are internally
 * consistent with the WRONG country, so the existing geocode audits (which
 * check coord-vs-country agreement) can NOT catch it.
 *
 * GOAL: read the report TEXT, decide where the event TRULY happened, and on
 * --apply re-geocode + correct the row. Fully reversible, DRY-RUN by default,
 * resumable, cost/time-capped, idempotent, conservative.
 *
 * PIPELINE:
 *   1. GATHER  — page through source_type='chronicling-america' AND status IN
 *      ('approved','pending_review'); cache to outputs/ca-locrecheck-cache.json.
 *   2. PREFILTER (deterministic, free) — a row is a CANDIDATE only if it is
 *      currently US-tagged (country null / 'United States' / code 'US') AND its
 *      title+description contains a whole-word foreign country / demonym signal
 *      from the curated FOREIGN_TOKENS list. Rows already stamped
 *      metadata.location_rechecked===true are skipped (re-run idempotence).
 *      The prefilter only NARROWS; Haiku is the real decider, so US places that
 *      share a foreign name (Paris TX, Cheshire CT) are fine to pass through.
 *   3. HAIKU   — per candidate, ask Haiku (geographer role) where the EVENT
 *      actually happened (not where the paper was published). Strict JSON out.
 *      Time-boxed (RUN_BUDGET_SEC, default 600) + cost-capped (MAX_COST_USD,
 *      default 15). Processed ids persisted to outputs/ca-locrecheck-processed.json.
 *   4. DECIDE + APPLY — only act on a CONFIDENT (confidence>=60) NON-US country
 *      that DIFFERS from the stored country. Re-geocode via normalizeLocation
 *      passing the AI country (country_code:null so it resolves by NAME). On
 *      --apply update country/code/state/city/location_name/lat/lng/synthetic,
 *      stamp metadata.location_rechecked=true and metadata.location_recheck_prev
 *      with the old values. US / UNKNOWN / low-confidence → row unchanged, only
 *      stamped rechecked so we never re-Haiku it. Never corrupt a correct US row.
 *
 * REVERSIBLE: outputs/ca-locrecheck-snapshot.json holds prior field values;
 *   --revert restores them and clears the metadata.location_recheck* keys.
 *
 * USAGE (founder, in terminal):
 *   set -a; source .env.local; set +a
 *
 *   # DRY RUN (default) — gather, prefilter, Haiku a time-boxed chunk, print a
 *   #   sample of proposed BEFORE->AFTER changes + counts. No DB writes.
 *   npx tsx scripts/ca-location-recheck.ts
 *
 *   # APPLY — correct confident non-US rows; reversible; resumable (re-run).
 *   npx tsx scripts/ca-location-recheck.ts --apply
 *   MAX_COST_USD=25 RUN_BUDGET_SEC=900 npx tsx scripts/ca-location-recheck.ts --apply
 *
 *   # REVERT — restore prior location fields from the apply snapshot.
 *   npx tsx scripts/ca-location-recheck.ts --revert
 */
import * as fs from 'fs'
import * as path from 'path'
import {
  normalizeLocation,
  geocodeWithFallback,
  makeSupabaseGeocodeCache,
} from '../src/lib/ingestion/utils/normalize-location'

// ── Config ──────────────────────────────────────────────────────────
const HAIKU = 'claude-haiku-4-5-20251001'
const MAX_TOKENS = 200

// Haiku 4.5 single-shot pricing, $/M tokens (mirrors ca-narrate-pass.ts).
const IN_PER_M = 1.0
const OUT_PER_M = 5.0
const CACHE_WRITE_PER_M = 1.25
const CACHE_READ_PER_M = 0.10

const CACHE = path.resolve(process.cwd(), 'outputs/ca-locrecheck-cache.json')
const PROC = path.resolve(process.cwd(), 'outputs/ca-locrecheck-processed.json')
const SNAP = path.resolve(process.cwd(), 'outputs/ca-locrecheck-snapshot.json')

const START = Date.now()
const RUN_BUDGET_SEC = parseInt(process.env.RUN_BUDGET_SEC || '600', 10)
const GATHER_DEADLINE = START + Math.min(25000, RUN_BUDGET_SEC * 1000)
const DEADLINE = START + RUN_BUDGET_SEC * 1000
const MAX_COST_USD = parseFloat(process.env.MAX_COST_USD || '15')
const CONFIDENCE_MIN = parseInt(process.env.LOCRECHECK_CONFIDENCE_MIN || '60', 10)

const DESC_SLICE = 1500

interface CaRow {
  id: string
  title: string | null
  description: string | null
  country: string | null
  country_code: string | null
  state_province: string | null
  city: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  status: string | null
  metadata: any
}

// ── Foreign-signal prefilter token list ─────────────────────────────
// Whole-word, case-insensitive. Country names + demonyms + UK home nations +
// common foreign descriptors / historical exonyms. US states/cities that share
// a name (Paris TX, London OH, Cheshire CT) deliberately pass through — the
// Haiku step is the real decider; this list only narrows what we spend on.
const FOREIGN_TOKENS = [
  // UK & home nations
  'england', 'english', 'scotland', 'scottish', 'scotsman', 'wales', 'welsh',
  'ireland', 'irish', 'britain', 'british', 'briton', 'london', 'liverpool',
  'manchester', 'edinburgh', 'glasgow', 'dublin', 'cornwall', 'yorkshire',
  'uk', 'u.k.', 'united kingdom', 'great britain',
  // Europe
  'france', 'french', 'paris', 'germany', 'german', 'berlin', 'prussia',
  'prussian', 'bavaria', 'italy', 'italian', 'rome', 'naples', 'venice',
  'spain', 'spanish', 'madrid', 'portugal', 'portuguese', 'lisbon',
  'austria', 'austrian', 'vienna', 'hungary', 'hungarian', 'budapest',
  'poland', 'polish', 'warsaw', 'russia', 'russian', 'moscow', 'petersburg',
  'siberia', 'siberian', 'norway', 'norwegian', 'sweden', 'swedish',
  'stockholm', 'denmark', 'danish', 'copenhagen', 'finland', 'finnish',
  'holland', 'netherlands', 'dutch', 'amsterdam', 'belgium', 'belgian',
  'brussels', 'switzerland', 'swiss', 'geneva', 'greece', 'greek', 'athens',
  'turkey', 'turkish', 'constantinople', 'ottoman', 'serbia', 'serbian',
  'bulgaria', 'romania', 'roumania', 'bohemia', 'bohemian', 'iceland',
  // Middle East & near
  'persia', 'persian', 'arabia', 'arabian', 'arab', 'syria', 'syrian',
  'palestine', 'jerusalem', 'mesopotamia', 'babylon',
  // Asia
  'china', 'chinese', 'peking', 'pekin', 'shanghai', 'canton', 'japan',
  'japanese', 'tokyo', 'yokohama', 'india', 'indian', 'calcutta', 'bombay',
  'delhi', 'korea', 'korean', 'siam', 'siamese', 'ceylon', 'burma', 'burmese',
  'tibet', 'tibetan', 'mongolia', 'mongolian', 'manchuria', 'manchurian',
  'afghanistan', 'afghan', 'philippines', 'philippine', 'filipino', 'manila',
  'java', 'sumatra', 'borneo', 'indo-china', 'indochina', 'singapore',
  // Africa
  'africa', 'african', 'egypt', 'egyptian', 'cairo', 'nile', 'morocco',
  'moroccan', 'algeria', 'tunis', 'tripoli', 'abyssinia', 'abyssinian',
  'ethiopia', 'transvaal', 'congo', 'soudan', 'sudan', 'zululand', 'zulu',
  'rhodesia', 'natal',
  // Americas (non-US) & Oceania
  'mexico', 'mexican', 'canada', 'canadian', 'ontario', 'quebec', 'toronto',
  'montreal', 'cuba', 'cuban', 'havana', 'brazil', 'brazilian', 'argentina',
  'argentine', 'peru', 'peruvian', 'chile', 'chilean', 'bolivia', 'venezuela',
  'colombia', 'panama', 'nicaragua', 'guatemala', 'honduras', 'jamaica',
  'haiti', 'australia', 'australian', 'sydney', 'melbourne', 'queensland',
  'new zealand', 'zealand', 'tasmania', 'fiji',
]

// Pre-compile a single whole-word regex (escape dots in 'u.k.' etc.).
function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
const FOREIGN_RE = new RegExp(
  '\\b(?:' + FOREIGN_TOKENS.map(escapeRe).join('|') + ')\\b',
  'i',
)

function isUsTagged(r: CaRow): boolean {
  if (r.country == null) return true
  const c = String(r.country).trim().toLowerCase()
  if (c === 'united states') return true
  if (r.country_code && String(r.country_code).trim().toUpperCase() === 'US') return true
  return false
}

function alreadyRechecked(r: CaRow): boolean {
  return !!(r.metadata && r.metadata.location_rechecked === true)
}

function isCandidate(r: CaRow): boolean {
  if (alreadyRechecked(r)) return false
  if (!isUsTagged(r)) return false
  const text = ((r.title || '') + ' ' + (r.description || ''))
  return FOREIGN_RE.test(text)
}

// ── Haiku prompt ────────────────────────────────────────────────────
const SYSTEM_PROMPT =
  'You are a meticulous historical geographer. Given a short newspaper account, ' +
  'determine WHERE THE EVENT DESCRIBED ACTUALLY HAPPENED — the real-world place ' +
  'the story is set in, NOT where the newspaper that printed it was published. ' +
  'Many of these 1900s American papers reprinted stories set in foreign countries. ' +
  'Reply with STRICT JSON only, no prose, no markdown fences. Schema: ' +
  '{"country":"<full country name, or US, or UNKNOWN>","region":"<state/province/county or empty string>",' +
  '"city":"<city/town or empty string>","confidence":<integer 0-100>}. ' +
  'Rules: if the event clearly takes place in the United States, set country to "US". ' +
  'If you genuinely cannot tell where it happened, set country to "UNKNOWN". ' +
  'Only give high confidence when the text names or strongly implies the location. ' +
  'Use modern country names (e.g. "China", "United Kingdom", "Russia").'

function buildUserPrompt(r: CaRow): string {
  const title = (r.title || '(untitled)').slice(0, 200)
  const body = (r.description || '').slice(0, DESC_SLICE)
  return 'TITLE: ' + title + '\n\nACCOUNT:\n' + body + '\n\nReturn the JSON now.'
}

interface HaikuLoc { country: string; region: string; city: string; confidence: number }

function parseHaiku(rawText: string): HaikuLoc | null {
  try {
    const s = rawText.indexOf('{')
    const e = rawText.lastIndexOf('}')
    if (s < 0 || e <= s) return null
    const obj = JSON.parse(rawText.substring(s, e + 1))
    const country = typeof obj.country === 'string' ? obj.country.trim() : ''
    if (!country) return null
    return {
      country,
      region: typeof obj.region === 'string' ? obj.region.trim() : '',
      city: typeof obj.city === 'string' ? obj.city.trim() : '',
      confidence: Number.isFinite(Number(obj.confidence)) ? Number(obj.confidence) : 0,
    }
  } catch (_e) {
    return null
  }
}

function costFor(usage: any): number {
  const inTok = usage.input_tokens || 0
  const outTok = usage.output_tokens || 0
  const cWrite = usage.cache_creation_input_tokens || 0
  const cRead = usage.cache_read_input_tokens || 0
  return (
    (inTok / 1e6) * IN_PER_M +
    (cWrite / 1e6) * CACHE_WRITE_PER_M +
    (cRead / 1e6) * CACHE_READ_PER_M +
    (outTok / 1e6) * OUT_PER_M
  )
}

// Is the Haiku verdict a confident, actionable NON-US country?
function isNonUsCountry(country: string): boolean {
  const c = country.trim().toLowerCase()
  if (!c) return false
  if (c === 'us' || c === 'usa' || c === 'u.s.' || c === 'u.s.a.' ||
      c === 'united states' || c === 'united states of america' ||
      c === 'america' || c === 'unknown') return false
  return true
}

// ── Gather (cached, resumable) ──────────────────────────────────────
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
      .select('id,title,description,country,country_code,state_province,city,location_name,latitude,longitude,status,metadata')
      .eq('source_type', 'chronicling-america')
      .in('status', ['approved', 'pending_review'])
      .order('created_at', { ascending: true })
      .range(from, from + 999)
    if (r.error) { console.error('[ca-locrecheck] gather error:', r.error.message); break }
    const rows: CaRow[] = r.data || []
    for (const row of rows) if (!have.has(row.id)) { have.add(row.id); cache.rows.push(row) }
    cache.page++
    if (rows.length < 1000) { cache.complete = true; break }
  }
  fs.mkdirSync(path.dirname(CACHE), { recursive: true })
  fs.writeFileSync(CACHE, JSON.stringify(cache))
  if (!cache.complete) {
    console.log('[ca-locrecheck] gather: ' + cache.rows.length + ' so far (incomplete) — re-run to continue.')
    process.exit(0)
  }
  return cache.rows
}

interface SnapEntry {
  id: string
  country: string | null
  country_code: string | null
  state_province: string | null
  city: string | null
  location_name: string | null
  latitude: number | null
  longitude: number | null
  coords_synthetic?: boolean | null
}

async function main() {
  const apply = process.argv.includes('--apply')
  const revert = process.argv.includes('--revert')

  const d = await import('dotenv')
  d.config({ path: path.resolve(process.cwd(), '.env.local') })
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    console.error('[ca-locrecheck] Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Source .env.local first.')
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const supabase = createClient(url, key)

  // ── REVERT ──────────────────────────────────────────────────────────
  if (revert) {
    const snap: { rows: SnapEntry[] } = fs.existsSync(SNAP)
      ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
    console.log('[ca-locrecheck] REVERT ' + snap.rows.length + ' reports to prior location')
    let reverted = 0
    for (const e of snap.rows) {
      // Re-read metadata so we can strip the recheck keys without clobbering
      // anything else added since.
      const cur = await supabase.from('reports').select('metadata').eq('id', e.id).maybeSingle()
      const meta = { ...((cur.data && cur.data.metadata) || {}) }
      delete (meta as any).location_rechecked
      delete (meta as any).location_recheck_prev
      const r = await supabase.from('reports').update({
        country: e.country,
        country_code: e.country_code,
        state_province: e.state_province,
        city: e.city,
        location_name: e.location_name,
        latitude: e.latitude,
        longitude: e.longitude,
        coords_synthetic: e.coords_synthetic ?? false,
        metadata: meta,
      }).eq('id', e.id)
      if (!r.error) reverted++
      else console.warn('[ca-locrecheck] revert error ' + e.id + ': ' + r.error.message)
    }
    console.log('[ca-locrecheck] reverted ' + reverted + ' / ' + snap.rows.length)
    return
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[ca-locrecheck] missing ANTHROPIC_API_KEY — source .env.local')
    process.exit(1)
  }
  const { Anthropic } = await import('@anthropic-ai/sdk')
  const anth = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const geocodeCache = makeSupabaseGeocodeCache(supabase)

  // ── Gather + prefilter ──────────────────────────────────────────────
  const rows = await gather(supabase)
  const candidates = rows.filter(isCandidate)

  console.log('=== CA location recheck (' + (apply ? 'APPLY' : 'DRY RUN') + ') ===')
  console.log('CA rows scanned (approved+pending): ' + rows.length)
  console.log('candidates (US-tagged + foreign signal, not yet rechecked): ' + candidates.length)

  // ── Resumable state ─────────────────────────────────────────────────
  const processed = new Set<string>(fs.existsSync(PROC) ? JSON.parse(fs.readFileSync(PROC, 'utf8')) : [])
  const snap: { rows: SnapEntry[] } = fs.existsSync(SNAP)
    ? JSON.parse(fs.readFileSync(SNAP, 'utf8')) : { rows: [] }
  const snapHave = new Set(snap.rows.map(r => r.id))

  const todo = candidates.filter(c => !processed.has(c.id))
  console.log('candidates remaining this run: ' + todo.length +
    (processed.size ? ' (' + processed.size + ' already processed in prior runs)' : ''))

  let runCost = 0
  let n = 0
  let wouldChange = 0, keptUs = 0, unknownOrLow = 0, errored = 0, applied = 0
  const sample: { id: string; before: string; after: string; conf: number }[] = []

  const flush = () => {
    fs.mkdirSync(path.dirname(PROC), { recursive: true })
    fs.writeFileSync(PROC, JSON.stringify(Array.from(processed)))
    fs.writeFileSync(SNAP, JSON.stringify(snap))
  }

  for (const row of todo) {
    if (Date.now() >= DEADLINE) { console.log('[ca-locrecheck] time-boxed — re-run to continue.'); break }
    if (runCost >= MAX_COST_USD) { console.log('[ca-locrecheck] cost cap ($' + MAX_COST_USD + ') reached — re-run to continue.'); break }
    n++

    // ── Haiku extraction ──────────────────────────────────────────────
    let verdict: HaikuLoc | null = null
    try {
      const msg = await anth.messages.create({
        model: HAIKU,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildUserPrompt(row) }],
      })
      runCost += costFor((msg as any).usage || {})
      const block = msg.content.find((b: any) => b.type === 'text')
      const text = block && (block as any).type === 'text' ? (block as any).text : ''
      verdict = parseHaiku(text)
    } catch (e: any) {
      errored++
      console.warn('[ca-locrecheck] Haiku error ' + row.id + ': ' + (e?.message || String(e)))
      // Do NOT mark processed — let a later run retry this one.
      continue
    }

    if (!verdict) {
      // Unparseable verdict — treat as inconclusive, mark rechecked so we
      // don't re-spend on it. (Conservative: no row change.)
      unknownOrLow++
      processed.add(row.id)
      if (apply) {
        const meta = { ...(row.metadata || {}), location_rechecked: true }
        const r = await supabase.from('reports').update({ metadata: meta }).eq('id', row.id)
        if (r.error) console.warn('[ca-locrecheck] stamp error ' + row.id + ': ' + r.error.message)
      }
      if (n % 25 === 0) flush()
      continue
    }

    const confidentNonUs =
      verdict.confidence >= CONFIDENCE_MIN &&
      isNonUsCountry(verdict.country) &&
      verdict.country.trim().toLowerCase() !== String(row.country || '').trim().toLowerCase()

    if (!confidentNonUs) {
      // US / UNKNOWN / low confidence / same-as-stored → never change the row.
      if (verdict.confidence >= CONFIDENCE_MIN && !isNonUsCountry(verdict.country)) keptUs++
      else unknownOrLow++
      processed.add(row.id)
      if (apply) {
        const meta = { ...(row.metadata || {}), location_rechecked: true }
        const r = await supabase.from('reports').update({ metadata: meta }).eq('id', row.id)
        if (r.error) console.warn('[ca-locrecheck] stamp error ' + row.id + ': ' + r.error.message)
      }
      if (n % 25 === 0) flush()
      continue
    }

    // ── Re-geocode with the AI-determined country (resolve by NAME) ────
    let normalized: any = null
    try {
      const aiCity = verdict.city || null
      const aiRegion = verdict.region || null
      const locName = [aiCity, aiRegion, verdict.country].filter(Boolean).join(', ') || null
      normalized = await normalizeLocation(
        {
          city: aiCity,
          state_province: aiRegion,
          country: verdict.country,
          country_code: null, // resolve by country NAME so we don't re-inherit US
          location_name: locName,
          latitude: null,
          longitude: null,
        },
        { geocoder: 'maptiler', geocodeFn: geocodeWithFallback, cache: geocodeCache },
      )
    } catch (e: any) {
      errored++
      console.warn('[ca-locrecheck] geocode error ' + row.id + ': ' + (e?.message || String(e)))
      // Leave row unchanged but mark rechecked so we don't loop on it.
      processed.add(row.id)
      if (apply) {
        const meta = { ...(row.metadata || {}), location_rechecked: true }
        const r = await supabase.from('reports').update({ metadata: meta }).eq('id', row.id)
        if (r.error) console.warn('[ca-locrecheck] stamp error ' + row.id + ': ' + r.error.message)
      }
      if (n % 25 === 0) flush()
      continue
    }

    // If the normalizer couldn't resolve a usable country, leave row unchanged.
    if (!normalized || !normalized.country) {
      unknownOrLow++
      processed.add(row.id)
      if (apply) {
        const meta = { ...(row.metadata || {}), location_rechecked: true }
        const r = await supabase.from('reports').update({ metadata: meta }).eq('id', row.id)
        if (r.error) console.warn('[ca-locrecheck] stamp error ' + row.id + ': ' + r.error.message)
      }
      if (n % 25 === 0) flush()
      continue
    }

    // Defensive: if normalization somehow folded back to United States, do NOT
    // overwrite — that would be a no-op at best and a corruption at worst.
    if (String(normalized.country).trim().toLowerCase() === 'united states') {
      keptUs++
      processed.add(row.id)
      if (apply) {
        const meta = { ...(row.metadata || {}), location_rechecked: true }
        const r = await supabase.from('reports').update({ metadata: meta }).eq('id', row.id)
        if (r.error) console.warn('[ca-locrecheck] stamp error ' + row.id + ': ' + r.error.message)
      }
      if (n % 25 === 0) flush()
      continue
    }

    // ── This row WILL change. ─────────────────────────────────────────
    wouldChange++
    const before = [row.country, row.state_province, row.city].filter(Boolean).join(' / ') || '(none)'
    const after = [normalized.country, normalized.state_province, normalized.city].filter(Boolean).join(' / ') || '(none)'
    if (sample.length < 15) sample.push({ id: row.id, before, after, conf: verdict.confidence })

    if (apply) {
      if (!snapHave.has(row.id)) {
        snap.rows.push({
          id: row.id,
          country: row.country,
          country_code: row.country_code,
          state_province: row.state_province,
          city: row.city,
          location_name: row.location_name,
          latitude: row.latitude,
          longitude: row.longitude,
          coords_synthetic: (row.metadata && row.metadata.coords_synthetic) ?? null,
        })
        snapHave.add(row.id)
      }
      const meta = {
        ...(row.metadata || {}),
        location_rechecked: true,
        location_recheck_prev: {
          country: row.country,
          state_province: row.state_province,
          city: row.city,
          latitude: row.latitude,
          longitude: row.longitude,
        },
      }
      const r = await supabase.from('reports').update({
        country: normalized.country,
        country_code: normalized.country_code,
        state_province: normalized.state_province,
        city: normalized.city,
        location_name: normalized.location_name,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        coords_synthetic: !!normalized.coords_synthetic,
        metadata: meta,
      }).eq('id', row.id)
      if (!r.error) { applied++; processed.add(row.id) }
      else console.warn('[ca-locrecheck] update error ' + row.id + ': ' + r.error.message)
    } else {
      // Dry run — count as processed-in-memory only (do NOT persist so a real
      // --apply run re-Haikus and writes). Mark in local processed set so the
      // sample/counts don't double-count within this run.
      processed.add(row.id)
    }
    if (n % 25 === 0 && apply) flush()
  }

  if (apply) flush()

  // ── Report ──────────────────────────────────────────────────────────
  console.log('\n--- this run ---')
  console.log('candidates Haiku-checked: ' + n + '  (run cost ~$' + runCost.toFixed(4) + ')')
  console.log('would-change (confident non-US): ' + wouldChange)
  console.log('kept-US (Haiku says US): ' + keptUs)
  console.log('unknown/low-confidence/inconclusive: ' + unknownOrLow)
  console.log('errors (will retry next run): ' + errored)
  if (apply) console.log('rows updated this run: ' + applied + '  (snapshot: ' + SNAP + ', revert with --revert)')

  if (sample.length) {
    console.log('\nsample proposed changes (BEFORE -> AFTER, conf):')
    for (const s of sample) {
      console.log('  ' + s.before + '  ->  ' + s.after + '   [conf ' + s.conf + ']  (' + s.id + ')')
    }
  }

  if (!apply) {
    console.log('\nDRY RUN — no DB writes. Run with --apply to correct (reversible: --revert).')
    if (n >= todo.length) console.log('All current candidates checked. (Re-run --apply to write corrections.)')
    else console.log('Time/cost-boxed — re-run for more, or --apply to write.')
  } else if (n < todo.length) {
    console.log('\nTime/cost-boxed before all candidates processed — re-run --apply to continue.')
  } else {
    console.log('\nAll candidates processed.')
  }
}

main().catch(e => { console.error('[ca-locrecheck] unhandled:', e); process.exit(1) })
