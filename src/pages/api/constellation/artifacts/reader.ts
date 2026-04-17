/**
 * POST /api/constellation/artifacts/reader
 *
 * Pocket-style reader view for saved article URLs. Fetches the page HTML,
 * extracts the article body using a Readability-inspired heuristic (scoring
 * candidate containers by text density + tag weight), and returns plain
 * text + a list of inline images suitable for clean in-app display.
 *
 * Auth required. Output is cacheable per-URL for ~10 minutes (we don't
 * persist it — it's recomputed on demand).
 *
 * Limitations intentionally:
 *   - Text-only extraction. Embeds, interactive widgets, video players are
 *     stripped. The source link is always one tap away for readers who want
 *     the full interactive page.
 *   - Heuristic; not perfect. For sites with hostile layouts (paywalls,
 *     cookie walls, JS-only rendering), we return an empty body + a
 *     "could not extract" flag. The caller falls back to the existing
 *     thumbnail + description preview.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface ReaderResult {
  url: string
  title: string | null
  byline: string | null
  publishedDate: string | null
  content: ReaderBlock[]
  excerpt: string | null
  extracted: boolean
  /** Word count — handy for "N min read" computation on the client */
  wordCount: number
}

export type ReaderBlock =
  | { kind: 'heading'; level: 2 | 3; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'image'; src: string; alt: string | null }
  | { kind: 'quote'; text: string }
  | { kind: 'list'; ordered: boolean; items: string[] }

// ── SSRF + fetch helpers ──

function isSafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase()
  const ipv4 = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4) {
    const [_, a, b] = ipv4.map(Number) as unknown as [string, number, number, number, number]
    if (a === 10 || a === 127 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
  }
  if (h === 'localhost' || h === 'ip6-localhost' || h === '::1' || h === '0.0.0.0') return false
  if (h.includes('supabase.internal')) return false
  return true
}

async function fetchHtml(url: string, timeoutMs = 6000, maxBytes = 3 * 1024 * 1024): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'ParadocsBot/1.0 (+https://beta.discoverparadocs.com)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })
    if (!res.ok) return null
    const contentType = res.headers.get('content-type') || ''
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml')) return null

    const reader = res.body?.getReader()
    if (!reader) return (await res.text()).slice(0, maxBytes)

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
    return new TextDecoder().decode(buf)
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// ── Readability-inspired scorer ──
//
// We score each block-level element by its visible-text length, minus a
// penalty for link density (navigation menus have lots of links, few words).
// Heading tags, article tags, and role="main" get a baseline boost.

const POSITIVE_SELECTORS = ['article', '[role="main"]', 'main', '.post', '.article', '.entry-content', '#content', '#main']
const NEGATIVE_SELECTORS = [
  'nav', 'header', 'footer', 'aside', 'form', 'script', 'style', 'noscript',
  '[role="navigation"]', '[role="banner"]', '[role="contentinfo"]',
  '.comments', '.sidebar', '.related', '.share', '.social',
  '.advertisement', '.ads', '.ad', '.promo',
  '.cookie', '.newsletter', '.popup',
]

function extractArticle(html: string, baseUrl: string): ReaderResult | null {
  const $ = cheerio.load(html)

  // Kill known noise up front.
  for (const sel of NEGATIVE_SELECTORS) $(sel).remove()

  // Title / byline / published
  const title =
    $('meta[property="og:title"]').attr('content')?.trim() ||
    $('title').first().text().trim() ||
    $('h1').first().text().trim() ||
    null
  const byline =
    $('meta[name="author"]').attr('content')?.trim() ||
    $('meta[property="article:author"]').attr('content')?.trim() ||
    $('[rel="author"]').first().text().trim() ||
    null
  const publishedDate =
    $('meta[property="article:published_time"]').attr('content')?.trim() ||
    $('meta[name="pubdate"]').attr('content')?.trim() ||
    $('time[datetime]').first().attr('datetime')?.trim() ||
    null

  // Pick the best candidate container.
  let candidate: cheerio.Cheerio<any> | null = null
  let bestScore = 0

  for (const sel of POSITIVE_SELECTORS) {
    $(sel).each((_, el) => {
      const $el = $(el)
      const text = $el.text().trim()
      if (text.length < 200) return
      const linkText = $el.find('a').text().trim().length
      const linkDensity = linkText / Math.max(text.length, 1)
      const score = text.length - Math.round(linkDensity * text.length * 2)
      if (score > bestScore) {
        bestScore = score
        candidate = $el
      }
    })
  }

  // Fallback: score every <div> in the body.
  if (!candidate) {
    $('body div').each((_, el) => {
      const $el = $(el)
      const text = $el.text().trim()
      if (text.length < 300) return
      // Skip if a descendant already scored higher.
      const linkText = $el.find('a').text().trim().length
      const linkDensity = linkText / Math.max(text.length, 1)
      if (linkDensity > 0.5) return
      const paragraphs = $el.find('p').length
      const score = text.length + paragraphs * 50 - Math.round(linkDensity * text.length * 3)
      if (score > bestScore) {
        bestScore = score
        candidate = $el
      }
    })
  }

  if (!candidate) return null
  const body: cheerio.Cheerio<any> = candidate

  const content: ReaderBlock[] = []
  let wordCount = 0

  // Walk candidate's children in document order, converting to blocks.
  body.find('h2, h3, h4, p, blockquote, ul, ol, img, figure').each((_, el) => {
    const $el = $(el)
    const tag = el.tagName?.toLowerCase()

    if (tag === 'h2' || tag === 'h3' || tag === 'h4') {
      const text = $el.text().trim()
      if (!text) return
      content.push({ kind: 'heading', level: tag === 'h2' ? 2 : 3, text })
      wordCount += text.split(/\s+/).length
    } else if (tag === 'p') {
      const text = $el.text().trim()
      if (!text || text.length < 20) return
      content.push({ kind: 'paragraph', text })
      wordCount += text.split(/\s+/).length
    } else if (tag === 'blockquote') {
      const text = $el.text().trim()
      if (!text) return
      content.push({ kind: 'quote', text })
      wordCount += text.split(/\s+/).length
    } else if (tag === 'ul' || tag === 'ol') {
      const items = $el.find('> li').map((__, li) => $(li).text().trim()).get().filter(Boolean)
      if (items.length > 0) {
        content.push({ kind: 'list', ordered: tag === 'ol', items })
        wordCount += items.join(' ').split(/\s+/).length
      }
    } else if (tag === 'img' || tag === 'figure') {
      const $img = tag === 'img' ? $el : $el.find('img').first()
      const raw = $img.attr('src') || $img.attr('data-src') || $img.attr('data-lazy-src')
      if (!raw) return
      let absoluteSrc = raw
      try { absoluteSrc = new URL(raw, baseUrl).toString() } catch { return }
      const alt = $img.attr('alt')?.trim() || null
      content.push({ kind: 'image', src: absoluteSrc, alt })
    }
  })

  // Compact consecutive duplicate paragraphs (some CMSes repeat summary text).
  const dedup: ReaderBlock[] = []
  const seen = new Set<string>()
  for (const b of content) {
    const k = b.kind + ':' + ('text' in b ? b.text : 'items' in b ? b.items.join('|') : b.src)
    if (seen.has(k)) continue
    seen.add(k)
    dedup.push(b)
  }

  // Excerpt: first paragraph, trimmed to 240 chars.
  const firstP = dedup.find(b => b.kind === 'paragraph') as ReaderBlock & { kind: 'paragraph' } | undefined
  const excerpt = firstP ? firstP.text.slice(0, 240) + (firstP.text.length > 240 ? '…' : '') : null

  return {
    url: baseUrl,
    title,
    byline,
    publishedDate,
    content: dedup,
    excerpt,
    extracted: dedup.length > 0,
    wordCount,
  }
}

// ── Handler ──

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { url } = (req.body || {}) as { url?: string }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url required' })
  }
  let parsed: URL
  try { parsed = new URL(url) } catch { return res.status(400).json({ error: 'Invalid URL' }) }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http(s) URLs supported' })
  }
  if (!isSafeHost(parsed.hostname)) {
    return res.status(400).json({ error: 'URL points to a private or unsupported host' })
  }

  const html = await fetchHtml(url)
  if (!html) {
    return res.status(200).json({
      url,
      title: null,
      byline: null,
      publishedDate: null,
      content: [],
      excerpt: null,
      extracted: false,
      wordCount: 0,
    } as ReaderResult)
  }

  const extracted = extractArticle(html, url)
  if (!extracted) {
    return res.status(200).json({
      url,
      title: null,
      byline: null,
      publishedDate: null,
      content: [],
      excerpt: null,
      extracted: false,
      wordCount: 0,
    } as ReaderResult)
  }

  // Client-side caching hint: reader output is stable-ish for a given URL.
  res.setHeader('Cache-Control', 'private, max-age=600, stale-while-revalidate=3600')
  return res.status(200).json(extracted)
}
