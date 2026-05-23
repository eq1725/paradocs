#!/usr/bin/env tsx
/**
 * V11.16 — Phenomena image adoption pipeline.
 *
 * Sources candidate images for each phenomenon from Wikimedia Commons,
 * has Haiku batch-confirm which (if any) actually depicts the
 * phenomenon, downloads + re-encodes the winner at three sizes
 * (hero/card/thumb), uploads to the `phenomena-images` Supabase
 * Storage bucket, and writes provenance + license + alt-text metadata
 * back to the `phenomena` row.
 *
 * Drain-safe: only writes to `phenomena` (image_* columns +
 * primary_image_url). Does NOT touch reports / report_phenomena.
 *
 * Modes:
 *   --all                 Process every phenomenon without a Storage-
 *                          adopted image (primary_image_url IS NULL or
 *                          image_adopted_at IS NULL).
 *   --category <name>     Restrict to one category.
 *   --re-review           Re-confirm phenomena that already have an
 *                          image_adopted_at — flag mismatches (Haiku
 *                          score < REVIEW_THRESHOLD). Useful for the
 *                          one-time cleanup of legacy hotlinked images.
 *   --slug <slug>         Process a single phenomenon by slug.
 *   --dry-run             Show what would be adopted; no DB / Storage
 *                          writes.
 *   --limit <n>           Cap total phenomena processed in this run.
 *
 * Cost: Haiku confirmation runs ~$0.0005 per candidate. With 5
 * candidates per phenomenon × 957 missing = ~$2.40 in confirmation
 * cost. Storage cost is negligible (~430MB / $0.009 / mo).
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   tsx scripts/adopt-phenomena-images.ts --slug fresno-nightcrawler --dry-run
 *   tsx scripts/adopt-phenomena-images.ts --category cryptids
 *   tsx scripts/adopt-phenomena-images.ts --all
 *   tsx scripts/adopt-phenomena-images.ts --re-review --category cryptids
 */

import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY
if (!ANTHROPIC_API_KEY) {
  console.error('ANTHROPIC_API_KEY missing from env')
  process.exit(1)
}

const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php'
const WIKIPEDIA_API = 'https://en.wikipedia.org/w/api.php'
const STORAGE_BUCKET = 'phenomena-images'
const REVIEW_THRESHOLD = 60  // <60 Haiku confidence triggers rejection / replacement

// Sharp encoding targets — generated in three sizes per adopted image.
const SIZES = [
  { name: 'hero', width: 1200, height: 1200, fit: 'cover' as const },
  { name: 'card', width: 600, height: 450, fit: 'cover' as const },
  { name: 'thumb', width: 120, height: 90, fit: 'cover' as const },
]

const argv = process.argv
function flag(name: string): boolean { return argv.indexOf(name) >= 0 }
function arg(name: string): string | null {
  const i = argv.indexOf(name)
  if (i >= 0 && i + 1 < argv.length) return argv[i + 1]
  return null
}

const MODE_ALL = flag('--all')
const MODE_REVIEW = flag('--re-review')
const MODE_DRY = flag('--dry-run')
const CATEGORY = arg('--category')
const SLUG = arg('--slug')
const LIMIT_STR = arg('--limit')
const LIMIT = LIMIT_STR ? parseInt(LIMIT_STR, 10) || 0 : 0

if (!MODE_ALL && !CATEGORY && !SLUG && !MODE_REVIEW) {
  console.error('Specify --all, --category <name>, --slug <slug>, or --re-review')
  process.exit(1)
}

interface Phenomenon {
  id: string
  slug: string
  name: string
  category: string
  aliases: string[] | null
  ai_summary: string | null
  primary_image_url: string | null
  image_adopted_at: string | null
  image_review_score: number | null
}

interface Candidate {
  title: string         // Page or file title
  url: string           // Direct image URL
  description: string   // From imageinfo / Wikipedia intro
  license: string       // CC0 / CC BY / CC BY-SA / public domain / unknown
  attribution: string   // Author + license HTML string
  source: 'wikipedia' | 'wikimedia_commons'
}

// ─── Wikipedia article pageimage (primary source) ─────────────────────
//
// Most well-documented phenomena have a Wikipedia article with an
// editorially-chosen lead image. That image is much higher signal than
// the noise we'd get from a Commons keyword search — it's already been
// vetted by Wikipedia editors as "the image of this subject."
//
// We try the exact phenomenon name first, then aliases one at a time.

async function fetchWikipediaPageImage(title: string): Promise<Candidate | null> {
  const params = new URLSearchParams({
    action: 'query',
    titles: title,
    prop: 'pageimages|info|extracts',
    pithumbsize: '1200',
    exintro: '1',
    explaintext: '1',
    inprop: 'url',
    format: 'json',
    origin: '*',
    redirects: '1',
  })
  let resp
  try {
    resp = await fetch(WIKIPEDIA_API + '?' + params.toString(), {
      headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
    })
  } catch (e: any) { return null }
  if (!resp.ok) return null
  const data = await resp.json()
  const pages = data?.query?.pages || {}
  for (const pageId of Object.keys(pages)) {
    const page = pages[pageId]
    // Negative pageId means article doesn't exist
    if (page.missing !== undefined || !page.thumbnail) continue
    const thumbUrl: string = page.thumbnail.source
    if (!thumbUrl) continue
    // We want the full-res image, not the 1200px thumb. Strip the
    // /thumb/ + /<size>px suffix to get the original.
    const fullUrl = thumbUrl
      .replace('/thumb/', '/')
      .replace(/\/\d+px-[^/]+$/, '')
    const intro = (page.extract || '').substring(0, 300)
    const wpArticleUrl = page.fullurl || ('https://en.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_')))
    return {
      title: 'Wikipedia: ' + page.title,
      url: fullUrl,
      description: intro || page.title,
      license: 'See Wikimedia source',
      attribution: 'Image from <a href="' + wpArticleUrl + '" rel="noopener" target="_blank">Wikipedia — ' + page.title + '</a>',
      source: 'wikipedia',
    }
  }
  return null
}

async function searchWikipediaForPhenomenon(p: Phenomenon): Promise<Candidate | null> {
  // Try the exact name first.
  const exactHit = await fetchWikipediaPageImage(p.name)
  if (exactHit) return exactHit
  // Then aliases (up to 3 to bound API calls).
  for (const alias of (p.aliases || []).slice(0, 3)) {
    const hit = await fetchWikipediaPageImage(alias)
    if (hit) return hit
  }
  return null
}

// ─── Wikimedia Commons search (fallback) ──────────────────────────────

async function searchWikimedia(query: string, limit = 5): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: 'query',
    list: 'search',
    srsearch: query,
    srnamespace: '6', // File: namespace
    srlimit: String(limit),
    format: 'json',
    origin: '*',
  })
  let searchRes
  try {
    searchRes = await fetch(WIKIMEDIA_API + '?' + params.toString(), {
      headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
    })
  } catch (e: any) {
    console.warn('  wikimedia search network error: ' + (e?.message || e))
    return []
  }
  if (!searchRes.ok) {
    console.warn('  wikimedia search ' + searchRes.status)
    return []
  }
  const data = await searchRes.json()
  const titles = (data.query?.search || []).map((s: any) => s.title) as string[]
  if (titles.length === 0) return []

  // Batch fetch imageinfo for all hits
  const infoParams = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|extmetadata|size',
    format: 'json',
    origin: '*',
  })
  const infoRes = await fetch(WIKIMEDIA_API + '?' + infoParams.toString(), {
    headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
  })
  if (!infoRes.ok) return []
  const infoData = await infoRes.json()
  const pages = infoData.query?.pages || {}
  const candidates: Candidate[] = []
  for (const pageId of Object.keys(pages)) {
    const page = pages[pageId]
    const info = (page.imageinfo || [])[0]
    if (!info?.url) continue
    const meta = info.extmetadata || {}
    const license =
      (meta.LicenseShortName?.value as string) ||
      (meta.License?.value as string) ||
      'unknown'
    const author = (meta.Artist?.value as string) || 'Unknown'
    const description = (meta.ImageDescription?.value as string) || page.title
    candidates.push({
      title: page.title,
      url: info.url,
      description: stripHtml(description).substring(0, 300),
      license: stripHtml(license),
      attribution: stripHtml(author) + ' (' + stripHtml(license) + ')',
      source: 'wikimedia_commons',
    })
  }
  return candidates
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
}

// ─── Haiku confirmation ───────────────────────────────────────────────
//
// Given a phenomenon + a set of Wikimedia candidates, ask Haiku which
// (if any) plausibly depicts the phenomenon. Returns the chosen index
// + confidence + alt-text + reason. Confidence < REVIEW_THRESHOLD →
// reject all candidates (better no image than wrong image).

interface HaikuPick {
  pickIndex: number | null  // null = reject all
  confidence: number        // 0-100
  altText: string
  reason: string
}

async function haikuPickCandidate(
  p: Phenomenon,
  candidates: Candidate[],
): Promise<HaikuPick> {
  if (candidates.length === 0) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'no candidates' }
  }
  const candidateLines = candidates.map((c, i) => {
    return [
      '[' + i + ']',
      'Title: ' + c.title,
      'Description: ' + c.description.substring(0, 200),
      'License: ' + c.license,
    ].join('\n')
  }).join('\n\n')

  const system = [
    'You are reviewing candidate images for the Paradocs paranormal encyclopedia.',
    '',
    'TASK: For the given phenomenon, decide which (if any) of the candidate images',
    'actually depicts that specific phenomenon — not a tangentially-related concept,',
    'not a generic placeholder, not the wrong species, not an unrelated artifact.',
    '',
    'QUALITY BAR: an acceptable image is one a reader would recognize as belonging',
    'to that phenomenon\'s established discourse. For cryptids, that means the',
    'recognizable iconography (e.g., Patterson-Gimlin frame for Bigfoot, Bartlett',
    'sketch for Dover Demon). For UFO cases, an actual photograph or witness sketch.',
    'For psychological / abstract concepts, an established symbolic or scientific',
    'illustration (e.g., brain scan for memory phenomena, period engraving for',
    'historical concepts).',
    '',
    'REJECT if: the image is tangentially related (e.g., a beetle for a cryptid,',
    'a generic stock photo, an unrelated historical event, or any image where you',
    'are unsure whether it depicts the phenomenon).',
    '',
    'Better to return null (no pick) than to pick a wrong image.',
    '',
    'OUTPUT FORMAT (strict JSON, single line):',
    '{"pick": <index|null>, "confidence": <0-100>, "alt": "<descriptive alt-text>", "reason": "<one sentence>"}',
  ].join('\n')

  const userText = [
    'PHENOMENON: ' + p.name + (p.aliases?.length ? ' (aka: ' + p.aliases.slice(0, 4).join(', ') + ')' : ''),
    'CATEGORY: ' + p.category,
    p.ai_summary ? 'SUMMARY: ' + p.ai_summary.substring(0, 400) : '',
    '',
    'CANDIDATE IMAGES:',
    candidateLines,
    '',
    'Return JSON with your pick (or null) and a descriptive alt-text for the chosen image.',
  ].filter(Boolean).join('\n')

  let resp
  try {
    resp = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 250,
        temperature: 0.1,
        system,
        messages: [{ role: 'user', content: userText }],
      }),
    })
  } catch (e: any) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'haiku network error: ' + (e?.message || e) }
  }
  if (!resp.ok) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'haiku ' + resp.status }
  }
  const data = await resp.json()
  const text = data?.content?.[0]?.text || ''
  let parsed: any = null
  try {
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s >= 0 && e > s) parsed = JSON.parse(text.substring(s, e + 1))
  } catch (_e) { /* parse failure */ }
  if (!parsed) return { pickIndex: null, confidence: 0, altText: '', reason: 'haiku parse failure' }
  const idx = typeof parsed.pick === 'number' ? parsed.pick : null
  return {
    pickIndex: idx,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0,
    altText: typeof parsed.alt === 'string' ? parsed.alt : '',
    reason: typeof parsed.reason === 'string' ? parsed.reason : '',
  }
}

// ─── Image download + encode + upload ─────────────────────────────────

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
    })
    if (!resp.ok) {
      console.warn('  image fetch ' + resp.status + ' for ' + url)
      return null
    }
    const ab = await resp.arrayBuffer()
    return Buffer.from(ab)
  } catch (e: any) {
    console.warn('  image fetch error: ' + (e?.message || e))
    return null
  }
}

async function encodeAndUpload(
  sb: any,
  slug: string,
  buffer: Buffer,
): Promise<string | null> {
  // Encode each size; upload to Storage. Return the public URL of the
  // hero size (used as the primary_image_url).
  let heroUrl: string | null = null
  for (const size of SIZES) {
    let encoded: Buffer
    try {
      encoded = await sharp(buffer)
        .resize(size.width, size.height, { fit: size.fit, position: 'attention' })
        .toFormat('webp', { quality: 82 })
        .toBuffer()
    } catch (e: any) {
      console.warn('  encode error for ' + size.name + ': ' + (e?.message || e))
      return null
    }
    const objectPath = size.name + '/' + slug + '.webp'
    const { error: upErr } = await sb.storage
      .from(STORAGE_BUCKET)
      .upload(objectPath, encoded, {
        contentType: 'image/webp',
        upsert: true,
        cacheControl: '604800',
      })
    if (upErr) {
      console.warn('  upload error for ' + objectPath + ': ' + upErr.message)
      return null
    }
    if (size.name === 'hero') {
      const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(objectPath)
      heroUrl = data?.publicUrl || null
    }
  }
  return heroUrl
}

// ─── Per-phenomenon processing ────────────────────────────────────────

interface ProcessResult {
  status: 'adopted' | 'rejected_low_confidence' | 'no_candidates' | 'fetch_failed' | 'upload_failed' | 'dry_run'
  picked?: Candidate
  haiku?: HaikuPick
}

async function processPhenomenon(sb: any, p: Phenomenon): Promise<ProcessResult> {
  // Source priority:
  //   1. Wikipedia article pageimage — editorially curated, usually
  //      the iconic image of the phenomenon. Highest signal.
  //   2. Wikimedia Commons keyword search on the exact name — fuzzy,
  //      requires Haiku gating to avoid false positives like the
  //      rove-beetle-for-cryptid bug in the legacy pipeline.
  //
  // Aliases are tried in source #1 (Wikipedia) but NOT OR'd into the
  // Commons search (would pull in unrelated noise — the old behavior
  // that caused 5-candidate-result-rejected for Fresno Nightcrawler).
  const candidates: Candidate[] = []
  const wpHit = await searchWikipediaForPhenomenon(p)
  if (wpHit) candidates.push(wpHit)
  if (candidates.length === 0) {
    const commonsHits = await searchWikimedia(p.name, 5)
    candidates.push(...commonsHits)
  }
  if (candidates.length === 0) {
    return { status: 'no_candidates' }
  }
  const haiku = await haikuPickCandidate(p, candidates)
  if (haiku.pickIndex === null || haiku.confidence < REVIEW_THRESHOLD) {
    return { status: 'rejected_low_confidence', haiku }
  }
  const picked = candidates[haiku.pickIndex]
  if (!picked) return { status: 'rejected_low_confidence', haiku }

  if (MODE_DRY) {
    return { status: 'dry_run', picked, haiku }
  }

  const buffer = await fetchImageBuffer(picked.url)
  if (!buffer) return { status: 'fetch_failed', picked, haiku }

  const heroUrl = await encodeAndUpload(sb, p.slug, buffer)
  if (!heroUrl) return { status: 'upload_failed', picked, haiku }

  // Write metadata back to phenomena row.
  // The `image_attribution` field is already an HTML-safe string from
  // the source-specific extraction (Wikipedia returns a link tag,
  // Commons returns author + license text).
  const updateRes = await sb.from('phenomena').update({
    primary_image_url: heroUrl,
    image_source: picked.source,
    image_license: classifyLicense(picked.license),
    image_attribution: picked.attribution,
    image_alt_text: haiku.altText || (p.name + ' — image'),
    image_adopted_at: new Date().toISOString(),
    image_review_score: haiku.confidence,
  }).eq('id', p.id)
  if (updateRes.error) {
    console.warn('  db update error: ' + updateRes.error.message)
    return { status: 'upload_failed', picked, haiku }
  }
  return { status: 'adopted', picked, haiku }
}

function classifyLicense(rawLicense: string): string {
  const l = rawLicense.toLowerCase()
  if (l.indexOf('cc0') !== -1 || l.indexOf('public domain') !== -1) return 'cc0'
  if (l.indexOf('cc by-sa') !== -1) return 'cc_by_sa'
  if (l.indexOf('cc by') !== -1) return 'cc_by'
  if (l.indexOf('fair use') !== -1) return 'fair_use_educational'
  return 'unknown'
}

// ─── MAIN ─────────────────────────────────────────────────────────────

async function fetchAllRows<T = any>(query: any, pageSize = 1000): Promise<T[]> {
  const all: T[] = []
  let offset = 0
  while (true) {
    const res = await query.range(offset, offset + pageSize - 1)
    if (res.error) throw new Error(res.error.message)
    const rows = res.data || []
    all.push(...(rows as any))
    if (rows.length < pageSize) break
    offset += pageSize
    if (offset > 50000) break
  }
  return all
}

async function main() {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  console.log('=== V11.16 — Phenomena image adoption ===')
  console.log('Mode: ' +
    (MODE_REVIEW ? 're-review' :
      SLUG ? 'single (' + SLUG + ')' :
      CATEGORY ? 'category (' + CATEGORY + ')' :
      'all'))
  console.log('Dry run: ' + MODE_DRY)
  if (LIMIT > 0) console.log('Limit: ' + LIMIT)

  let q = sb.from('phenomena')
    .select('id, slug, name, category, aliases, ai_summary, primary_image_url, image_adopted_at, image_review_score')
    .eq('status', 'active')
  if (SLUG) q = q.eq('slug', SLUG)
  if (CATEGORY) q = q.eq('category', CATEGORY)
  if (MODE_REVIEW) {
    // Re-review: phenomena that have an existing image (legacy hotlink
    // or low-confidence adoption) and haven't been adopted yet by the
    // V11.16 pipeline (or were adopted but scored low).
    q = q.not('primary_image_url', 'is', null)
  } else if (!SLUG) {
    // Adoption: phenomena without an image OR without a Storage adoption.
    q = q.is('image_adopted_at', null)
  }

  const phenomena = await fetchAllRows<Phenomenon>(q)
  console.log('Phenomena to process: ' + phenomena.length)
  const toProcess = LIMIT > 0 ? phenomena.slice(0, LIMIT) : phenomena
  if (toProcess.length === 0) {
    console.log('Nothing to do.')
    return
  }

  const stats = {
    adopted: 0,
    rejected: 0,
    no_candidates: 0,
    fetch_failed: 0,
    upload_failed: 0,
    dry_run: 0,
  }

  const t0 = Date.now()
  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i]
    process.stdout.write('[' + (i + 1) + '/' + toProcess.length + '] ' + p.slug.padEnd(28) + ' ')
    try {
      const result = await processPhenomenon(sb, p)
      switch (result.status) {
        case 'adopted':
          stats.adopted++
          process.stdout.write('✓ adopted (' + result.haiku?.confidence + '%) — ' + (result.picked?.title || '').substring(0, 50) + '\n')
          break
        case 'rejected_low_confidence':
          stats.rejected++
          process.stdout.write('✗ rejected (' + result.haiku?.confidence + '%) — ' + (result.haiku?.reason || '').substring(0, 50) + '\n')
          break
        case 'no_candidates':
          stats.no_candidates++
          process.stdout.write('— no candidates\n')
          break
        case 'fetch_failed':
          stats.fetch_failed++
          process.stdout.write('! fetch failed — ' + (result.picked?.url || '') + '\n')
          break
        case 'upload_failed':
          stats.upload_failed++
          process.stdout.write('! upload failed\n')
          break
        case 'dry_run':
          stats.dry_run++
          process.stdout.write('[dry] would adopt (' + result.haiku?.confidence + '%) — ' + (result.picked?.title || '').substring(0, 50) + '\n')
          break
      }
    } catch (e: any) {
      stats.rejected++
      process.stdout.write('! exception: ' + (e?.message || e).substring(0, 60) + '\n')
    }

    // Polite pause to avoid hammering Wikimedia + Anthropic.
    await new Promise(r => setTimeout(r, 300))
  }

  const el = Math.round((Date.now() - t0) / 1000)
  console.log('\n══════════════════════════════════════════════════════════')
  console.log('Done in ' + el + 's')
  console.log('  Adopted:        ' + stats.adopted)
  console.log('  Rejected (low confidence): ' + stats.rejected)
  console.log('  No candidates:  ' + stats.no_candidates)
  console.log('  Fetch failed:   ' + stats.fetch_failed)
  console.log('  Upload failed:  ' + stats.upload_failed)
  if (MODE_DRY) console.log('  Dry-run would-adopt: ' + stats.dry_run)
}

main().catch(e => { console.error('Fatal:', e?.message || e); process.exit(1) })
