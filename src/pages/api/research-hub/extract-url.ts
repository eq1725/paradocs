/**
 * POST /api/research-hub/extract-url
 *
 * Extracts OpenGraph metadata from a user-pasted URL.
 * Auto-detects source type (YouTube, Reddit, TikTok, etc.)
 * Returns title, description, thumbnail, and detected source type.
 *
 * Also checks for duplicate URLs the user has already saved.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { createHash } from 'crypto'

// ── Source Type Detection ──

var URL_PATTERNS: Array<{ pattern: RegExp; sourceType: string; platform: string }> = [
  { pattern: /youtube\.com\/watch|youtu\.be\/|youtube\.com\/shorts/i, sourceType: 'youtube', platform: 'YouTube' },
  { pattern: /reddit\.com\//i, sourceType: 'reddit', platform: 'Reddit' },
  { pattern: /tiktok\.com\//i, sourceType: 'tiktok', platform: 'TikTok' },
  { pattern: /instagram\.com\//i, sourceType: 'instagram', platform: 'Instagram' },
  { pattern: /spotify\.com\/episode|podcasts\.apple\.com|anchor\.fm/i, sourceType: 'podcast', platform: 'Podcast' },
  { pattern: /cnn\.com|bbc\.com|nytimes\.com|reuters\.com|apnews\.com|theguardian\.com|washingtonpost\.com|nbcnews\.com|foxnews\.com|abcnews\.go\.com/i, sourceType: 'news', platform: 'News' },
]

function detectSourceType(url: string): { sourceType: string; platform: string } {
  for (var i = 0; i < URL_PATTERNS.length; i++) {
    if (URL_PATTERNS[i].pattern.test(url)) {
      return { sourceType: URL_PATTERNS[i].sourceType, platform: URL_PATTERNS[i].platform }
    }
  }
  return { sourceType: 'website', platform: 'Website' }
}

// ── URL Normalization ──

function normalizeUrl(rawUrl: string): string {
  try {
    var parsed = new URL(rawUrl)
    // Strip tracking params
    var stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'si']
    stripParams.forEach(function(p) {
      parsed.searchParams.delete(p)
    })
    // Lowercase host
    parsed.hostname = parsed.hostname.toLowerCase()
    // Remove trailing slash
    var normalized = parsed.toString()
    if (normalized.endsWith('/')) {
      normalized = normalized.slice(0, -1)
    }
    return normalized
  } catch {
    return rawUrl.trim().toLowerCase()
  }
}

function hashUrl(url: string): string {
  return createHash('sha256').update(normalizeUrl(url)).digest('hex')
}

// ── OG Metadata Extraction ──

interface OGMetadata {
  title: string | null
  description: string | null
  image: string | null
  siteName: string | null
  type: string | null
  url: string | null
}

function extractMetaTags(html: string): OGMetadata {
  var result: OGMetadata = {
    title: null,
    description: null,
    image: null,
    siteName: null,
    type: null,
    url: null,
  }

  // Extract <meta> tags with property or name attributes
  var metaRegex = /<meta\s+[^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*content\s*=\s*["']([^"']*?)["'][^>]*\/?>/gi
  var metaRegex2 = /<meta\s+[^>]*content\s*=\s*["']([^"']*?)["'][^>]*(?:property|name)\s*=\s*["']([^"']+)["'][^>]*\/?>/gi

  var match
  var tags: Record<string, string> = {}

  while ((match = metaRegex.exec(html)) !== null) {
    tags[match[1].toLowerCase()] = match[2]
  }
  while ((match = metaRegex2.exec(html)) !== null) {
    tags[match[2].toLowerCase()] = match[1]
  }

  result.title = tags['og:title'] || tags['twitter:title'] || null
  result.description = tags['og:description'] || tags['twitter:description'] || tags['description'] || null
  result.image = tags['og:image'] || tags['twitter:image'] || null
  result.siteName = tags['og:site_name'] || null
  result.type = tags['og:type'] || null
  result.url = tags['og:url'] || null

  // Fallback: extract <title> tag if no OG title
  if (!result.title) {
    var titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
    if (titleMatch) {
      result.title = titleMatch[1].trim()
    }
  }

  return result
}

// ── YouTube-Specific Extraction ──

function extractYouTubeId(url: string): string | null {
  var patterns = [
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (var i = 0; i < patterns.length; i++) {
    var match = patterns[i].exec(url)
    if (match) return match[1]
  }
  return null
}

function getYouTubeThumbnail(videoId: string): string {
  return 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'
}

// ── Reddit-Specific Helpers ──

function extractRedditInfo(url: string): { subreddit: string | null } {
  var match = /reddit\.com\/r\/([^/]+)/i.exec(url)
  return { subreddit: match ? match[1] : null }
}

// ── Main Handler ──

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var supabase = createServerClient()

  // Authenticate user
  var token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  var authResult = await supabase.auth.getUser(token)
  if (authResult.error || !authResult.data.user) {
    return res.status(401).json({ error: 'Invalid token' })
  }
  var user = authResult.data.user

  var rawUrl = req.body.url
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'url is required' })
  }

  // Validate URL format
  try {
    new URL(rawUrl)
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' })
  }

  try {
    var normalizedUrl = normalizeUrl(rawUrl)
    var urlHash = hashUrl(normalizedUrl)

    // ── Check for duplicate (user already saved this URL) ──
    var isDuplicate = false
    var duplicateArtifactId: string | null = null
    try {
      var dupCheck = await supabase
        .from('constellation_artifacts')
        .select('id, title')
        .eq('user_id', user.id)
        .eq('external_url_hash', urlHash)
        .limit(1)

      if (dupCheck.data && dupCheck.data.length > 0) {
        isDuplicate = true
        duplicateArtifactId = (dupCheck.data[0] as any).id
      }
    } catch {
      // Table might not have external_url_hash column yet; ignore
    }

    // ── Detect source type ──
    var detected = detectSourceType(normalizedUrl)

    // ── Fetch OG metadata ──
    var metadata: OGMetadata = {
      title: null,
      description: null,
      image: null,
      siteName: null,
      type: null,
      url: null,
    }

    try {
      var controller = new AbortController()
      var timeoutId = setTimeout(function() { controller.abort() }, 8000)

      var fetchResponse = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Paradocs/1.0; +https://discoverparadocs.com)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        redirect: 'follow',
      })

      clearTimeout(timeoutId)

      if (fetchResponse.ok) {
        // Only read first 50KB to avoid memory issues on huge pages
        var reader = fetchResponse.body?.getReader()
        var chunks: Uint8Array[] = []
        var totalBytes = 0
        var maxBytes = 50000

        if (reader) {
          while (totalBytes < maxBytes) {
            var readResult = await reader.read()
            if (readResult.done) break
            chunks.push(readResult.value)
            totalBytes += readResult.value.length
          }
          reader.cancel()
        }

        var decoder = new TextDecoder()
        var html = chunks.map(function(c) { return decoder.decode(c, { stream: true }) }).join('')
        metadata = extractMetaTags(html)
      }
    } catch {
      // Fetch failed (timeout, network error, etc.) — continue with empty metadata
    }

    // ── Platform-specific enhancements ──
    var platformMetadata: Record<string, any> = {}

    if (detected.sourceType === 'youtube') {
      var videoId = extractYouTubeId(normalizedUrl)
      if (videoId) {
        platformMetadata.youtube_video_id = videoId
        // Use YouTube thumbnail if OG image is missing
        if (!metadata.image) {
          metadata.image = getYouTubeThumbnail(videoId)
        }
      }
    }

    if (detected.sourceType === 'reddit') {
      var redditInfo = extractRedditInfo(normalizedUrl)
      if (redditInfo.subreddit) {
        platformMetadata.subreddit = redditInfo.subreddit
      }
    }

    return res.status(200).json({
      url: normalizedUrl,
      url_hash: urlHash,
      source_type: detected.sourceType,
      source_platform: detected.platform,
      title: metadata.title || null,
      description: metadata.description || null,
      thumbnail_url: metadata.image || null,
      site_name: metadata.siteName || null,
      platform_metadata: platformMetadata,
      is_duplicate: isDuplicate,
      duplicate_artifact_id: duplicateArtifactId,
    })
  } catch (error: any) {
    console.error('URL extraction error:', error)
    return res.status(500).json({ error: 'Failed to extract URL metadata' })
  }
}
