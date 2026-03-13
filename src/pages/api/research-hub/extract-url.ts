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
  _raw_debug?: string
}

async function fetchRedditJsonData(url: string): Promise<RedditPostData | null> {
  try {
    var cleanUrl = url.replace(/\/?$/, '')
    // Extract the path for api.reddit.com (which returns JSON natively — no .json suffix)
    var redditPath = ''
    try {
      var parsedUrl = new URL(cleanUrl)
      redditPath = parsedUrl.pathname
    } catch {
      redditPath = cleanUrl.replace(/https?:\/\/[^/]+/, '')
    }
    if (redditPath.endsWith('/')) {
      redditPath = redditPath.slice(0, -1)
    }

    // Try endpoints that return FULL data first (images, preview, etc.)
    // api.reddit.com returns stripped-down data (title only, no images), so use as last resort
    var endpoints = [
      { url: 'https://www.reddit.com' + redditPath + '.json', label: 'www' },
      { url: 'https://old.reddit.com' + redditPath + '.json', label: 'old' },
      { url: 'https://api.reddit.com' + redditPath, label: 'api' },
    ]

    var rawText = ''
    var successEndpoint = ''

    for (var ei = 0; ei < endpoints.length; ei++) {
      var ep = endpoints[ei]
      console.log('[extract-url] Trying Reddit endpoint ' + ep.label + ':', ep.url)

      try {
        var controller = new AbortController()
        var timeoutId = setTimeout(function() { controller.abort() }, 10000)

        var attemptResp = await fetch(ep.url, {
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/html;q=0.9',
            'Accept-Language': 'en-US,en;q=0.9',
          },
          redirect: 'follow',
        })
        clearTimeout(timeoutId)

        console.log('[extract-url] Endpoint ' + ep.label + ' status:', attemptResp.status)

        if (attemptResp.ok) {
          var text = await attemptResp.text()
          console.log('[extract-url] Response length:', text.length, 'first 100:', text.slice(0, 100))
          if (text.trim().startsWith('[') || text.trim().startsWith('{')) {
            rawText = text
            successEndpoint = ep.label
            // If we got JSON, check if it has image data
            // If it does, great — use it. If not, try next endpoint for richer data.
            try {
              var quickParse = JSON.parse(text)
              var quickListing = Array.isArray(quickParse) ? quickParse[0] : quickParse
              var quickPost = quickListing?.data?.children?.[0]?.data
              if (quickPost) {
                var hasImageData = !!(
                  quickPost.preview ||
                  quickPost.thumbnail && quickPost.thumbnail !== 'self' && quickPost.thumbnail !== 'default' ||
                  quickPost.url_overridden_by_dest ||
                  quickPost.is_gallery
                )
                console.log('[extract-url] Endpoint ' + ep.label + ' has image data:', hasImageData, 'url:', quickPost.url ? quickPost.url.slice(0, 80) : 'null')
                if (hasImageData) {
                  break // This endpoint has full data, use it
                }
                // No image data — keep this text as fallback but try next endpoint
                console.log('[extract-url] Endpoint ' + ep.label + ' has no image data, trying next for richer data...')
              }
            } catch {
              break // Can't quick-parse, just use what we got
            }
          } else {
            console.log('[extract-url] Got non-JSON from ' + ep.label)
          }
        } else {
          console.log('[extract-url] Endpoint ' + ep.label + ' returned status', attemptResp.status)
        }
      } catch (endpointErr: any) {
        console.error('[extract-url] Endpoint ' + ep.label + ' error:', endpointErr.message || endpointErr)
      }
    }

    console.log('[extract-url] Using endpoint: ' + (successEndpoint || 'none'))

    // If all JSON endpoints failed, try oEmbed as last resort (limited but reliable)
    if (!rawText) {
      console.log('[extract-url] All JSON endpoints failed, trying oEmbed...')
      try {
        var oembedUrl = 'https://www.reddit.com/oembed?url=' + encodeURIComponent(cleanUrl) + '&format=json'
        var controller3 = new AbortController()
        var timeoutId3 = setTimeout(function() { controller3.abort() }, 10000)
        var oembedResp = await fetch(oembedUrl, {
          signal: controller3.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          redirect: 'follow',
        })
        clearTimeout(timeoutId3)

        console.log('[extract-url] oEmbed status:', oembedResp.status)

        if (oembedResp.ok) {
          var oembedData = await oembedResp.json()
          console.log('[extract-url] oEmbed data:', JSON.stringify(oembedData).slice(0, 300))
          // oEmbed returns { title, author_name, thumbnail_url, html, ... }
          if (oembedData && oembedData.title) {
            return {
              title: oembedData.title || null,
              selftext: null,
              thumbnail: oembedData.thumbnail_url || null,
              preview_image: oembedData.thumbnail_url || null,
              url_overridden_by_dest: null,
              is_video: false,
              media_url: null,
              subreddit: oembedData.author_name || null,
            }
          }
        }
      } catch (oembedErr: any) {
        console.error('[extract-url] oEmbed error:', oembedErr.message || oembedErr)
      }

      console.error('[extract-url] All Reddit endpoints failed including oEmbed')
      return null
    }

    var json: any
    try {
      json = JSON.parse(rawText)
    } catch (parseErr) {
      console.error('[extract-url] Reddit JSON parse error:', rawText.slice(0, 300))
      return null
    }

    // Reddit returns an array: [listing, comments]
    var listing = Array.isArray(json) ? json[0] : json
    var post = listing?.data?.children?.[0]?.data
    if (!post) return null

    // Debug: log key post fields for image detection + raw keys to identify data structure
    var postKeys = Object.keys(post).join(',')
    console.log('[extract-url] Reddit post keys (' + Object.keys(post).length + '):', postKeys.slice(0, 500))
    console.log('[extract-url] Reddit post fields:', JSON.stringify({
      post_hint: post.post_hint,
      thumbnail: post.thumbnail,
      url: post.url ? post.url.slice(0, 150) : null,
      url_overridden_by_dest: post.url_overridden_by_dest ? post.url_overridden_by_dest.slice(0, 150) : null,
      has_preview: !!(post.preview && post.preview.images),
      preview_count: post.preview && post.preview.images ? post.preview.images.length : 0,
      preview_first_source: (post.preview && post.preview.images && post.preview.images[0] && post.preview.images[0].source) ? post.preview.images[0].source.url.slice(0, 150) : null,
      is_gallery: !!post.is_gallery,
      is_video: !!post.is_video,
      domain: post.domain,
      is_self: post.is_self,
      is_reddit_media_domain: post.is_reddit_media_domain,
      media_metadata_keys: post.media_metadata ? Object.keys(post.media_metadata).slice(0, 3) : null,
      crosspost_parent_list: post.crosspost_parent_list ? post.crosspost_parent_list.length + ' crossposts' : null,
    }))

    // Extract the best image from Reddit's preview system
    var previewImage: string | null = null
    if (post.preview && post.preview.images && post.preview.images.length > 0) {
      var source = post.preview.images[0].source
      if (source && source.url) {
        // Reddit HTML-encodes URLs in preview
        previewImage = source.url.replace(/&amp;/g, '&')
        console.log('[extract-url] Found preview image:', previewImage.slice(0, 120))
      }
    }

    // Check if the post links directly to an image
    var linkedUrl = post.url_overridden_by_dest || post.url || null
    // Detect direct images by extension OR by known image hosts OR by post_hint
    var isDirectImage = linkedUrl && (
      /\.(jpg|jpeg|png|gif|webp)(\?.*)?$/i.test(linkedUrl) ||
      /i\.redd\.it/i.test(linkedUrl) ||
      /i\.imgur\.com/i.test(linkedUrl) ||
      /preview\.redd\.it/i.test(linkedUrl) ||
      post.post_hint === 'image'
    )

    // For gallery posts, try to get the first gallery image
    if (!previewImage && !isDirectImage && post.is_gallery && post.media_metadata) {
      var mediaKeys = Object.keys(post.media_metadata)
      if (mediaKeys.length > 0) {
        var firstMedia = post.media_metadata[mediaKeys[0]]
        if (firstMedia && firstMedia.s && firstMedia.s.u) {
          previewImage = firstMedia.s.u.replace(/&amp;/g, '&')
          console.log('[extract-url] Found gallery image:', previewImage.slice(0, 120))
        }
      }
    }

    // For video posts, get the thumbnail
    var mediaUrl: string | null = null
    if (post.is_video && post.media && post.media.reddit_video) {
      mediaUrl = post.media.reddit_video.fallback_url || null
    }

    // Use thumbnail as final fallback if it's a real URL
    var thumbUrl = post.thumbnail
    var validThumb = thumbUrl && thumbUrl !== 'self' && thumbUrl !== 'default' && thumbUrl !== 'nsfw' && thumbUrl !== 'spoiler' && thumbUrl.startsWith('http')

    var bestImage = previewImage || (isDirectImage ? linkedUrl : null) || (validThumb ? thumbUrl : null)

    console.log('[extract-url] Image resolution: previewImage=' + (previewImage ? 'yes' : 'no') + ' isDirectImage=' + isDirectImage + ' validThumb=' + validThumb + ' bestImage=' + (bestImage ? bestImage.slice(0, 80) : 'null'))

    // If no image found from JSON API, try multiple supplemental sources
    if (!bestImage) {
      console.log('[extract-url] No image from JSON API, trying supplemental sources...')

      // 1. Try Reddit oEmbed
      try {
        var oembedUrl2 = 'https://www.reddit.com/oembed?url=' + encodeURIComponent(cleanUrl) + '&format=json'
        var oeCtrl = new AbortController()
        var oeTimeout = setTimeout(function() { oeCtrl.abort() }, 8000)
        var oeResp = await fetch(oembedUrl2, {
          signal: oeCtrl.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json',
          },
          redirect: 'follow',
        })
        clearTimeout(oeTimeout)
        console.log('[extract-url] Reddit oEmbed status:', oeResp.status)
        if (oeResp.ok) {
          var oeData = await oeResp.json()
          console.log('[extract-url] Reddit oEmbed thumbnail:', oeData.thumbnail_url || 'null')
          if (oeData.thumbnail_url) {
            bestImage = oeData.thumbnail_url
          }
        }
      } catch (oeErr: any) {
        console.log('[extract-url] Reddit oEmbed error:', oeErr.message || oeErr)
      }

      // 2. Try noembed.com (third-party oEmbed proxy — handles Reddit well)
      if (!bestImage) {
        try {
          var noembedUrl = 'https://noembed.com/embed?url=' + encodeURIComponent(cleanUrl)
          var neCtrl = new AbortController()
          var neTimeout = setTimeout(function() { neCtrl.abort() }, 8000)
          var neResp = await fetch(noembedUrl, {
            signal: neCtrl.signal,
            headers: { 'Accept': 'application/json' },
            redirect: 'follow',
          })
          clearTimeout(neTimeout)
          console.log('[extract-url] noembed status:', neResp.status)
          if (neResp.ok) {
            var neData = await neResp.json()
            console.log('[extract-url] noembed data:', JSON.stringify({ thumbnail_url: neData.thumbnail_url, title: neData.title }).slice(0, 200))
            if (neData.thumbnail_url) {
              bestImage = neData.thumbnail_url
            }
          }
        } catch (neErr: any) {
          console.log('[extract-url] noembed error:', neErr.message || neErr)
        }
      }

      // 3. Try jsonlink.io (another free metadata extraction API)
      if (!bestImage) {
        try {
          var jlUrl = 'https://jsonlink.io/api/extract?url=' + encodeURIComponent(cleanUrl)
          var jlCtrl = new AbortController()
          var jlTimeout = setTimeout(function() { jlCtrl.abort() }, 8000)
          var jlResp = await fetch(jlUrl, {
            signal: jlCtrl.signal,
            headers: { 'Accept': 'application/json' },
            redirect: 'follow',
          })
          clearTimeout(jlTimeout)
          console.log('[extract-url] jsonlink status:', jlResp.status)
          if (jlResp.ok) {
            var jlData = await jlResp.json()
            console.log('[extract-url] jsonlink data:', JSON.stringify({ images: jlData.images, title: jlData.title }).slice(0, 200))
            if (jlData.images && jlData.images.length > 0) {
              bestImage = jlData.images[0]
            }
            // Also fill description if we don't have one
            if (!post.selftext && jlData.description) {
              post.selftext = jlData.description.slice(0, 500)
            }
          }
        } catch (jlErr: any) {
          console.log('[extract-url] jsonlink error:', jlErr.message || jlErr)
        }
      }
    }

    // Build raw debug string for _debug response
    var rawDebug = 'ep=' + successEndpoint +
      '|post_hint=' + (post.post_hint || 'none') +
      '|url=' + (post.url ? post.url.slice(0, 80) : 'null') +
      '|domain=' + (post.domain || 'null') +
      '|is_self=' + post.is_self +
      '|has_preview=' + !!(post.preview && post.preview.images) +
      '|gallery=' + !!post.is_gallery +
      '|keys=' + Object.keys(post).length +
      '|bestImage=' + (bestImage ? 'yes' : 'null')

    return {
      title: post.title || null,
      selftext: post.selftext ? post.selftext.slice(0, 500) : null,
      thumbnail: validThumb ? thumbUrl : null,
      preview_image: bestImage,
      url_overridden_by_dest: linkedUrl,
      is_video: !!post.is_video,
      media_url: mediaUrl,
      subreddit: post.subreddit || null,
      _raw_debug: rawDebug,
    }
  } catch (err) {
    console.error('[extract-url] fetchRedditJsonData error:', err)
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

    // ── Debug log (temporary) ──
    var debugLog: string[] = []

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

      console.log('[extract-url] Fetching OG metadata from:', normalizedUrl)

      var fetchResponse = await fetch(normalizedUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        redirect: 'follow',
      })
      clearTimeout(timeoutId)

      console.log('[extract-url] OG fetch status:', fetchResponse.status, 'url:', fetchResponse.url)
      debugLog.push('og_status=' + fetchResponse.status + ' final_url=' + fetchResponse.url)

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
    } catch (fetchErr: any) {
      debugLog.push('og_error=' + (fetchErr.message || fetchErr))
      console.error('[extract-url] OG fetch error:', fetchErr)
      // Fetch failed — continue with empty metadata
    }

    console.log('[extract-url] After OG extraction:', JSON.stringify({ title: metadata.title, description: metadata.description ? metadata.description.slice(0, 80) : null, image: metadata.image ? metadata.image.slice(0, 80) : null }))

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
      debugLog.push('reddit=' + (redditData ? 'found(ep=' + (redditData._raw_debug || '') + ',title=' + (redditData.title || '').slice(0, 30) + ',img=' + (redditData.preview_image ? redditData.preview_image.slice(0, 60) : 'null') + ',thumb=' + (redditData.thumbnail || 'null') + ',linked=' + (redditData.url_overridden_by_dest ? redditData.url_overridden_by_dest.slice(0, 60) : 'null') + ')' : 'null'))
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
      console.log('[extract-url] Proxying image:', metadata.image.slice(0, 120))
      storedImageUrl = await proxyImageToStorage(metadata.image, urlHash, supabase)
      console.log('[extract-url] Proxied image result:', storedImageUrl ? storedImageUrl.slice(0, 120) : 'null')
    } else {
      console.log('[extract-url] No image to proxy')
    }

    console.log('[extract-url] Final response:', JSON.stringify({ title: metadata.title, description: metadata.description ? 'yes' : 'no', thumbnail_url: storedImageUrl || metadata.image || null }))

    debugLog.push('source_type=' + detected.sourceType)
    debugLog.push('og_title=' + (metadata.title || 'null'))
    debugLog.push('og_image=' + (metadata.image ? metadata.image.slice(0, 80) : 'null'))
    debugLog.push('stored_image=' + (storedImageUrl ? storedImageUrl.slice(0, 80) : 'null'))

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
      _debug: debugLog,
    })
  } catch (error: any) {
    console.error('URL extraction error:', error)
    return res.status(500).json({ error: 'Failed to extract URL metadata' })
  }
}
