#!/usr/bin/env tsx
/**
 * Gallery image filler — V11.17.39.
 *
 * Companion to adopt-phenomena-images.ts. That script picks ONE
 * primary image per phenomenon. This script adds VARIETY: targets
 * phenomena that already have primary_image_url set but image_gallery
 * is empty/sparse, and populates image_gallery with 2-3 additional
 * Haiku-approved candidates.
 *
 * Why we want this: phenomenon cards on the Today feed currently render
 * primary_image_url every time. If a user sees the same phenomenon
 * three days in a row, they see the same image three times. With 3
 * images per phenomenon and a stable-random pick (hash(user, phenom,
 * day)), each user gets a consistent image per phenomenon-per-day but
 * different users see variety AND the same user sees variety across
 * days.
 *
 * Pipeline per phenomenon:
 *   1. Fetch candidates from same sources as adopt-phenomena-images.ts
 *      (Wikipedia pageimage, Wikimedia, OpenVerse, multilang Wiki,
 *      Haiku query-expansion).
 *   2. EXCLUDE the URL that's already primary_image_url.
 *   3. Send 5-8 remaining candidates to Haiku, asking it to identify
 *      the top 2-3 that also depict the phenomenon (not just the SINGLE
 *      best — VARIETY of valid depictions).
 *   4. Download, resize (1200/600/120), upload each approved to
 *      Supabase Storage.
 *   5. Append to phenomena.image_gallery JSONB.
 *
 * Targets phenomena where:
 *   - status = 'active'
 *   - primary_image_url IS NOT NULL
 *   - image_gallery is null/empty/length < TARGET_GALLERY_SIZE
 *
 * Cost: ~$1 in Haiku (162 phenomena × $0.003 per approval call + image
 * downloads). Wall time: ~30-45 min at the 500ms Wikimedia throttle.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/adopt-gallery-images.ts --dry-run
 *   npx tsx scripts/adopt-gallery-images.ts --slug bigfoot --dry-run
 *   npx tsx scripts/adopt-gallery-images.ts                     # all
 *   npx tsx scripts/adopt-gallery-images.ts --limit 20         # cap
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import sharp from 'sharp'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!
const HAIKU_MODEL = 'claude-haiku-4-5-20251001'
const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages'
const WIKIMEDIA_API = 'https://commons.wikimedia.org/w/api.php'
const STORAGE_BUCKET = 'phenomena-images'
const TARGET_GALLERY_SIZE = 3  // total images per phenomenon (primary + gallery)
const REVIEW_THRESHOLD = 55    // Haiku confidence floor for gallery (slightly lower than primary)

const UA = 'ParadocsBot/1.0 (https://www.discoverparadocs.com; williamschaseh@gmail.com)'

// ─── Rate-limited Wikimedia (V11.17.39, same logic as primary script) ─
const WIKIMEDIA_MIN_INTERVAL_MS = 500
let lastWikimediaCallAt = 0
let consecutive429s = 0
let wikimediaPausedUntil = 0

async function rateLimitedWikimediaFetch(url: string, init?: RequestInit, maxRetries = 3): Promise<Response> {
  if (wikimediaPausedUntil > Date.now()) {
    const waitMs = wikimediaPausedUntil - Date.now()
    console.warn('  wikimedia paused — waiting ' + Math.floor(waitMs / 1000) + 's')
    await new Promise(r => setTimeout(r, waitMs))
  }
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const elapsed = Date.now() - lastWikimediaCallAt
    if (elapsed < WIKIMEDIA_MIN_INTERVAL_MS) {
      await new Promise(r => setTimeout(r, WIKIMEDIA_MIN_INTERVAL_MS - elapsed))
    }
    lastWikimediaCallAt = Date.now()
    const resp = await fetch(url, init)
    if (resp.status !== 429) { consecutive429s = 0; return resp }
    consecutive429s++
    const backoffMs = 30000 * Math.pow(2, attempt)
    if (consecutive429s >= 5) {
      wikimediaPausedUntil = Date.now() + 5 * 60 * 1000
      console.warn('  wikimedia 429 streak — pausing 5 min')
      consecutive429s = 0
      return resp
    }
    console.warn('  wikimedia 429 — backing off ' + Math.floor(backoffMs / 1000) + 's')
    await new Promise(r => setTimeout(r, backoffMs))
  }
  return fetch(url, init)
}

// ─── Helpers ──────────────────────────────────────────────────────────
function stripHtml(s: string): string {
  return (s || '').replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim()
}

function wikimediaThumb(url: string, maxPx = 1200): string {
  if (!url) return url
  if (!/^https?:\/\/upload\.wikimedia\.org\//.test(url)) return url
  if (url.includes('/thumb/')) return url.replace(/\/\d+px-([^/?#]+)/, '/' + maxPx + 'px-$1')
  const m = url.match(/^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+\/)([^/]+\/[^/]+)\/([^/?#]+)(.*)$/)
  if (!m) return url
  return m[1] + 'thumb/' + m[2] + '/' + m[3] + '/' + maxPx + 'px-' + m[3] + m[4]
}

interface Candidate {
  title: string
  url: string
  description: string
  license: string
  attribution: string
  source: string
}

async function searchWikimedia(query: string, limit = 5): Promise<Candidate[]> {
  const params = new URLSearchParams({
    action: 'query', list: 'search', srsearch: query, srnamespace: '6',
    srlimit: String(limit), format: 'json', origin: '*',
  })
  let searchRes
  try {
    searchRes = await rateLimitedWikimediaFetch(WIKIMEDIA_API + '?' + params.toString(), { headers: { 'User-Agent': UA } })
  } catch (_e) { return [] }
  if (!searchRes.ok) return []
  const data: any = await searchRes.json()
  const titles = (data.query?.search || []).map((s: any) => s.title)
  if (titles.length === 0) return []
  const infoParams = new URLSearchParams({
    action: 'query', titles: titles.join('|'), prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata|size', format: 'json', origin: '*',
  })
  const infoRes = await rateLimitedWikimediaFetch(WIKIMEDIA_API + '?' + infoParams.toString(), { headers: { 'User-Agent': UA } })
  if (!infoRes.ok) return []
  const infoData: any = await infoRes.json()
  const pages = infoData.query?.pages || {}
  const out: Candidate[] = []
  for (const pageId of Object.keys(pages)) {
    const page = pages[pageId]
    const info = (page.imageinfo || [])[0]
    if (!info?.url) continue
    const mime = (info.mime as string) || ''
    if (!mime.startsWith('image/')) continue
    const meta = info.extmetadata || {}
    const license = (meta.LicenseShortName?.value as string) || 'unknown'
    out.push({
      title: page.title,
      url: wikimediaThumb(info.url, 1200),
      description: stripHtml(meta.ImageDescription?.value || page.title).substring(0, 300),
      license: stripHtml(license),
      attribution: stripHtml((meta.Artist?.value as string) || 'Unknown') + ' (' + stripHtml(license) + ')',
      source: 'wikimedia_commons',
    })
  }
  return out
}

async function searchOpenverse(query: string, limit = 5): Promise<Candidate[]> {
  const params = new URLSearchParams({ q: query, page_size: String(limit), license_type: 'commercial', mature: 'false' })
  try {
    const resp = await fetch('https://api.openverse.engineering/v1/images/?' + params.toString(), { headers: { 'User-Agent': UA } })
    if (!resp.ok) return []
    const data: any = await resp.json()
    return (data.results || []).filter((r: any) => r.url && r.mime_type?.startsWith('image/')).map((r: any) => ({
      title: 'OpenVerse: ' + (r.title || '').substring(0, 100),
      url: wikimediaThumb(r.url, 1200),
      description: stripHtml(r.title || '').substring(0, 300),
      license: r.license || 'unknown',
      attribution: 'Image by ' + (r.creator || 'Unknown') + ' via ' + (r.source || 'OpenVerse'),
      source: 'openverse',
    }))
  } catch (_e) { return [] }
}

// ─── Haiku: pick TOP-N candidates that depict the phenomenon ──────────
async function haikuPickTopN(p: any, candidates: Candidate[], n: number): Promise<{ picks: number[]; reasons: string[] }> {
  if (candidates.length === 0) return { picks: [], reasons: [] }

  // Download + resize each candidate for vision input
  const inlined: { idx: number; mime: string; b64: string }[] = []
  for (let i = 0; i < Math.min(candidates.length, 8); i++) {
    const c = candidates[i]
    try {
      const r = await fetch(c.url, { headers: { 'User-Agent': UA } })
      if (!r.ok) continue
      const mime = r.headers.get('content-type')?.split(';')[0].trim() || ''
      if (!mime.startsWith('image/')) continue
      const ab = await r.arrayBuffer()
      const resized = await sharp(Buffer.from(ab))
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 82 }).toBuffer()
      if (resized.length > 5 * 1024 * 1024) continue
      inlined.push({ idx: i, mime: 'image/jpeg', b64: resized.toString('base64') })
    } catch (_e) { /* skip */ }
  }
  if (inlined.length === 0) return { picks: [], reasons: [] }

  const system = `You review candidate images and pick the TOP ${n} that legitimately depict the phenomenon. Goal: variety + accuracy. Pick images showing different angles, eras, styles, or interpretations of the SAME phenomenon. Reject anything tangentially related, wrong species, generic stock, etc.

OUTPUT FORMAT (strict JSON, single line, no markdown):
{"picks": [<index>, <index>, ...], "confidence": <0-100>, "reasons": ["<one sentence per pick>"]}

If fewer than ${n} candidates are acceptable, return what you can. Empty picks array means none acceptable.`

  type Block = { type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  const content: Block[] = [{
    type: 'text',
    text: 'PHENOMENON: ' + p.name + '\nCATEGORY: ' + p.category +
      (p.ai_summary ? '\nSUMMARY: ' + p.ai_summary.substring(0, 400) : '') +
      '\n\nReview each candidate. Pick the top ' + n + ' that depict this phenomenon.',
  }]
  for (let i = 0; i < inlined.length; i++) {
    content.push({ type: 'text', text: 'Candidate [' + i + ']' })
    content.push({ type: 'image', source: { type: 'base64', media_type: inlined[i].mime, data: inlined[i].b64 } })
  }
  content.push({ type: 'text', text: 'Return JSON with picks array.' })

  try {
    const resp = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: HAIKU_MODEL, max_tokens: 300, temperature: 0.1, system, messages: [{ role: 'user', content }] }),
    })
    if (!resp.ok) return { picks: [], reasons: [] }
    const data: any = await resp.json()
    const text = data?.content?.[0]?.text || ''
    const s = text.indexOf('{')
    const e = text.lastIndexOf('}')
    if (s < 0 || e <= s) return { picks: [], reasons: [] }
    const parsed = JSON.parse(text.substring(s, e + 1))
    if (!Array.isArray(parsed.picks)) return { picks: [], reasons: [] }
    const conf = typeof parsed.confidence === 'number' ? parsed.confidence : 0
    if (conf < REVIEW_THRESHOLD) return { picks: [], reasons: [] }
    const haikuIdxs: number[] = parsed.picks.filter((x: any) => typeof x === 'number')
    // Map Haiku's inlined-array indices back to original candidates indices
    const originalIdxs = haikuIdxs.map(hi => inlined[hi]?.idx).filter(i => typeof i === 'number') as number[]
    const reasons: string[] = Array.isArray(parsed.reasons) ? parsed.reasons.map((x: any) => String(x).substring(0, 200)) : []
    return { picks: originalIdxs, reasons }
  } catch (_e) {
    return { picks: [], reasons: [] }
  }
}

// ─── Storage upload (single size — card thumb is plenty for gallery) ──
async function fetchAndUploadCardSize(supabase: any, slug: string, idx: number, url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA } })
    if (!r.ok) return null
    const ab = await r.arrayBuffer()
    const buf = await sharp(Buffer.from(ab))
      .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85, progressive: true })
      .toBuffer()
    const path = 'gallery/' + slug + '/' + idx + '-' + Date.now() + '.jpg'
    const { error } = await supabase.storage.from(STORAGE_BUCKET).upload(path, buf, {
      contentType: 'image/jpeg', upsert: true,
    })
    if (error) return null
    const pub = supabase.storage.from(STORAGE_BUCKET).getPublicUrl(path)
    return pub?.data?.publicUrl || null
  } catch (_e) { return null }
}

// ─── Main ─────────────────────────────────────────────────────────────
function parseArgs() {
  const a = process.argv.slice(2)
  function flag(n: string, d: string | null = null): string | null { const i = a.indexOf(n); return i < 0 ? d : a[i + 1] }
  function bool(n: string): boolean { return a.indexOf(n) >= 0 }
  return {
    dryRun: bool('--dry-run'),
    slug: flag('--slug'),
    limit: parseInt(flag('--limit', '0') || '0'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Gallery image filler — V11.17.39')
  console.log('Target gallery size:', TARGET_GALLERY_SIZE, '(primary + gallery)')
  console.log('Mode:', args.dryRun ? 'DRY-RUN' : 'APPLY')
  console.log()
  if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY missing'); process.exit(1) }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let q = supabase.from('phenomena')
    .select('id, slug, name, category, aliases, ai_summary, primary_image_url, image_gallery')
    .eq('status', 'active')
    .not('primary_image_url', 'is', null)
  if (args.slug) q = q.eq('slug', args.slug) as any

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows) { console.log('No rows.'); return }

  // Filter to ones needing more gallery
  const candidates = (rows as any[]).filter(r => {
    const gallery = Array.isArray(r.image_gallery) ? r.image_gallery : []
    const galleryCount = gallery.filter((g: any) => g && (typeof g === 'string' ? g : g.url || g.src)).length
    return (1 + galleryCount) < TARGET_GALLERY_SIZE
  })

  const targets = args.limit > 0 ? candidates.slice(0, args.limit) : candidates
  console.log('Phenomena needing gallery variety: ' + candidates.length)
  console.log('Will process: ' + targets.length)
  console.log()

  let filled = 0
  let partial = 0
  let nothing = 0
  let errors = 0
  let imagesAdded = 0

  for (let i = 0; i < targets.length; i++) {
    const p = targets[i]
    const galleryNow = Array.isArray(p.image_gallery) ? p.image_gallery : []
    const need = TARGET_GALLERY_SIZE - 1 - galleryNow.length  // -1 for primary
    process.stdout.write('[' + (i + 1) + '/' + targets.length + '] ' + p.slug.padEnd(40))

    // Gather candidates from multiple sources
    const found: Candidate[] = []
    const seen = new Set<string>([p.primary_image_url])  // exclude existing primary
    function add(arr: Candidate[]) {
      for (const c of arr) if (!seen.has(c.url)) { found.push(c); seen.add(c.url) }
    }
    add(await searchWikimedia(p.name, 5))
    if (found.length < 5) add(await searchOpenverse(p.name, 5))
    if (found.length < 5 && p.aliases?.length) {
      for (const a of (p.aliases as string[]).slice(0, 2)) {
        if (found.length >= 5) break
        add(await searchWikimedia(a, 3))
      }
    }
    if (found.length === 0) {
      console.log(' — no candidates')
      nothing++
      continue
    }

    const { picks, reasons } = await haikuPickTopN(p, found, need)
    if (picks.length === 0) {
      console.log(' — Haiku rejected all (' + found.length + ' candidates)')
      nothing++
      continue
    }

    if (args.dryRun) {
      console.log(' [DRY] would add ' + picks.length + ' images: ' + picks.map(pi => found[pi].title.substring(0, 30)).join(' / '))
      filled++
      imagesAdded += picks.length
      continue
    }

    // Upload each pick
    const galleryAdditions: any[] = []
    for (let pi = 0; pi < picks.length; pi++) {
      const c = found[picks[pi]]
      const uploaded = await fetchAndUploadCardSize(supabase, p.slug, galleryNow.length + pi + 1, c.url)
      if (!uploaded) continue
      galleryAdditions.push({
        url: uploaded,
        source_url: c.url,
        source: c.source,
        license: c.license,
        attribution: c.attribution,
        alt_text: (reasons[pi] || c.title).substring(0, 200),
        added_at: new Date().toISOString(),
      })
      imagesAdded++
    }

    if (galleryAdditions.length === 0) {
      console.log(' — picks failed to upload')
      errors++
      continue
    }

    const newGallery = [...galleryNow, ...galleryAdditions]
    const { error: upErr } = await supabase.from('phenomena').update({ image_gallery: newGallery }).eq('id', p.id)
    if (upErr) {
      console.log(' — DB update failed: ' + upErr.message)
      errors++
      continue
    }

    if (galleryAdditions.length >= need) {
      console.log(' ✓ +' + galleryAdditions.length + ' (full)')
      filled++
    } else {
      console.log(' △ +' + galleryAdditions.length + ' (partial, still need ' + (need - galleryAdditions.length) + ')')
      partial++
    }
  }

  console.log()
  console.log('========== FINAL ==========')
  console.log('Filled (full target):    ' + filled)
  console.log('Partial:                 ' + partial)
  console.log('No images added:         ' + nothing)
  console.log('Errors:                  ' + errors)
  console.log('Total images added:      ' + imagesAdded)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
