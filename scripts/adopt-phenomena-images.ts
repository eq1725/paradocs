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
const MANUAL_URL = arg('--url')
const MANUAL_ATTR = arg('--attribution')
const MANUAL_LICENSE = arg('--license')
const MANUAL_ALT = arg('--alt')
const LIMIT_STR = arg('--limit')
const LIMIT = LIMIT_STR ? parseInt(LIMIT_STR, 10) || 0 : 0

if (!MODE_ALL && !CATEGORY && !SLUG && !MODE_REVIEW) {
  console.error('Specify --all, --category <name>, --slug <slug>, or --re-review')
  process.exit(1)
}
if (MANUAL_URL && !SLUG) {
  console.error('--url requires --slug (manual override is per-phenomenon)')
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
  source: 'wikipedia' | 'wikimedia_commons' | 'openverse' | 'wikipedia_multilang' | 'bing'
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
    // V11.17.39 — KEEP the 1200px thumb URL rather than stripping to the
    // full-resolution original. Wikipedia's full-res files for things
    // like astronomical imagery (Pleiades, Hubble shots) can be 50MB+
    // and trip Claude's 5MB-per-image cap, causing "no candidates
    // downloadable" failures. The 1200px thumb is plenty for our
    // re-encode pipeline (hero=1200, card=600, thumb=120) and matches
    // what `pithumbsize: '1200'` requested above.
    const fullUrl = thumbUrl
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

  // Batch fetch imageinfo for all hits.
  // V11.17.39 — added `mime` to iiprop so we can filter out non-image
  // assets that Wikimedia's File: namespace also includes: PDFs of
  // scanned books, scanned Wikipedia article excerpts, audio files,
  // and videos. Previously these were getting passed to Haiku as
  // "candidates" and Haiku correctly rejected them ("this is a PDF",
  // "this is text"), driving the 95-100% rejection cascade.
  const infoParams = new URLSearchParams({
    action: 'query',
    titles: titles.join('|'),
    prop: 'imageinfo',
    iiprop: 'url|mime|extmetadata|size',
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
    // V11.17.39 — only real raster/vector images. Reject PDFs, audio
    // (ogg/mp3), video (webm/ogv), and the various Wikimedia-internal
    // text formats. SVG is allowed — it renders fine in browsers and
    // many iconic phenomenon images on Commons are SVG (sigils, runes,
    // ritual diagrams).
    const mime = (info.mime as string) || ''
    if (!mime.startsWith('image/')) continue
    const meta = info.extmetadata || {}
    const license =
      (meta.LicenseShortName?.value as string) ||
      (meta.License?.value as string) ||
      'unknown'
    const author = (meta.Artist?.value as string) || 'Unknown'
    const description = (meta.ImageDescription?.value as string) || page.title
    // V11.17.39 — wrap URL in wikimediaThumb to cap at 1200px. Without
    // this, Wikimedia returns the FULL-resolution original (often 8000+
    // pixels wide for panoramic images), which trips Claude's 8000px
    // dimension limit at vision-input time.
    candidates.push({
      title: page.title,
      url: wikimediaThumb(info.url, 1200),
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

// V11.17.39 — Wikimedia thumbnail rewrite.
//
// Wikimedia hosts original-resolution images that frequently exceed
// Claude's 8000-pixel-per-side limit (panoramic Wikipedia images can
// be 16,000+ px wide). Their CDN serves a thumb at ANY requested width
// by inserting `/thumb/<path>/<W>px-<filename>` between the bucket
// and the file. This helper transforms an original URL into a 1200px
// thumb URL.
//
// Original: https://upload.wikimedia.org/wikipedia/commons/a/b/Foo.jpg
// Thumb:    https://upload.wikimedia.org/wikipedia/commons/thumb/a/b/Foo.jpg/1200px-Foo.jpg
//
// Non-wikimedia URLs pass through unchanged.
function wikimediaThumb(url: string, maxPx = 1200): string {
  if (!url) return url
  // Only rewrite upload.wikimedia.org URLs.
  if (!/^https?:\/\/upload\.wikimedia\.org\//.test(url)) return url
  // If already a thumb, swap the size component.
  const existingThumb = url.match(/\/thumb\/([\s\S]+?)\/(\d+)px-([^/?#]+)/)
  if (existingThumb) {
    return url.replace(/\/\d+px-([^/?#]+)/, '/' + maxPx + 'px-$1')
  }
  // Transform original to thumb: insert /thumb/ + append /<size>px-<filename>
  // URL shape: https://upload.wikimedia.org/wikipedia/<project>/<a>/<bc>/<filename>
  const m = url.match(/^(https?:\/\/upload\.wikimedia\.org\/wikipedia\/[^/]+\/)([^/]+\/[^/]+)\/([^/?#]+)(.*)$/)
  if (!m) return url
  const base = m[1]            // https://upload.wikimedia.org/wikipedia/commons/
  const hash = m[2]            // a/bc
  const file = m[3]            // Foo.jpg
  const suffix = m[4]          // ?query or empty
  return base + 'thumb/' + hash + '/' + file + '/' + maxPx + 'px-' + file + suffix
}

// ─── OpenVerse search (V11.17.39, layer 2) ────────────────────────────
//
// OpenVerse aggregates CC-licensed images from Wikimedia Commons,
// Smithsonian Open Access, Flickr Commons, the Met Museum, Cleveland
// Museum of Art, and other rights-clear archives. Free API, no auth
// required for low-rate use. Catches niche phenomena where Wikimedia's
// own corpus came up empty — particularly museum-archived material
// for religious/mythological/historical subjects.
//
// API docs: https://api.openverse.engineering/v1/
async function searchOpenverse(query: string, limit = 5): Promise<Candidate[]> {
  const OPENVERSE_API = 'https://api.openverse.engineering/v1/images/'
  const params = new URLSearchParams({
    q: query,
    page_size: String(limit),
    license_type: 'commercial',  // includes cc0, pdm, by, by-sa
    mature: 'false',
  })
  let resp
  try {
    resp = await fetch(OPENVERSE_API + '?' + params.toString(), {
      headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
    })
  } catch (e: any) {
    console.warn('  openverse network error: ' + (e?.message || e))
    return []
  }
  if (!resp.ok) {
    if (resp.status !== 429) console.warn('  openverse ' + resp.status)
    return []
  }
  const data: any = await resp.json()
  const results: any[] = data.results || []
  return results.filter(r => r.url && r.mime_type?.startsWith('image/')).map(r => ({
    title: 'OpenVerse: ' + (r.title || r.id || '').substring(0, 100),
    // V11.17.39 — wikimediaThumb() is a no-op for non-Wikimedia URLs
    // (most OpenVerse results), but cleanly caps Wikimedia-backed ones.
    url: wikimediaThumb(r.url, 1200),
    description: stripHtml(r.title || '').substring(0, 300),
    license: r.license + (r.license_version ? ' ' + r.license_version : ''),
    attribution: 'Image by ' + (r.creator || 'Unknown') + ' via ' + (r.source || 'OpenVerse') + ' (' + r.license + ')',
    source: 'openverse',
  }))
}

// ─── Multi-language Wikipedia (V11.17.39, layer 3) ────────────────────
//
// Many regional phenomena have Wikipedia articles in their native
// language with iconic lead images that English Wikipedia doesn't
// include. E.g. Cheonyeo Gwishin has a detailed article on Korean
// Wikipedia with a movie-poster lead image; Inkanyamba has the Zulu
// Wikipedia article with a folk-art rendering; Bruja has the Spanish
// Wikipedia article with traditional iconography.
//
// We pass the phenomenon's aliases through to fetchWikipediaPageImage
// against each of the major language Wikipedias.
async function searchMultilangWikipedia(p: Phenomenon, extraQueries: string[] = []): Promise<Candidate[]> {
  const LANG_WIKIS = ['es', 'pt', 'fr', 'de', 'it', 'ja', 'ko', 'zh', 'ar', 'ru', 'hi', 'tr', 'nl', 'sv']
  const candidates: Candidate[] = []
  // Build candidate queries: phenomenon name + first 3 aliases + extra
  // queries (typically Haiku-translated native-script forms).
  const queries = [p.name, ...(p.aliases || []).slice(0, 3), ...extraQueries]
  for (const lang of LANG_WIKIS) {
    if (candidates.length >= 5) break
    for (const q of queries) {
      if (candidates.length >= 5) break
      try {
        const api = 'https://' + lang + '.wikipedia.org/w/api.php'
        const params = new URLSearchParams({
          action: 'query',
          titles: q,
          prop: 'pageimages',
          pithumbsize: '1200',
          format: 'json',
          origin: '*',
          redirects: '1',
        })
        const resp = await fetch(api + '?' + params.toString(), {
          headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
        })
        if (!resp.ok) continue
        const data: any = await resp.json()
        const pages = data?.query?.pages || {}
        for (const pageId of Object.keys(pages)) {
          const page = pages[pageId]
          if (page.missing !== undefined || !page.thumbnail?.source) continue
          // V11.17.39 — keep 1200px thumb, don't strip to full-res.
          // See fetchWikipediaPageImage for the same fix + rationale.
          const fullUrl = page.thumbnail.source as string
          const wpUrl = 'https://' + lang + '.wikipedia.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'))
          candidates.push({
            title: 'Wikipedia [' + lang + ']: ' + page.title,
            url: fullUrl,
            description: page.title,
            license: 'See Wikimedia source',
            attribution: 'Image from <a href="' + wpUrl + '" rel="noopener" target="_blank">Wikipedia (' + lang + ') — ' + page.title + '</a>',
            source: 'wikipedia_multilang',
          })
          break  // one hit per query per language
        }
      } catch (_e) { /* try next */ }
    }
  }
  return candidates
}

// ─── Haiku translation pass (V11.17.39, helper for multilang) ─────────
//
// For regional folklore where the romanized name doesn't match the
// native-script Wikipedia article (e.g., "Cheonyeo Gwishin" needs
// to query as "처녀귀신"; "Inkanyamba" needs the Zulu/Xhosa form;
// "Bruja" benefits from "bruja" alone in Spanish Wikipedia), we ask
// Haiku for native-script translations. Then those forms get fed
// back into the multi-language Wikipedia search.
//
// Triggers only when the prior layers returned < 3 candidates AND
// the phenomenon name looks non-Latin-script-derived (i.e., it's
// likely a romanization of something).
async function getTranslatedAliases(p: Phenomenon): Promise<string[]> {
  if (!ANTHROPIC_API_KEY) return []
  // V11.17.39 — generalized from a narrow translation-only pass to
  // full query EXPANSION. The Paradocs phenomenon slugs are often
  // compound editorial labels ("Metallic Disc UFO") that don't match
  // how images are titled on Wikimedia/Commons/OpenVerse. We need
  // broader, more search-friendly query terms.
  //
  // For each phenomenon, Haiku returns up to 6 alternative queries
  // spanning: native-script translation (when applicable), broader
  // synonym ("Metallic Disc UFO" → "flying saucer"), iconic-case
  // names ("Kenneth Arnold sighting"), associated visual descriptors
  // ("orange orb in sky"), and named sub-types.
  const system = `You generate IMAGE-SEARCH-FRIENDLY query terms for a paranormal/anomalous phenomenon. The phenomenon slug + name is typically a compound editorial label that doesn't match how images are titled on Wikimedia Commons, OpenVerse, or regional Wikipedia. Your job is to suggest 3-6 alternative search queries that would yield iconic / representative images.

Cover these query types as relevant:
  - Native-script forms (e.g. "Cheonyeo Gwishin" → "처녀귀신")
  - Broader common synonym (e.g. "Metallic Disc UFO" → "flying saucer")
  - Iconic case name (e.g. "Disc UFO" → "Kenneth Arnold sighting")
  - Visual descriptor (e.g. "Orange Orb" → "ufo orange light at night")
  - Related Wikipedia article topic (e.g. "Cylindrical UFO" → "cigar shaped UFO")
  - Native language word (e.g. "Banshee" → "bean sí")

Examples:
  "Metallic Disc UFO" (ufos_aliens) → ["flying saucer","UFO disc","Kenneth Arnold sighting","metallic UFO photograph","saucer-shaped craft"]
  "Cylindrical UFO" (ufos_aliens) → ["cigar shaped UFO","cylindrical flying object","UFO over Aurora","tubular UFO"]
  "Cheonyeo Gwishin" (ghosts_hauntings) → ["처녀귀신","Korean virgin ghost","sotgaks","Korean horror"]
  "Inkanyamba" (cryptids) → ["Inkanyamba","Howick Falls monster","KwaZulu serpent","Mlondi"]
  "Pleiadian" (ufos_aliens) → ["Pleiades star cluster","Pleiadian contactee","Semjase","Billy Meier photograph"]
  "Bruja Work" (esoteric_practices) → ["brujería","Spanish witch","curandera","limpia ritual","Latin American witchcraft"]
  "Lichtenberg Figure" (perception_sensory) → ["Lichtenberg figure","fractal burn","lightning skin pattern"]

Return ONLY a JSON array of strings, no markdown. UP TO 6 entries. Each entry should be a query you'd actually type into Google Images or Wikimedia search.`

  try {
    const resp = await fetch(ANTHROPIC_MESSAGES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY as string,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: HAIKU_MODEL,
        max_tokens: 120,
        system,
        messages: [{
          role: 'user',
          content: 'PHENOMENON: ' + p.name +
            (p.aliases?.length ? ' (aliases: ' + p.aliases.slice(0, 3).join(', ') + ')' : '') +
            '\nCATEGORY: ' + p.category +
            (p.ai_summary ? '\nSUMMARY: ' + p.ai_summary.substring(0, 300) : ''),
        }],
      }),
    })
    if (!resp.ok) return []
    const data = await resp.json()
    const text = data?.content?.[0]?.text || ''
    const start = text.indexOf('[')
    const end = text.lastIndexOf(']')
    if (start < 0 || end <= start) return []
    const arr = JSON.parse(text.substring(start, end + 1))
    if (!Array.isArray(arr)) return []
    return arr.filter((x: any) => typeof x === 'string' && x.length > 0 && x.length < 80).slice(0, 4)
  } catch (_e) {
    return []
  }
}

// ─── Google Custom Search API (V11.17.39, layer 5 — opt-in) ───────────
//
// Replaces Bing Image Search which Microsoft retired in 2025. Google's
// Programmable Search Engine + Custom Search JSON API has an explicit
// "rights" filter for CC-licensed images, so we stay rights-safe.
//
// Free tier: 100 queries/day, $5/1000 after. For 544 phenomena × 1
// query each, free tier handles it across 6 days OR ~$3 to do in one
// shot.
//
// Setup:
//   1. https://programmablesearchengine.google.com/ → "Add" a new
//      search engine; enable "Search the entire web" + image search.
//      Copy the Search Engine ID (looks like "017576662512468239146:...").
//   2. https://console.cloud.google.com/apis/library/customsearch.googleapis.com
//      → Enable. Then https://console.cloud.google.com/apis/credentials
//      → Create API key.
//   3. Add to .env.local:
//        GOOGLE_CSE_API_KEY=<api_key>
//        GOOGLE_CSE_ENGINE_ID=<search_engine_id>
//   4. Re-run the script.
//
// Without these env vars, the function returns [] and gracefully skips.
async function searchGoogleCSE(query: string, limit = 5): Promise<Candidate[]> {
  const apiKey = process.env.GOOGLE_CSE_API_KEY
  const engineId = process.env.GOOGLE_CSE_ENGINE_ID
  if (!apiKey || !engineId) return []

  const params = new URLSearchParams({
    key: apiKey,
    cx: engineId,
    q: query,
    searchType: 'image',
    num: String(Math.min(limit, 10)),
    // Rights filter — only CC-licensed images. Comma-separated list
    // of license codes Google supports.
    rights: 'cc_publicdomain,cc_attribute,cc_sharealike,cc_noncommercial',
    safe: 'high',
    imgType: 'photo',
  })
  let resp
  try {
    resp = await fetch('https://www.googleapis.com/customsearch/v1?' + params.toString(), {
      headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
    })
  } catch (e: any) {
    console.warn('  google-cse network error: ' + (e?.message || e))
    return []
  }
  if (!resp.ok) {
    console.warn('  google-cse ' + resp.status)
    return []
  }
  const data: any = await resp.json()
  const results: any[] = data.items || []
  return results.filter(r => r.link && r.mime?.startsWith('image/')).map(r => ({
    title: 'Google CSE: ' + (r.title || '').substring(0, 100),
    url: r.link,
    description: stripHtml(r.snippet || r.title || '').substring(0, 300),
    license: 'CC-licensed (Google rights-filtered)',
    attribution: 'Image from <a href="' + r.image?.contextLink + '" rel="noopener" target="_blank">' + (r.displayLink || 'web') + '</a>',
    source: 'bing',  // reuse the bing tag for storage purposes; logical "external commercial search"
  }))
}

// ─── Bing Image Search (V11.17.39, layer 5 fallback — opt-in) ─────────
//
// Bing's commercial image search API has dramatically wider coverage
// than Wikimedia for modern + niche subjects (UFO photographs, BFRO
// Bigfoot images, MUFON case file imagery, regional cryptid sketches).
// Free Azure tier covers 1000 transactions/month — plenty for our
// one-time backfill.
//
// Requires BING_IMAGE_SEARCH_KEY env var. Skipped silently if missing,
// so the script gracefully runs with whatever sources are configured.
//
// Setup: portal.azure.com → Create resource → "Bing Search v7" → F1
// (free) tier → Copy KEY 1 from "Keys and Endpoint" → add to .env.local.
async function searchBingImages(query: string, limit = 5): Promise<Candidate[]> {
  const apiKey = process.env.BING_IMAGE_SEARCH_KEY
  if (!apiKey) return []  // graceful skip when not configured

  const BING_API = 'https://api.bing.microsoft.com/v7.0/images/search'
  const params = new URLSearchParams({
    q: query,
    count: String(limit),
    license: 'Public,Share,ShareCommercially,Modify,ModifyCommercially',  // CC-licensed only
    safeSearch: 'Strict',
  })
  let resp
  try {
    resp = await fetch(BING_API + '?' + params.toString(), {
      headers: {
        'Ocp-Apim-Subscription-Key': apiKey,
        'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)',
      },
    })
  } catch (e: any) {
    console.warn('  bing network error: ' + (e?.message || e))
    return []
  }
  if (!resp.ok) {
    console.warn('  bing ' + resp.status)
    return []
  }
  const data: any = await resp.json()
  const results: any[] = data.value || []
  return results.filter(r => r.contentUrl && (r.encodingFormat === 'jpeg' || r.encodingFormat === 'png' || r.encodingFormat === 'webp')).map(r => ({
    title: 'Bing: ' + (r.name || '').substring(0, 100),
    url: r.contentUrl,
    description: stripHtml(r.name || '').substring(0, 300),
    license: 'CC-licensed (Bing-filtered)',
    attribution: 'Image from <a href="' + r.hostPageUrl + '" rel="noopener" target="_blank">' + (r.hostPageDisplayUrl || 'web') + '</a>',
    source: 'bing',
  }))
}

// ─── Haiku confirmation ───────────────────────────────────────────────
//
// Given a phenomenon + a set of Wikimedia candidates, ask Haiku which
// (if any) plausibly depicts the phenomenon. Returns the chosen index
// + confidence + alt-text + reason. Confidence < REVIEW_THRESHOLD →
// reject all candidates (better no image than wrong image).

interface HaikuPick {
  pickIndex: number | null  // null = reject all. Index into the ORIGINAL
                            // candidates array, not the SVG-filtered one
                            // — caller does the remap.
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
  // V11.17.39 — switch from TEXT-ONLY candidate descriptions to actual
  // VISION input. The previous version sent Haiku titles + license +
  // 200-char descriptions, which is why even good Wikimedia images got
  // rejected ("I can't tell what this depicts from text alone").
  //
  // Now we build a multimodal message: one text introduction, then
  // alternating "Candidate [i]:" labels + image_url content blocks
  // pointing at the Wikimedia URL. Anthropic fetches the image directly
  // — we don't proxy bytes, which keeps this fast.
  //
  // SVG images can't go through the image content block (Claude doesn't
  // render SVG). Filter them to text-only for this round; they're rare
  // enough on Commons that we don't lose much.
  const visionCandidates = candidates.filter(c => {
    const lower = (c.url || '').toLowerCase()
    return !lower.endsWith('.svg') && !lower.endsWith('.svgz')
  })

  const system = [
    'You are reviewing candidate images for the Paradocs paranormal encyclopedia.',
    '',
    'TASK: Look at each numbered candidate image and decide which (if any) actually',
    'DEPICTS the given phenomenon — not a tangentially-related concept, not a generic',
    'placeholder, not the wrong species, not an unrelated artifact.',
    '',
    'QUALITY BAR: an acceptable image is one a reader would recognize as belonging',
    'to that phenomenon\'s established discourse. For cryptids, recognizable iconography',
    '(e.g., Patterson-Gimlin frame for Bigfoot, Bartlett sketch for Dover Demon). For UFO',
    'cases, an actual photograph or witness sketch. For psychological / abstract concepts,',
    'an established symbolic or scientific illustration (e.g., brain diagram for memory',
    'phenomena, period engraving for historical concepts).',
    '',
    'REJECT (return null) if: the image is tangentially related, a generic stock photo,',
    'unrelated to the phenomenon, OR if you are uncertain whether it depicts the phenomenon.',
    'Better to return null than to pick a wrong image.',
    '',
    'OUTPUT FORMAT (strict JSON, single line, no markdown fences):',
    '{"pick": <index|null>, "confidence": <0-100>, "alt": "<descriptive alt-text>", "reason": "<one sentence>"}',
  ].join('\n')

  if (visionCandidates.length === 0) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'all candidates were SVG/unsupported' }
  }

  // V11.17.39 — download images ourselves with proper Wikimedia User-Agent,
  // then base64-encode for the Haiku request. The previous url-source
  // version failed because Anthropic's image fetcher hits Wikimedia
  // without the User-Agent header Wikipedia infrastructure requires
  // (Wikipedia blocks default UAs returning "Unable to download the file").
  // Base64 sidesteps that: Anthropic never touches Wikimedia.
  //
  // Bandwidth cost: ~150-800KB per image × 5 candidates = ~1-4MB per
  // phenomenon. Across 789 phenomena that's ~1-3GB of one-time download.
  // Anthropic charges by tokens, not bytes, and image-token cost is the
  // same as URL-source mode, so no per-call cost change. We do pay our
  // own egress on the laptop downloading from Wikimedia.
  type ContentBlock =
    | { type: 'text'; text: string }
    | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  const content: ContentBlock[] = [{
    type: 'text',
    text: [
      'PHENOMENON: ' + p.name + (p.aliases?.length ? ' (aka: ' + p.aliases.slice(0, 4).join(', ') + ')' : ''),
      'CATEGORY: ' + p.category,
      p.ai_summary ? 'SUMMARY: ' + p.ai_summary.substring(0, 400) : '',
      '',
      'Examine each candidate image below and pick the one that best depicts the phenomenon.',
    ].filter(Boolean).join('\n'),
  }]

  // Download each image once, base64 encode, attach as inline image block.
  // Hard fail-tolerant: any image that 404s, 403s, exceeds 5MB, or has
  // unexpected MIME just gets skipped (rest still get evaluated).
  const inlinedIndices: number[] = []  // tracks which visionCandidates we actually included
  for (let i = 0; i < visionCandidates.length; i++) {
    const c = visionCandidates[i]
    try {
      const r = await fetch(c.url, {
        headers: { 'User-Agent': 'Paradocs-ImageAdopt/1.0 (https://www.discoverparadocs.com)' },
      })
      if (!r.ok) continue
      // Accept image/* only; skip anything else (Wikimedia occasionally
      // hands back PDFs that slipped past the search-side MIME filter).
      const mime = r.headers.get('content-type')?.split(';')[0].trim() || ''
      if (!mime.startsWith('image/')) continue
      // Anthropic supports jpeg, png, gif, webp. Skip exotic formats.
      const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
      if (!supported.includes(mime)) continue
      const ab = await r.arrayBuffer()

      // V11.17.39 — defense-in-depth: always re-encode candidates through
      // sharp before sending to Claude. Caps dimensions at 1200px AND
      // produces a clean JPEG. Belt-and-braces against:
      //   - Wikimedia thumb URLs that returned the wrong dimensions
      //   - OpenVerse / Google CSE / Bing images > 8000px per side
      //   - Files that say "image/jpeg" but are actually corrupt
      //   - Multi-megabyte files that bloat the request body
      // sharp is already imported and used downstream for the final
      // adoption; running it here doubles as a corruption filter.
      let resizedBuffer: Buffer
      try {
        resizedBuffer = await sharp(Buffer.from(ab))
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toBuffer()
      } catch (_e) {
        continue  // unreadable image (corrupt, animated GIF that sharp can't handle, etc.)
      }
      if (resizedBuffer.length > 5 * 1024 * 1024) continue  // hard ceiling

      const b64 = resizedBuffer.toString('base64')
      content.push({ type: 'text', text: 'Candidate [' + inlinedIndices.length + '] — title: "' + c.title.substring(0, 120) + '"' })
      content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })
      inlinedIndices.push(i)
    } catch (_e) {
      // Skip this candidate, continue to next.
    }
  }
  content.push({
    type: 'text',
    text: 'Return JSON with your pick (or null) + descriptive alt-text for the chosen image.',
  })

  if (inlinedIndices.length === 0) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'no candidates downloadable' }
  }

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
        messages: [{ role: 'user', content }],
      }),
    })
  } catch (e: any) {
    return { pickIndex: null, confidence: 0, altText: '', reason: 'haiku network error: ' + (e?.message || e) }
  }
  if (!resp.ok) {
    // V11.17.39 — surface the actual error body so we can debug 400s.
    // Previously this silently returned "haiku 400" with no detail,
    // making it impossible to tell whether the API rejected our request
    // shape, the model, or the URL-source image format.
    let body = ''
    try { body = (await resp.text()).substring(0, 1500) } catch (_e) {}
    return { pickIndex: null, confidence: 0, altText: '', reason: 'haiku ' + resp.status + ': ' + body }
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
  // V11.17.39 — Haiku's `pick` is an index into the inlined images
  // (which is a subset of visionCandidates, which is a subset of the
  // original candidates). Three-step remap to find the original index:
  //   haiku.pick → inlinedIndices[pick] → visionCandidates[that].url →
  //   candidates.findIndex(c.url === url)
  const haikuIdx = typeof parsed.pick === 'number' ? parsed.pick : null
  let originalIdx: number | null = null
  if (haikuIdx !== null && haikuIdx >= 0 && haikuIdx < inlinedIndices.length) {
    const visionIdx = inlinedIndices[haikuIdx]
    const pickedUrl = visionCandidates[visionIdx].url
    originalIdx = candidates.findIndex(c => c.url === pickedUrl)
    if (originalIdx < 0) originalIdx = null
  }
  return {
    pickIndex: originalIdx,
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
  // V11.16.2 — Manual URL override path. When the user knows the right
  // image for a fringe phenomenon (e.g., a trail-cam still hosted
  // somewhere specific), they can pass --url and skip the Wikipedia /
  // Commons search entirely. Haiku is NOT consulted on manual picks —
  // the user has already verified the image is correct.
  if (MANUAL_URL) {
    const manualCandidate: Candidate = {
      title: 'Manual: ' + (MANUAL_ATTR || p.name),
      url: MANUAL_URL,
      description: MANUAL_ALT || p.name,
      license: MANUAL_LICENSE || 'fair_use_educational',
      attribution: MANUAL_ATTR || ('Manually curated image for ' + p.name),
      source: 'wikimedia_commons', // not literally true but we don't track 'manual' as a source enum yet
    }
    if (MODE_DRY) return { status: 'dry_run', picked: manualCandidate, haiku: { pickIndex: 0, confidence: 100, altText: MANUAL_ALT || p.name, reason: 'manual override' } }
    const buf = await fetchImageBuffer(MANUAL_URL)
    if (!buf) return { status: 'fetch_failed', picked: manualCandidate }
    const heroUrl = await encodeAndUpload(sb, p.slug, buf)
    if (!heroUrl) return { status: 'upload_failed', picked: manualCandidate }
    const updateRes = await sb.from('phenomena').update({
      primary_image_url: heroUrl,
      image_source: 'manual',
      image_license: MANUAL_LICENSE || 'fair_use_educational',
      image_attribution: MANUAL_ATTR || ('Manually curated image for ' + p.name),
      image_alt_text: MANUAL_ALT || (p.name + ' — image'),
      image_adopted_at: new Date().toISOString(),
      image_review_score: 100, // user-verified
    }).eq('id', p.id)
    if (updateRes.error) {
      console.warn('  db update error: ' + updateRes.error.message)
      return { status: 'upload_failed', picked: manualCandidate }
    }
    return { status: 'adopted', picked: manualCandidate, haiku: { pickIndex: 0, confidence: 100, altText: MANUAL_ALT || p.name, reason: 'manual override' } }
  }

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
  // V11.17.39 — multi-source candidate gathering with progressive
  // fallback. Sources are tried in order; each adds its results to the
  // pooled candidate list (dedupped by URL). Haiku then picks the best
  // across all sources. Order matters for quality bias — Wikipedia
  // pageimages are highest-signal, OpenVerse museum hits are second,
  // multi-language Wikipedia catches regional folklore, Bing covers
  // modern/niche subjects when configured.
  const candidates: Candidate[] = []
  const seen = new Set<string>()
  function addCandidates(arr: Candidate[]): void {
    for (const c of arr) {
      if (!seen.has(c.url)) {
        candidates.push(c)
        seen.add(c.url)
      }
    }
  }

  // Layer 1: English Wikipedia pageimage (highest signal — editor-curated)
  const wpHit = await searchWikipediaForPhenomenon(p)
  if (wpHit) addCandidates([wpHit])

  // Layer 2: Wikimedia Commons keyword search
  addCandidates(await searchWikimedia(p.name, 5))

  // Layer 3: OpenVerse — aggregates Smithsonian, Met, Cleveland, Flickr Commons
  if (candidates.length < 5) addCandidates(await searchOpenverse(p.name, 5))

  // Layer 4: Multi-language Wikipedia — only when prior layers thin.
  // Regional folklore (Cheonyeo Gwishin, Bruja, Inkanyamba) often has
  // detailed articles in the native-language Wikipedia.
  if (candidates.length < 3) addCandidates(await searchMultilangWikipedia(p))

  // Layer 4.5: Query EXPANSION pass — runs when prior layers still
  // returned thin. Asks Haiku for 3-6 alternative search queries:
  // native-script translations ("Cheonyeo Gwishin" → "처녀귀신"),
  // common synonyms ("Metallic Disc UFO" → "flying saucer"),
  // iconic case names ("Disc UFO" → "Kenneth Arnold sighting"),
  // visual descriptors. Re-runs each prior source with each expanded
  // query. This is the layer that rescues compound editorial slugs
  // ("Metallic Disc UFO" — no image is titled that, but "flying saucer"
  // + "Kenneth Arnold" yield rich hits).
  if (candidates.length < 5) {
    const expandedQueries = await getTranslatedAliases(p)
    if (expandedQueries.length > 0) {
      for (const q of expandedQueries) {
        if (candidates.length >= 8) break
        // English Wikipedia article pageimage — the broader synonym
        // may match an article that the original slug name didn't.
        const wpEnHit = await fetchWikipediaPageImage(q)
        if (wpEnHit) addCandidates([wpEnHit])
        if (candidates.length >= 8) break
        // Wikimedia Commons keyword search with the expanded query
        addCandidates(await searchWikimedia(q, 3))
        if (candidates.length >= 8) break
        // OpenVerse with the expanded query — sometimes catches
        // native-script museum collection entries.
        addCandidates(await searchOpenverse(q, 3))
      }
      // Multi-lang Wikipedia also gets the expanded queries since some
      // are native-script translations.
      if (candidates.length < 5) {
        addCandidates(await searchMultilangWikipedia(p, expandedQueries))
      }
    }
  }

  // Layer 5: Google Custom Search (rights-filtered) — replaces Bing.
  // Requires GOOGLE_CSE_API_KEY + GOOGLE_CSE_ENGINE_ID env vars. Modern
  // + niche subjects, only CC-licensed results.
  if (candidates.length < 3) addCandidates(await searchGoogleCSE(p.name, 5))

  // Layer 6: Bing fallback — kept for backward compat in case someone
  // still has a grandfathered Bing Search resource. Most users now use
  // Google CSE (Layer 5) instead since Bing Search API was retired 2025.
  if (candidates.length < 3) addCandidates(await searchBingImages(p.name, 5))

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
    // or low-confidence V11.16 adoption). Excludes images already
    // adopted by V11.16 with a clean confidence score (>= REVIEW_THRESHOLD).
    q = q.not('primary_image_url', 'is', null)
      .or('image_adopted_at.is.null,image_review_score.lt.' + REVIEW_THRESHOLD)
  } else if (!SLUG) {
    // Default adoption mode: only phenomena with NO image at all.
    // Phenomena with legacy hotlinked images stay as-is until the
    // explicit --re-review pass replaces them.
    q = q.is('primary_image_url', null)
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
          process.stdout.write('✗ rejected (' + result.haiku?.confidence + '%) — ' + (result.haiku?.reason || '').substring(0, 500) + '\n')
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
