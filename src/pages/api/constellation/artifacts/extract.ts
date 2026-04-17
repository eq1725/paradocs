/**
 * POST /api/constellation/artifacts/extract
 *
 * Given a URL, returns normalized metadata for a user-added external artifact:
 * title, thumbnail, description, source type, and platform-specific oEmbed
 * data where available.
 *
 * Platform routing:
 *   - YouTube / youtu.be → YouTube oEmbed (title, thumbnail, author, embed HTML)
 *   - reddit.com → Reddit oEmbed (title, subreddit inferred from path)
 *   - *.wikipedia.org → Wikipedia REST summary (title, extract, thumbnail)
 *   - everything else → HTML fetch + cheerio OG/Twitter card parse
 *
 * Security posture:
 *   - Auth required (Supabase bearer token)
 *   - Only http/https URLs
 *   - SSRF block: refuses to fetch private / loopback / link-local hosts
 *   - 5s fetch timeout, 2MB response cap
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Allowed source_type values — must match the enum in the DB migration
// (20260311_research_hub_constellation_v2.sql). 'paradocs_report' excluded
// since that source can only be created by saving a Paradocs report, not
// by pasting a URL.
const VALID_SOURCE_TYPES = new Set([
  'youtube', 'reddit', 'tiktok', 'instagram', 'podcast', 'news', 'twitter',
  'archive', 'vimeo', 'rumble', 'substack', 'medium', 'wikipedia',
  'google_docs', 'imgur', 'flickr', 'github', 'facebook', 'twitch',
  'mufon', 'nuforc', 'blackvault', 'coasttocoast', 'website', 'other',
])

export interface ExtractResult {
  url: string
  normalized_url: string
  title: string
  thumbnail_url: string | null
  description: string | null
  source_type: string
  source_platform: string         // Human-readable: "YouTube", "r/UFOs", "Wikipedia", etc.
  oembed_html: string | null      // Raw iframe HTML for embeds (YouTube, Reddit)
  author: string | null
  published_date: string | null
  // Hints the client can use to prefill the save form
  suggested_tags: string[]
  inferred_category: string | null
}

// ── Platform detection ──

function detectPlatform(url: URL): { source_type: string; platform: string } {
  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtu.be') {
    return { source_type: 'youtube', platform: 'YouTube' }
  }
  if (host === 'reddit.com' || host === 'old.reddit.com' || host === 'np.reddit.com') {
    // Extract subreddit for richer platform label
    const match = url.pathname.match(/^\/r\/([^/]+)/i)
    return { source_type: 'reddit', platform: match ? `r/${match[1]}` : 'Reddit' }
  }
  if (host.endsWith('.wikipedia.org')) {
    return { source_type: 'wikipedia', platform: 'Wikipedia' }
  }
  if (host === 'tiktok.com' || host === 'vm.tiktok.com') return { source_type: 'tiktok', platform: 'TikTok' }
  if (host === 'instagram.com') return { source_type: 'instagram', platform: 'Instagram' }
  if (host === 'twitter.com' || host === 'x.com') return { source_type: 'twitter', platform: host === 'x.com' ? 'X' : 'Twitter' }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return { source_type: 'vimeo', platform: 'Vimeo' }
  if (host === 'rumble.com') return { source_type: 'rumble', platform: 'Rumble' }
  if (host === 'twitch.tv' || host.endsWith('.twitch.tv')) return { source_type: 'twitch', platform: 'Twitch' }
  if (host === 'medium.com' || host.endsWith('.medium.com')) return { source_type: 'medium', platform: 'Medium' }
  if (host.endsWith('.substack.com')) return { source_type: 'substack', platform: 'Substack' }
  if (host === 'archive.org' || host === 'web.archive.org') return { source_type: 'archive', platform: 'Internet Archive' }
  if (host === 'docs.google.com') return { source_type: 'google_docs', platform: 'Google Docs' }
  if (host === 'imgur.com' || host === 'i.imgur.com') return { source_type: 'imgur', platform: 'Imgur' }
  if (host === 'flickr.com') return { source_type: 'flickr', platform: 'Flickr' }
  if (host === 'github.com') return { source_type: 'github', platform: 'GitHub' }
  if (host === 'facebook.com' || host === 'fb.com') return { source_type: 'facebook', platform: 'Facebook' }
  if (host === 'mufon.com') return { source_type: 'mufon', platform: 'MUFON' }
  if (host === 'nuforc.org') return { source_type: 'nuforc', platform: 'NUFORC' }
  if (host === 'blackvault.com' || host === 'theblackvault.com') return { source_type: 'blackvault', platform: 'The Black Vault' }
  if (host === 'coasttocoastam.com') return { source_type: 'coasttocoast', platform: 'Coast to Coast AM' }

  // Podcast hosts
  if (
    host === 'podcasts.apple.com' || host === 'open.spotify.com' ||
    host === 'soundcloud.com' || host.endsWith('.libsyn.com') ||
    host === 'podcasts.google.com' || host.endsWith('.anchor.fm')
  ) {
    return { source_type: 'podcast', platform: platformLabelForPodcast(host) }
  }

  // News heuristic: if TLD is .com/.org/.co and path looks like an article
  if (/\/(article|story|news|\d{4}\/\d{2})\//.test(url.pathname)) {
    return { source_type: 'news', platform: humanHost(host) }
  }

  return { source_type: 'website', platform: humanHost(host) }
}

function platformLabelForPodcast(host: string): string {
  if (host.startsWith('podcasts.apple')) return 'Apple Podcasts'
  if (host.startsWith('open.spotify')) return 'Spotify'
  if (host.startsWith('soundcloud')) return 'SoundCloud'
  return 'Podcast'
}

function humanHost(host: string): string {
  // Strip subdomains to get the "brand" — e.g., "bbc.co.uk" stays, "www.nytimes.com" → "nytimes.com"
  return host
}

// ── SSRF protection ──

/**
 * Reject URLs pointing at private / loopback / link-local ranges. This is a
 * first-line defense; Vercel's runtime is already sandboxed, but a paranoid
 * extra check costs nothing and prevents bored-user DoS.
 */
function isSafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  // Literal IP address checks
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [_, a, b] = ipv4.map(Number) as unknown as [string, number, number, number, number]
    // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 0.0.0.0/8
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
  }
  // Obvious symbolic aliases
  if (h === 'localhost' || h === 'ip6-localhost' || h === '::1' || h === '0.0.0.0') return false
  // Supabase internal hostnames — we never want to proxy those
  if (h.includes('supabase.internal')) return false
  return true
}

// ── Fetch helpers ──

async function fetchWithTimeout(url: string, timeoutMs = 5000, maxBytes = 2 * 1024 * 1024): Promise<{ text: string; contentType: string } | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        // Identifies Paradocs on server logs so publishers can whitelist us later.
        'User-Agent': 'ParadocsBot/1.0 (+https://beta.discoverparadocs.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    if (!res.ok) return null

    const contentType = res.headers.get('content-type') || ''
    // Read up to maxBytes. Node fetch returns a ReadableStream.
    const reader = res.body?.getReader()
    if (!reader) {
      const text = await res.text()
      return { text: text.slice(0, maxBytes), contentType }
    }
    const chunks: Uint8Array[] = []
    let total = 0
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      if (value) {
        total += value.byteLength
        if (total > maxBytes) { reader.cancel(); break }
        chunks.push(value)
      }
    }
    const buf = new Uint8Array(total)
    let off = 0
    for (const c of chunks) { buf.set(c, off); off += c.byteLength }
    return { text: new TextDecoder().decode(buf), contentType }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Platform-specific extractors ──

async function extractYouTube(url: string): Promise<Partial<ExtractResult>> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`
  try {
    const res = await fetch(oembedUrl, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) return {}
    const data = await res.json() as {
      title?: string; author_name?: string; thumbnail_url?: string; html?: string
    }
    return {
      title: data.title || 'YouTube video',
      thumbnail_url: data.thumbnail_url || null,
      author: data.author_name || null,
      oembed_html: data.html || null,
    }
  } catch { return {} }
}

async function extractReddit(url: string): Promise<Partial<ExtractResult>> {
  // Reddit blocks most UAs; use oEmbed which is tolerant.
  const oembedUrl = `https://www.reddit.com/oembed?url=${encodeURIComponent(url)}`
  try {
    const res = await fetch(oembedUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ParadocsBot/1.0 (+https://beta.discoverparadocs.com)' },
    })
    if (!res.ok) return {}
    const data = await res.json() as {
      title?: string; author_name?: string; thumbnail_url?: string; html?: string
    }
    return {
      title: data.title || 'Reddit post',
      thumbnail_url: data.thumbnail_url || null,
      author: data.author_name || null,
      oembed_html: data.html || null,
    }
  } catch { return {} }
}

async function extractWikipedia(url: string): Promise<Partial<ExtractResult>> {
  // Parse /wiki/PAGE_TITLE from the URL and hit the REST summary API.
  try {
    const u = new URL(url)
    const match = u.pathname.match(/\/wiki\/(.+)$/)
    if (!match) return {}
    const lang = u.hostname.split('.')[0] || 'en'
    const pageTitle = decodeURIComponent(match[1])
    const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(pageTitle)}`
    const res = await fetch(apiUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { 'User-Agent': 'ParadocsBot/1.0 (+https://beta.discoverparadocs.com)' },
    })
    if (!res.ok) return {}
    const data = await res.json() as {
      title?: string; extract?: string; thumbnail?: { source?: string }; description?: string
    }
    return {
      title: data.title || 'Wikipedia article',
      thumbnail_url: data.thumbnail?.source || null,
      description: data.extract || data.description || null,
    }
  } catch { return {} }
}

function extractOG(html: string, fallbackUrl: string): Partial<ExtractResult> {
  const $ = cheerio.load(html)
  const meta = (selector: string) => $(selector).attr('content')?.trim() || null

  const title =
    meta('meta[property="og:title"]') ||
    meta('meta[name="twitter:title"]') ||
    $('title').first().text().trim() ||
    null

  const description =
    meta('meta[property="og:description"]') ||
    meta('meta[name="twitter:description"]') ||
    meta('meta[name="description"]') ||
    null

  let thumbnail =
    meta('meta[property="og:image:secure_url"]') ||
    meta('meta[property="og:image"]') ||
    meta('meta[name="twitter:image"]') ||
    null

  // Normalize relative image URLs
  if (thumbnail && !/^https?:\/\//.test(thumbnail)) {
    try {
      thumbnail = new URL(thumbnail, fallbackUrl).toString()
    } catch { thumbnail = null }
  }

  const author =
    meta('meta[name="author"]') ||
    meta('meta[property="article:author"]') ||
    null

  const published =
    meta('meta[property="article:published_time"]') ||
    meta('meta[name="pubdate"]') ||
    null

  // Very short truncation so we stay in fair-use "snippet" territory
  const truncated = description ? description.slice(0, 240) : null

  return {
    title: title || 'Untitled link',
    description: truncated,
    thumbnail_url: thumbnail,
    author,
    published_date: published,
  }
}

// ── Tag / category inference from extracted content ──

function suggestTagsFromText(text: string): string[] {
  const lower = text.toLowerCase()
  const keywords = [
    'ufo', 'uap', 'alien', 'abduction', 'bigfoot', 'cryptid', 'mothman',
    'ghost', 'haunting', 'poltergeist', 'nde', 'near-death', 'psychic',
    'telepathy', 'remote viewing', 'meditation', 'astral', 'lucid dream',
    'sleep paralysis', 'deja vu', 'synesthesia', 'vision', 'miracle',
    'occult', 'ritual', 'tarot', 'skinwalker', 'dogman',
  ]
  const hits = new Set<string>()
  for (const kw of keywords) {
    if (lower.includes(kw)) hits.add(kw.replace(/\s+/g, '-'))
  }
  return Array.from(hits).slice(0, 6)
}

// ── Handler ──

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Auth check — users must be logged in to use this endpoint.
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { url } = (req.body || {}) as { url?: string }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http(s) URLs are supported' })
  }
  if (!isSafeHost(parsed.hostname)) {
    return res.status(400).json({ error: 'This URL points to a private or unsupported host' })
  }

  const { source_type, platform } = detectPlatform(parsed)

  // Route to platform-specific extractor where available, fall through to OG scrape.
  let enrichment: Partial<ExtractResult> = {}
  if (source_type === 'youtube') {
    enrichment = await extractYouTube(url)
  } else if (source_type === 'reddit') {
    enrichment = await extractReddit(url)
  } else if (source_type === 'wikipedia') {
    enrichment = await extractWikipedia(url)
  }

  // Always run OG parse as a backup — fills gaps in oEmbed responses.
  const fetched = await fetchWithTimeout(url)
  if (fetched && fetched.contentType.includes('text/html')) {
    const og = extractOG(fetched.text, url)
    // Prefer platform-specific values, fall back to OG
    enrichment = {
      title: enrichment.title || og.title || 'Untitled link',
      description: enrichment.description || og.description || null,
      thumbnail_url: enrichment.thumbnail_url || og.thumbnail_url || null,
      author: enrichment.author || og.author || null,
      published_date: enrichment.published_date || og.published_date || null,
      oembed_html: enrichment.oembed_html || null,
    }
  }

  // Derive tag hints + category inference from title + description
  const textForTags = [enrichment.title, enrichment.description].filter(Boolean).join(' ')
  const suggestedTags = suggestTagsFromText(textForTags)

  // Build the response — callers use this to populate the preview card.
  const result: ExtractResult = {
    url,
    normalized_url: parsed.toString(),
    title: enrichment.title || 'Untitled link',
    thumbnail_url: enrichment.thumbnail_url || null,
    description: enrichment.description || null,
    source_type: VALID_SOURCE_TYPES.has(source_type) ? source_type : 'website',
    source_platform: platform,
    oembed_html: enrichment.oembed_html || null,
    author: enrichment.author || null,
    published_date: enrichment.published_date || null,
    suggested_tags: suggestedTags,
    // Category inference happens client-side (infers from suggested_tags via
    // inferCategoryFromTags) so the client can present an editable picker.
    inferred_category: null,
  }

  return res.status(200).json(result)
}
