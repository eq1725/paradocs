/**
 * Bulk Import Media API
 *
 * Imports media items (videos, images) into the phenomena_media table.
 * Supports YouTube video auto-detection with thumbnail extraction.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

var ADMIN_EMAIL = 'williamschaseh@gmail.com';

// Valid media types
var VALID_MEDIA_TYPES = ['video', 'image', 'audio', 'document'];

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

function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch (e) {
    return false;
  }
}

function extractYoutubeVideoId(url: string): string | null {
  var patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/
  ];

  for (var i = 0; i < patterns.length; i++) {
    var match = url.match(patterns[i]);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

async function getPhenomenonIdBySlug(supabase: ReturnType<typeof getSupabaseAdmin>, slug: string): Promise<string | null> {
  var { data, error } = await supabase
    .from('phenomena')
    .select('id')
    .eq('slug', slug)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}

interface MediaItem {
  slug: string;
  media_type: string;
  url: string;
  caption?: string;
  source?: string;
  tags?: string[];
  license?: string;
  is_profile?: boolean;
}

interface ImportError {
  slug: string;
  item_index: number;
  reason: string;
}

interface ImportResult {
  imported: number;
  skipped: number;
  errors: ImportError[];
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
  var { items = [], auto_approve = true } = req.body;

  if (!Array.isArray(items)) {
    return res.status(400).json({ error: 'items must be an array' });
  }

  var imported = 0;
  var skipped = 0;
  var errors: ImportError[] = [];

  try {
    for (var i = 0; i < items.length; i++) {
      var item = items[i] as MediaItem;

      // Validate required fields
      if (!item.slug || typeof item.slug !== 'string') {
        errors.push({
          slug: item.slug || 'unknown',
          item_index: i,
          reason: 'slug is required and must be a string'
        });
        skipped++;
        continue;
      }

      if (!item.media_type || typeof item.media_type !== 'string') {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'media_type is required and must be a string'
        });
        skipped++;
        continue;
      }

      if (!VALID_MEDIA_TYPES.includes(item.media_type)) {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'media_type must be one of: ' + VALID_MEDIA_TYPES.join(', ')
        });
        skipped++;
        continue;
      }

      if (!item.url || typeof item.url !== 'string') {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'url is required and must be a string'
        });
        skipped++;
        continue;
      }

      if (!isValidUrl(item.url)) {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'url is not a valid URL'
        });
        skipped++;
        continue;
      }

      // Look up phenomenon by slug
      var phenomenon_id = await getPhenomenonIdBySlug(supabase, item.slug);
      if (!phenomenon_id) {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'phenomenon with this slug not found'
        });
        skipped++;
        continue;
      }

      // Prepare media record
      var media_record: any = {
        phenomenon_id: phenomenon_id,
        media_type: item.media_type,
        original_url: item.url,
        caption: item.caption || null,
        source: item.source || null,
        license: item.license || null,
        is_profile: item.is_profile || false,
        tags: item.tags || [],
        status: auto_approve ? 'approved' : 'pending'
      };

      // Handle YouTube URLs
      if (item.media_type === 'video' && item.url.includes('youtube.com') || item.url.includes('youtu.be')) {
        var videoId = extractYoutubeVideoId(item.url);
        if (videoId) {
          media_record.thumbnail_url = 'https://img.youtube.com/vi/' + videoId + '/hqdefault.jpg';
        } else {
          errors.push({
            slug: item.slug,
            item_index: i,
            reason: 'could not extract YouTube video ID from URL'
          });
          skipped++;
          continue;
        }
      }

      // Insert into database
      var { error: insertError } = await supabase
        .from('phenomena_media')
        .insert([media_record]);

      if (insertError) {
        errors.push({
          slug: item.slug,
          item_index: i,
          reason: 'database insert failed: ' + insertError.message
        });
        skipped++;
        continue;
      }

      imported++;
    }

    return res.status(200).json({
      success: true,
      result: {
        imported: imported,
        skipped: skipped,
        errors: errors
      }
    });

  } catch (error) {
    console.error('[BulkImportMedia] Error:', error);
    return res.status(500).json({
      error: 'Failed to import media',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
