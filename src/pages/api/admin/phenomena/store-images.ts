/**
 * Store Phenomena Media Images API
 *
 * Downloads approved images from their original URLs and stores them in Supabase Storage.
 * Updates phenomena_media records with the stored_url for self-hosting.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';
var BUCKET_NAME = 'phenomena-images';
var RATE_LIMIT_DELAY_MS = 200;

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

async function getAuthenticatedUser(req: NextApiRequest): Promise<{ id: string; email: string } | null> {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  var authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    var token = authHeader.substring(7);
    var supabase = createClient(supabaseUrl, supabaseAnonKey);
    var { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email || '' };
    }
  }

  var cookies = req.headers.cookie || '';
  var accessTokenMatch = cookies.match(/sb-[^-]+-auth-token=([^;]+)/);
  if (accessTokenMatch) {
    try {
      var tokenData = JSON.parse(decodeURIComponent(accessTokenMatch[1]));
      if (tokenData?.access_token) {
        var supabaseWithToken = createClient(supabaseUrl, supabaseAnonKey, {
          global: { headers: { Authorization: 'Bearer ' + tokenData.access_token } },
        });
        var { data: { user } } = await supabaseWithToken.auth.getUser();
        if (user) {
          return { id: user.id, email: user.email || '' };
        }
      }
    } catch (e) { /* ignore */ }
  }

  return null;
}

function getFileExtensionFromContentType(contentType: string): string {
  var type = contentType.toLowerCase();
  if (type.includes('jpeg') || type.includes('jpg')) return 'jpg';
  if (type.includes('png')) return 'png';
  if (type.includes('svg')) return 'svg';
  if (type.includes('gif')) return 'gif';
  if (type.includes('webp')) return 'webp';
  return 'png';
}

async function downloadAndStoreImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  mediaId: string,
  originalUrl: string,
  slug: string
): Promise<{ storedUrl: string | null; error: string | null }> {
  try {
    // Fetch image from original URL with proper User-Agent
    var response = await fetch(originalUrl, {
      headers: {
        'User-Agent': 'Paradocs/1.0 (https://discoverparadocs.com; contact@discoverparadocs.com)'
      }
    });

    if (!response.ok) {
      return { storedUrl: null, error: 'HTTP ' + response.status + ' from original URL' };
    }

    var contentType = response.headers.get('content-type') || 'image/png';
    var arrayBuffer = await response.arrayBuffer();
    var buffer = Buffer.from(arrayBuffer);

    // Determine file extension from content type
    var ext = getFileExtensionFromContentType(contentType);

    // Generate storage path: {slug}/{media_id}.{ext}
    var fileName = slug + '/' + mediaId + '.' + ext;

    // Upload to Supabase Storage
    var { data, error } = await supabase.storage
      .from(BUCKET_NAME)
      .upload(fileName, buffer, {
        contentType: contentType,
        upsert: true,
        cacheControl: '31536000' // Cache for 1 year
      });

    if (error) {
      return { storedUrl: null, error: 'Upload failed: ' + error.message };
    }

    // Get public URL
    var { data: { publicUrl } } = supabase.storage
      .from(BUCKET_NAME)
      .getPublicUrl(fileName);

    return { storedUrl: publicUrl, error: null };
  } catch (error) {
    var errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { storedUrl: null, error: errorMsg };
  }
}

async function fetchMediaItemsToStore(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  mediaIds: string[] | undefined,
  allApproved: boolean,
  limit: number
): Promise<Array<{
  id: string;
  original_url: string;
  status: string;
  media_type: string;
  is_profile: boolean;
  phenomena_slug: string;
}> | null> {
  try {
    var query = supabase
      .from('phenomena_media')
      .select('id, original_url, status, media_type, is_profile, phenomena(slug)')
      .in('media_type', ['image', 'illustration']);

    if (mediaIds && mediaIds.length > 0) {
      // Fetch specific media items
      query = query.in('id', mediaIds);
    } else if (allApproved) {
      // Fetch all approved items that haven't been stored yet
      query = query.eq('status', 'approved').is('stored_url', null);
    } else {
      // No criteria provided, use default
      return [];
    }

    var { data, error } = await query.limit(limit);

    if (error) {
      console.error('[StoreImages] Database fetch error:', error);
      return null;
    }

    // Map phenomena relationship
    var mapped = (data || []).map(function(item: any) {
      return {
        id: item.id,
        original_url: item.original_url,
        status: item.status,
        media_type: item.media_type,
        is_profile: item.is_profile,
        phenomena_slug: item.phenomena?.slug || ''
      };
    });

    return mapped;
  } catch (error) {
    console.error('[StoreImages] Error fetching media items:', error);
    return null;
  }
}

async function updateMediaRecord(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  mediaId: string,
  storedUrl: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    var { error } = await supabase
      .from('phenomena_media')
      .update({ stored_url: storedUrl })
      .eq('id', mediaId);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    var errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

async function updatePhenomenonPrimaryImage(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  slug: string,
  imageUrl: string
): Promise<{ success: boolean; error: string | null }> {
  try {
    var { error } = await supabase
      .from('phenomena')
      .update({ primary_image_url: imageUrl })
      .eq('slug', slug);

    if (error) {
      return { success: false, error: error.message };
    }

    return { success: true, error: null };
  } catch (error) {
    var errorMsg = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: errorMsg };
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  var supabase = getSupabaseAdmin();
  var { media_ids, all_approved = false, limit = 20 } = req.body;

  // Validate request
  if (!all_approved && (!media_ids || !Array.isArray(media_ids) || media_ids.length === 0)) {
    return res.status(400).json({
      error: 'Bad request',
      details: 'Provide either media_ids array or set all_approved=true'
    });
  }

  try {
    // Fetch media items to process
    var mediaItems = await fetchMediaItemsToStore(supabase, media_ids, all_approved, limit);
    if (!mediaItems) {
      return res.status(500).json({ error: 'Failed to fetch media items' });
    }

    if (mediaItems.length === 0) {
      return res.status(200).json({
        success: true,
        processed: 0,
        stored: 0,
        failed: 0,
        details: []
      });
    }

    var results = {
      processed: 0,
      stored: 0,
      failed: 0,
      details: [] as { media_id: string; phenomena_slug: string; status: string; stored_url?: string; error?: string }[]
    };

    // Process each media item
    for (var i = 0; i < mediaItems.length; i++) {
      var item = mediaItems[i];
      results.processed++;

      // Download and store the image
      var { storedUrl, error: downloadError } = await downloadAndStoreImage(
        supabase,
        item.id,
        item.original_url,
        item.phenomena_slug
      );

      if (!storedUrl || downloadError) {
        results.failed++;
        results.details.push({
          media_id: item.id,
          phenomena_slug: item.phenomena_slug,
          status: 'download_failed',
          error: downloadError
        });
      } else {
        // Update media record with stored_url
        var updateResult = await updateMediaRecord(supabase, item.id, storedUrl);

        if (!updateResult.success) {
          results.failed++;
          results.details.push({
            media_id: item.id,
            phenomena_slug: item.phenomena_slug,
            status: 'db_update_failed',
            error: updateResult.error
          });
        } else {
          // If is_profile is true, also update phenomena.primary_image_url
          if (item.is_profile) {
            var phenomenaUpdate = await updatePhenomenonPrimaryImage(
              supabase,
              item.phenomena_slug,
              storedUrl
            );

            if (!phenomenaUpdate.success) {
              // Log but don't count as failed - image was stored, just profile update failed
              console.warn('[StoreImages] Profile image update failed for ' + item.phenomena_slug + ': ' + phenomenaUpdate.error);
            }
          }

          results.stored++;
          results.details.push({
            media_id: item.id,
            phenomena_slug: item.phenomena_slug,
            status: 'stored',
            stored_url: storedUrl
          });
        }
      }

      // Rate limit delay between downloads
      if (i < mediaItems.length - 1) {
        await new Promise(function(resolve) {
          setTimeout(resolve, RATE_LIMIT_DELAY_MS);
        });
      }
    }

    return res.status(200).json({
      success: true,
      processed: results.processed,
      stored: results.stored,
      failed: results.failed,
      details: results.details
    });

  } catch (error) {
    console.error('[StoreImages] Error:', error);
    return res.status(500).json({
      error: 'Failed to process images',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
