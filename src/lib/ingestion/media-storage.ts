// Media Storage Utility — downloads and stores media in Supabase Storage
// Only for sources whose ToS permits it (see media-policy.ts).

import { createClient } from '@supabase/supabase-js';
import { canDownloadMedia, getAttributionText } from './media-policy';
import { ScrapedMediaItem } from './types';

var MEDIA_BUCKET = 'report-media';

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

interface StoredMediaResult {
  url: string;
  caption: string | null;
  stored: boolean; // true if downloaded+stored, false if kept as hotlink
}

/**
 * Process a media item according to source media policy.
 *
 * For download-permitted sources: fetches the media, uploads to Supabase Storage,
 * returns the Supabase public URL.
 *
 * For link-only sources: returns the original URL unchanged.
 *
 * @param mediaItem - The scraped media item
 * @param sourceType - The source type (e.g., 'wikipedia', 'nuforc')
 * @param reportSlug - The report slug (used for storage path)
 * @param index - Media index within the report (for unique filenames)
 */
export async function processMediaItem(
  mediaItem: ScrapedMediaItem,
  sourceType: string,
  reportSlug: string,
  index: number
): Promise<StoredMediaResult> {
  // Default: return original URL (link-only)
  var result: StoredMediaResult = {
    url: mediaItem.url,
    caption: mediaItem.caption || null,
    stored: false
  };

  // Only download if policy permits
  if (!canDownloadMedia(sourceType)) {
    return result;
  }

  // Only download images for now (videos/audio are too large)
  if (mediaItem.type !== 'image') {
    return result;
  }

  try {
    // Download the external media
    var fetchResponse = await fetch(mediaItem.url, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (https://beta.discoverparadocs.com; research platform)',
      },
      signal: AbortSignal.timeout(15000), // 15s timeout
    });

    if (!fetchResponse.ok) {
      console.log('[MediaStorage] Download failed (' + fetchResponse.status + '): ' + mediaItem.url.substring(0, 80));
      return result; // Fall back to hotlink
    }

    var imageBuffer = Buffer.from(await fetchResponse.arrayBuffer());

    // Skip tiny files (likely broken/placeholder)
    if (imageBuffer.length < 1000) {
      console.log('[MediaStorage] Skipping tiny file (' + imageBuffer.length + ' bytes)');
      return result;
    }

    // Skip very large files (> 10MB)
    if (imageBuffer.length > 10 * 1024 * 1024) {
      console.log('[MediaStorage] Skipping oversized file (' + Math.round(imageBuffer.length / 1024 / 1024) + 'MB)');
      return result;
    }

    var contentType = fetchResponse.headers.get('content-type') || 'image/jpeg';

    // Determine file extension
    var ext = 'jpg';
    if (mediaItem.url.indexOf('.png') !== -1 || contentType.indexOf('png') !== -1) ext = 'png';
    else if (mediaItem.url.indexOf('.webp') !== -1 || contentType.indexOf('webp') !== -1) ext = 'webp';
    else if (mediaItem.url.indexOf('.gif') !== -1 || contentType.indexOf('gif') !== -1) ext = 'gif';
    else if (mediaItem.url.indexOf('.svg') !== -1 || contentType.indexOf('svg') !== -1) ext = 'svg';

    // Clean storage path: {source}/{slug}/{index}.{ext}
    var cleanSlug = reportSlug.replace(/[^a-z0-9-]/g, '').substring(0, 80);
    var storagePath = sourceType + '/' + cleanSlug + '/' + index + '.' + ext;

    // Upload to Supabase Storage
    var uploadResult = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '31536000', // 1 year cache
      });

    if (uploadResult.error) {
      console.log('[MediaStorage] Upload failed: ' + uploadResult.error.message);
      return result; // Fall back to hotlink
    }

    // Get the public URL
    var publicUrlResult = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(storagePath);
    var newUrl = publicUrlResult.data.publicUrl;

    // Build caption with attribution
    var attribution = getAttributionText(sourceType);
    var captionParts: string[] = [];
    if (mediaItem.caption) captionParts.push(mediaItem.caption);
    if (attribution) captionParts.push(attribution);
    var finalCaption = captionParts.length > 0 ? captionParts.join(' — ') : null;

    return {
      url: newUrl,
      caption: finalCaption,
      stored: true
    };
  } catch (err: any) {
    console.log('[MediaStorage] Error processing media: ' + (err.message || 'unknown'));
    return result; // Fall back to hotlink on any error
  }
}

/**
 * Ensure the report-media bucket exists. Call once at startup.
 */
export async function ensureMediaBucket(): Promise<void> {
  try {
    var { data: buckets } = await supabase.storage.listBuckets();
    var exists = buckets && buckets.some(function(b) { return b.name === MEDIA_BUCKET; });
    if (!exists) {
      await supabase.storage.createBucket(MEDIA_BUCKET, { public: true });
      console.log('[MediaStorage] Created bucket: ' + MEDIA_BUCKET);
    }
  } catch (err: any) {
    console.log('[MediaStorage] Bucket check failed: ' + (err.message || 'unknown'));
  }
}
