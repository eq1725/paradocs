/**
 * Media Review API for Phenomena
 *
 * Handles:
 * GET - List phenomena with media counts and pending items
 * POST - Approve/reject/set_profile actions on media items
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ADMIN_EMAIL = 'williamschaseh@gmail.com'

interface MediaReviewResponse {
  stats: {
    total_phenomena: number;
    with_profile_image: number;
    pending_review: number;
    no_candidates: number;
  };
  phenomena: Array<{
    id: string;
    name: string;
    slug: string;
    category: string;
    primary_image_url: string | null;
    media_count: number;
    pending_count: number;
    approved_count: number;
    rejected_count: number;
    media_items: Array<{
      id: string;
      phenomenon_id: string;
      phenomenon_name: string;
      phenomenon_slug: string;
      category: string;
      url: string;
      thumbnail_url: string | null;
      source: string | null;
      license: string | null;
      ai_confidence: number;
      caption: string | null;
      status: 'pending' | 'approved' | 'rejected';
      is_profile: boolean;
      created_at: string;
    }>;
  }>;
}

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

async function handleGetRequest(
  req: NextApiRequest,
  res: NextApiResponse<MediaReviewResponse>
): Promise<void> {
  var supabase = getSupabaseAdmin();

  try {
    var { category, status, search, page = 1, limit = 20 } = req.query;
    var pageNum = parseInt(String(page)) || 1;
    var limitNum = parseInt(String(limit)) || 20;
    var offset = (pageNum - 1) * limitNum;

    // Build query for phenomena
    var phenomenaQuery = supabase
      .from('phenomena')
      .select(
        'id, name, slug, category, primary_image_url',
        { count: 'exact' }
      )
      .eq('status', 'active');

    if (category) {
      phenomenaQuery = phenomenaQuery.eq('category', String(category));
    }

    if (search) {
      phenomenaQuery = phenomenaQuery.ilike('name', '%' + String(search) + '%');
    }

    var { data: phenomena, error: phenomenaError, count } = await phenomenaQuery
      .order('name', { ascending: true })
      .range(offset, offset + limitNum - 1);

    if (phenomenaError || !phenomena) {
      return res.status(500).json({
        stats: { total_phenomena: 0, with_profile_image: 0, pending_review: 0, no_candidates: 0 },
        phenomena: []
      });
    }

    // Fetch media for each phenomenon
    var phenomenaWithMedia = [];

    for (var p of phenomena) {
      var mediaQuery = supabase
        .from('phenomena_media')
        .select('*')
        .eq('phenomenon_id', p.id);

      if (status) {
        mediaQuery = mediaQuery.eq('status', String(status));
      }

      var { data: mediaItems } = await mediaQuery.order('created_at', { ascending: false });

      var pendingCount = 0;
      var approvedCount = 0;
      var rejectedCount = 0;

      if (mediaItems) {
        pendingCount = mediaItems.filter(function(m) { return m.status === 'pending'; }).length;
        approvedCount = mediaItems.filter(function(m) { return m.status === 'approved'; }).length;
        rejectedCount = mediaItems.filter(function(m) { return m.status === 'rejected'; }).length;
      }

      phenomenaWithMedia.push({
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        primary_image_url: p.primary_image_url,
        media_count: mediaItems?.length || 0,
        pending_count: pendingCount,
        approved_count: approvedCount,
        rejected_count: rejectedCount,
        media_items: (mediaItems || []).map(function(m) {
          return {
            id: m.id,
            phenomenon_id: m.phenomenon_id,
            phenomenon_name: p.name,
            phenomenon_slug: p.slug,
            category: p.category,
            url: m.stored_url || m.original_url,
            thumbnail_url: m.thumbnail_url,
            source: m.source,
            license: m.license,
            ai_confidence: m.ai_confidence || 0,
            caption: m.caption,
            status: m.status,
            is_profile: m.is_profile,
            created_at: m.created_at
          };
        })
      });
    }

    // Calculate global stats
    var { data: allPhenomena } = await supabase
      .from('phenomena')
      .select('id, primary_image_url')
      .eq('status', 'active');

    var { data: allMedia } = await supabase
      .from('phenomena_media')
      .select('id, phenomenon_id, status');

    var withProfileImage = allPhenomena?.filter(function(p) { return p.primary_image_url; }).length || 0;
    var pendingReview = allMedia?.filter(function(m) { return m.status === 'pending'; }).length || 0;
    var noCandidates = allPhenomena?.filter(function(p) {
      var hasMedia = allMedia?.some(function(m) { return m.phenomenon_id === p.id; });
      return !hasMedia;
    }).length || 0;

    return res.status(200).json({
      stats: {
        total_phenomena: allPhenomena?.length || 0,
        with_profile_image: withProfileImage,
        pending_review: pendingReview,
        no_candidates: noCandidates
      },
      phenomena: phenomenaWithMedia
    });
  } catch (error) {
    console.error('[MediaReview] GET Error:', error);
    return res.status(500).json({
      stats: { total_phenomena: 0, with_profile_image: 0, pending_review: 0, no_candidates: 0 },
      phenomena: []
    });
  }
}

async function handlePostRequest(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  var supabase = getSupabaseAdmin();

  try {
    var { action, media_id } = req.body;

    if (!action || !media_id) {
      return res.status(400).json({ error: 'Missing action or media_id' });
    }

    // Fetch the media item
    var { data: mediaItem, error: fetchError } = await supabase
      .from('phenomena_media')
      .select('*')
      .eq('id', media_id)
      .single();

    if (fetchError || !mediaItem) {
      return res.status(404).json({ error: 'Media item not found' });
    }

    if (action === 'approve') {
      var { error: updateError } = await supabase
        .from('phenomena_media')
        .update({ status: 'approved' })
        .eq('id', media_id);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to approve media' });
      }

      return res.status(200).json({ success: true, message: 'Media approved' });
    }

    if (action === 'reject') {
      var { error: updateError } = await supabase
        .from('phenomena_media')
        .update({ status: 'rejected' })
        .eq('id', media_id);

      if (updateError) {
        return res.status(500).json({ error: 'Failed to reject media' });
      }

      return res.status(200).json({ success: true, message: 'Media rejected' });
    }

    if (action === 'set_profile') {
      // First approve the media
      var { error: approveError } = await supabase
        .from('phenomena_media')
        .update({ status: 'approved', is_profile: true })
        .eq('id', media_id);

      if (approveError) {
        return res.status(500).json({ error: 'Failed to set profile image' });
      }

      // Unset other profile images for this phenomenon
      var { error: unsetError } = await supabase
        .from('phenomena_media')
        .update({ is_profile: false })
        .eq('phenomenon_id', mediaItem.phenomenon_id)
        .neq('id', media_id);

      if (unsetError) {
        console.error('Warning: Failed to unset other profile images:', unsetError);
      }

      // Update the phenomena primary_image_url
      var { error: phenomenaError } = await supabase
        .from('phenomena')
        .update({ primary_image_url: mediaItem.stored_url || mediaItem.original_url })
        .eq('id', mediaItem.phenomenon_id);

      if (phenomenaError) {
        console.error('Warning: Failed to update phenomena primary_image_url:', phenomenaError);
      }

      return res.status(200).json({ success: true, message: 'Profile image set' });
    }

    return res.status(400).json({ error: 'Invalid action' });
  } catch (error) {
    console.error('[MediaReview] POST Error:', error);
    return res.status(500).json({ error: 'Failed to process request' });
  }
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  // Check authentication
  var user = await getAuthenticatedUser(req);
  if (!user || user.email !== ADMIN_EMAIL) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method === 'GET') {
    return handleGetRequest(req, res as NextApiResponse<MediaReviewResponse>);
  } else if (req.method === 'POST') {
    return handlePostRequest(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
