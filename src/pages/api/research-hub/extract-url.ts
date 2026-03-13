/**
 * POST /api/research-hub/extract-url
 *
 * Extracts OpenGraph metadata from a user-pasted URL.
 * Auto-detects source type (YouTube, Reddit, TikTok, etc.)
 * Returns title, description, thumbnail, and detected source type.
 *
 * Features:
 * - Reddit JSON API fallback for reliable image/description extraction
 * - Image proxy: downloads thumbnails and stores in Supabase Storage
 * - Duplicate URL detection
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { createHash } from 'crypto'

var ARTIFACT_IMAGES_BUCKET = 'artifact-images'

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
    var stripParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid', 'ref', 'si']
    stripParams.forEach(function(p) { parsed.searchParams.delete(p) })
    parsed.hostname = parsed.hostname.toLowerCase()
    var normalized = parsed.toString()
    if (normalized.endsWith('/')) normalized = normalized.slice(0, -1)
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
    title: null, description: null, image: null,
    siteName: null, type: null, url: null,
  }

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

  if (!result.title) {
    var titleMatch = /<title[^>]*>([^<]+)<\/title>/i.exec(html)
    if (titleMatch) result.title = titleMatch[1].trim()
  }

  return result
}

// ── YouTube-Specific ──

function extractYouTubeId(url: string): string | null {
  var patterns = [
    /youtube\.com\/watch\?.*v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  ]
  for (var i = 0; i < patterns.length; i++) {
    var m = patterns[i].exec(url)
    if (m) return m[1]
  }
  return null
}

function getYouTubeThumbnail(videoId: string): string {
  return 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg'
}

// ── Reddit JSON API Fallback ──

interface RedditPostData {
  title: string | null
  selftext: string | null
  thumbnail: string | null
  preview_image: string | null
  url_overridden_by_dest: string | null
  is_video: boolean
  media_url: string | null
  subreddit: string | null
}

async function fetchRedditJsonData(url: string): Promise<RedditPostData | null> {
  try {
    // Reddit JSON API: append .json to the URL
    var jsonUrl = url.replace(/\/?$/, '.json')
    var controller = new AbortController()
    var timeoutId = setTimeout(function() { controller.abort() }, 8000)

    var resp = await fetch(jsonUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Paradocs/1.0; +https://discoverparadocs.com)',
        'Accept': 'application/json',
      },
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    if (!resp.ok) return null

    var json = await resp.json()

    // Reddit returns an array: [listing, comments]
    var listing = Array.isArray(json) ? json[0] : json
    var post = listing?.data?.children?.[0]?.data
    if (!post) return null

    // Extract the best image from Reddit's preview system
    var previewImage: string | null = null
    if (post.preview && post.preview.images && post.preview.images.length > 0) {
      var source = post.preview.images[0].source
      if (source && source.url) {
        // Reddit HTML-encodes URLs in preview
        previewImage = source.url.replace(/&amp;/g, '&')
      }
    }

    // Check if the post links directly to an image
    var linkedUrl = post.url_overridden_by_dest || post.url || null
    var isDirectImage = linkedUrl && /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(linkedUrl)

    // For video posts, get the thumbnail
    var mediaUrl: string | null = null
    if (post.is_video && post.media && post.media.reddit_video) {
      mediaUrl = post.media.reddit_video.fallback_url || null
    }

    return {
      title: post.title || null,
      selftext: post.selftext ? post.selftext.slice(0, 500) : null,
      thumbnail: post.thumbnail && post.thumbnail !== 'self' && post.thumbnail !== 'default' && post.thumbnail !== 'nsfw' ? post.thumbnail : null,
      preview_image: previewImage || (isDirectImage ? linkedUrl : null),
      url_overridden_by_dest: linkedUrl,
      is_video: !!post.is_video,
      media_url: mediaUrl,
      subreddit: post.subreddit || null,
    }
  } catch {
    return null
  }
}

// ── Image Proxy: Download and store in Supabase Storage ──

function getExtFromContentType(ct: string): string {
  if (ct.includes('png')) return 'png'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('svg')) return 'svg'
  return 'jpg'
}

async function proxyImageToStorage(
  imageUrl: string,
  urlHash: string,
  supabase: any
): Promise<string | null> {
  try {
    // Don't proxy if already on our Supabase storage
    if (imageUrl.includes('bhkbctdmwnowfmqpksed.supabase.co')) return imageUrl

    var controller = new AbortController()
    var timeoutId = setTimeout(function() { controller.abort() }, 10000)

    var resp = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Paradocs/1.0; +https://discoverparadocs.com)',
        'Accept': 'image/*',
      },
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    if (!resp.ok) return null

    var contentType = resp.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) return null

    var arrayBuffer = await resp.arrayBuffer()
    // Skip if too large (> 5MB) or too small (< 1KB, likely error page)
    if (arrayBuffer.byteLength > 5 * 1024 * 1024 || arrayBuffer.byteLength < 1024) return null

    var buffer = Buffer.from(arrayBuffer)
    var ext = getExtFromContentType(contentType)
    var fileName = 'thumbnails/' + urlHash + '.' + ext

    // Ensure bucket exists
    try {
      var bucketList = await supabase.storage.listBuckets()
      var exists = (bucketList.data || []).some(function(b: any) { return b.name === ARTIFACT_IMAGES_BUCKET })
      if (!exists) {
        await supabase.storage.createBucket(ARTIFACT_IMAGES_BUCKET, { public: true })
      }
    } catch {
      // Bucket might already exist
    }

    var uploadResult = await supabase.storage
      .from(ARTIFACT_IMAGES_BUCKET)
      .upload(fileName, buffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '31536000',
      })

    if (uploadResult.error) {
      console.error('Image proxy upload error:', uploadResult.error.message)
      return null
    }

    var publicUrlResult = supabase.storage
      .from(ARTIFACT_IMAGES_BUCKET)
      .getPublicUrl(fileName)

    return publicUrlResult.data.publicUrl || null
  } catch (err) {
    console.error('Image proxy error:', err)
    return null
  }
}

// ── Reddit Info Helper ──

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

  try {
    new URL(rawUrl)
  } catch {
    return res.status(400).json({ error: 'Invalid URL format' })
  }

  try {
    var normalizedUrl = normalizeUrl(rawUrl)
    var urlHash = hashUrl(normalizedUrl)

    // ── Check for duplicate ──
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
      // Table might not have column yet
    }

    // ── Detect source type ──
    var detected = detectSourceType(normalizedUrl)

    // ── Fetch OG metadata ──
    var metadata: OGMetadata = {
      title: null, description: null, image: null,
      siteName: null, type: null, url: null,
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
      // Fetch failed — continue with empty metadata
    }

    // ── Platform-specific enhancements ──
    var platformMetadata: Record<string, any> = {}

    if (detected.sourceType === 'youtube') {
      var videoId = extractYouTubeId(normalizedUrl)
      if (videoId) {
        platformMetadata.youtube_video_id = videoId
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

      // Reddit JSON API fallback — much more reliable than OG scraping
      var redditData = await fetchRedditJsonData(normalizedUrl)
      if (redditData) {
        // Fill in missing metadata from Reddit JSON
        if (!metadata.title && redditData.title) {
          metadata.title = redditData.title
        }
        if (!metadata.description && redditData.selftext) {
          metadata.description = redditData.selftext
        }
        // Reddit preview images are much better than OG images
        if (redditData.preview_image) {
          metadata.image = redditData.preview_image
        } else if (!metadata.image && redditData.thumbnail) {
          metadata.image = redditData.thumbnail
        }
        // Store additional Reddit metadata
        if (redditData.is_video) {
          platformMetadata.is_video = true
          if (redditData.media_url) {
            platformMetadata.video_url = redditData.media_url
          }
        }
        if (redditData.url_overridden_by_dest) {
          platformMetadata.linked_url = redditData.url_overridden_by_dest
        }
      }
    }

    // ── Proxy image to Supabase Storage ──
    var storedImageUrl: string | null = null
    if (metadata.image) {
      storedImageUrl = await proxyImageToStorage(metadata.image, urlHash, supabase)
    }

    return res.status(200).json({
      url: normalizedUrl,
      url_hash: urlHash,
      source_type: detected.sourceType,
      source_platform: detected.platform,
      title: metadata.title || null,
      description: metadata.description || null,
      thumbnail_url: storedImageUrl || metadata.image || null,
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
