/**
 * POST /api/research-hub/proxy-image
 *
 * Accepts an image URL and proxies it to Supabase Storage.
 * Used by the frontend when client-side extraction finds an image
 * that the server couldn't access (e.g., Reddit images).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { createHash } from 'crypto'

var ARTIFACT_IMAGES_BUCKET = 'artifact-images'

function getExtFromContentType(ct: string): string {
  if (ct.includes('png')) return 'png'
  if (ct.includes('gif')) return 'gif'
  if (ct.includes('webp')) return 'webp'
  if (ct.includes('svg')) return 'svg'
  return 'jpg'
}

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

  var imageUrl = req.body.image_url
  var urlHash = req.body.url_hash

  if (!imageUrl || typeof imageUrl !== 'string') {
    return res.status(400).json({ error: 'image_url is required' })
  }
  if (!urlHash || typeof urlHash !== 'string') {
    return res.status(400).json({ error: 'url_hash is required' })
  }

  // Don't proxy if already on our storage
  if (imageUrl.includes('bhkbctdmwnowfmqpksed.supabase.co')) {
    return res.status(200).json({ stored_url: imageUrl })
  }

  try {
    var controller = new AbortController()
    var timeoutId = setTimeout(function() { controller.abort() }, 15000)

    var fetchResp = await fetch(imageUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*',
      },
      redirect: 'follow',
    })
    clearTimeout(timeoutId)

    if (!fetchResp.ok) {
      return res.status(502).json({ error: 'Failed to fetch image: ' + fetchResp.status })
    }

    var contentType = fetchResp.headers.get('content-type') || 'image/jpeg'
    if (!contentType.startsWith('image/')) {
      return res.status(400).json({ error: 'URL does not point to an image' })
    }

    var arrayBuffer = await fetchResp.arrayBuffer()
    if (arrayBuffer.byteLength > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 5MB)' })
    }
    if (arrayBuffer.byteLength < 512) {
      return res.status(400).json({ error: 'Image too small, likely an error page' })
    }

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
      return res.status(500).json({ error: 'Upload failed: ' + uploadResult.error.message })
    }

    var publicUrlResult = supabase.storage
      .from(ARTIFACT_IMAGES_BUCKET)
      .getPublicUrl(fileName)

    return res.status(200).json({
      stored_url: publicUrlResult.data.publicUrl || null,
    })
  } catch (err: any) {
    console.error('Proxy image error:', err)
    return res.status(500).json({ error: 'Failed to proxy image' })
  }
}
