/**
 * Media Review API for Phenomena
 *
 * Handles:
 * GET - List phenomena with media counts and pending items
 *       mode=profile-review returns lightweight profile review grid data
 * POST - Approve/reject/set_profile actions on media items
 *        approve-profile/deny-profile actions for profile review mode
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

async function handleProfileReviewGet(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<void> {
  var supabase = getSupabaseAdmin();

  try {
    var { category, search, profile_status, page, limit } = req.query;
    var pageNum = parseInt(String(page || '1')) || 1;
    var limitNum = parseInt(String(limit || '50')) || 50;
    var offset = (pageNum - 1) * limitNum;

    // Build lightweight query - no media_items join needed
    var query = supabase
      .from('phenomena')
      .select('id, name, slug, category, primary_image_url, profile_review_status', { count: 'exact' })
      .eq('status', 'active');

    if (category) {
      query = query.eq('category', String(category));
    }

    if (search) {
      query = query.ilike('name', '%' + String(search) + '%');
    }

    // Filter by profile_review_status
    var profileStatusStr = String(profile_status || 'all');
    if (profileStatusStr === 'unreviewed') {
      query = query.eq('profile_review_status', 'unreviewed');
    } else if (profileStatusStr === 'approved') {
      query = query.eq('profile_review_status', 'approved');
    } else if (profileStatusStr === 'denied') {
      query = query.eq('profile_review_status', 'denied');
    } else if (profileStatusStr === 'has-image') {
      query = query.not('primary_image_url', 'is', null);
    } else if (profileStatusStr === 'no-image') {
      query = query.is('primary_image_url', null);
    }

    var { data: items, error: itemsError, count } = await query
      .order('name', { ascending: true })
      .range(offset, offset + limitNum - 1);

    if (itemsError || !items) {
      return res.status(500).json({
        stats: { total: 0, reviewed: 0, approved: 0, denied: 0, unreviewed: 0 },
        phenomena: [],
        total_count: 0
      });
    }

    // Get stats for all active phenomena (unfiltered)
    var { data: allItems } = await supabase
      .from('phenomena')
      .select('id, primary_image_url, profile_review_status')
      .eq('status', 'active');

    var totalCount = allItems?.length || 0;
    var approvedCount = 0;
    var deniedCount = 0;
    var unreviewedCount = 0;

    if (allItems) {
      for (var i = 0; i < allItems.length; i++) {
        var s = allItems[i].profile_review_status || 'unreviewed';
        if (s === 'approved') {
          approvedCount = approvedCount + 1;
        } else if (s === 'denied') {
          deniedCount = deniedCount + 1;
        } else {
          unreviewedCount = unreviewedCount + 1;
        }
      }
    }

    var reviewedCount = approvedCount + deniedCount;

    return res.status(200).json({
      stats: {
        total: totalCount,
        reviewed: reviewedCount,
        approved: approvedCount,
        denied: deniedCount,
        unreviewed: unreviewedCount
      },
      phenomena: items.map(function(p) {
        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          category: p.category,
          primary_image_url: p.primary_image_url,
          profile_review_status: p.profile_review_status || 'unreviewed'
        };
      }),
      total_count: count || 0
    });
  } catch (error) {
    console.error('[MediaReview] Profile Review GET Error:', error);
    return res.status(500).json({
      stats: { total: 0, reviewed: 0, approved: 0, denied: 0, unreviewed: 0 },
      phenomena: [],
      total_count: 0
    });
  }
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
    var { action, media_id, phenomenon_id } = req.body;

    // Handle profile review actions (no media_id needed)
    if (action === 'approve-profile') {
      if (!phenomenon_id) {
        return res.status(400).json({ error: 'Missing phenomenon_id' });
      }
      var { error: approveProfileError } = await supabase
        .from('phenomena')
        .update({ profile_review_status: 'approved' })
        .eq('id', phenomenon_id);

      if (approveProfileError) {
        return res.status(500).json({ error: 'Failed to approve profile' });
      }
      return res.status(200).json({ success: true, message: 'Profile approved' });
    }

    if (action === 'deny-profile') {
      if (!phenomenon_id) {
        return res.status(400).json({ error: 'Missing phenomenon_id' });
      }
      // Set status to denied AND clear the primary_image_url
      var { error: denyProfileError } = await supabase
        .from('phenomena')
        .update({ profile_review_status: 'denied', primary_image_url: null })
        .eq('id', phenomenon_id);

      if (denyProfileError) {
        return res.status(500).json({ error: 'Failed to deny profile' });
      }
      return res.status(200).json({ success: true, message: 'Profile denied and image cleared' });
    }

    // Handle set-manual-url: set a single URL for a phenomenon
    if (action === 'set-manual-url') {
      var manualPhenomId = req.body.phenomenon_id;
      var manualUrl = req.body.url;
      if (!manualPhenomId || !manualUrl) {
        return res.status(400).json({ error: 'Missing phenomenon_id or url' });
      }
      var { error: manualUrlError } = await supabase
        .from('phenomena')
        .update({ primary_image_url: String(manualUrl), profile_review_status: 'unreviewed' })
        .eq('id', manualPhenomId);

      if (manualUrlError) {
        return res.status(500).json({ error: 'Failed to set manual URL', details: manualUrlError.message });
      }
      return res.status(200).json({ success: true, message: 'Manual URL set, moved to unreviewed' });
    }

    // Handle set-manual-url-bulk: set URLs for multiple phenomena by slug
    if (action === 'set-manual-url-bulk') {
      var items = req.body.items;
      if (!items || !Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Missing or empty items array. Expected [{slug, url}, ...]' });
      }

      var bulkResults: Array<{ slug: string; success: boolean; error?: string }> = [];
      for (var bi = 0; bi < items.length; bi++) {
        var item = items[bi];
        if (!item.slug || !item.url) {
          bulkResults.push({ slug: item.slug || 'unknown', success: false, error: 'Missing slug or url' });
          continue;
        }

        // Look up phenomenon by slug
        var { data: phenomData, error: phenomLookupError } = await supabase
          .from('phenomena')
          .select('id')
          .eq('slug', String(item.slug))
          .limit(1)
          .single();

        if (phenomLookupError || !phenomData) {
          bulkResults.push({ slug: item.slug, success: false, error: 'Phenomenon not found' });
          continue;
        }

        var { error: bulkUpdateError } = await supabase
          .from('phenomena')
          .update({ primary_image_url: String(item.url), profile_review_status: 'unreviewed' })
          .eq('id', phenomData.id);

        if (bulkUpdateError) {
          bulkResults.push({ slug: item.slug, success: false, error: bulkUpdateError.message });
        } else {
          bulkResults.push({ slug: item.slug, success: true });
        }
      }

      var bulkSuccessCount = bulkResults.filter(function(r) { return r.success; }).length;
      return res.status(200).json({
        success: true,
        message: bulkSuccessCount + ' of ' + items.length + ' URLs set successfully',
        results: bulkResults
      });
    }

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
    if (req.query.mode === 'profile-review') {
      return handleProfileReviewGet(req, res);
    }
    return handleGetRequest(req, res as NextApiResponse<MediaReviewResponse>);
  } else if (req.method === 'POST') {
    return handlePostRequest(req, res);
  } else {
    return res.status(405).json({ error: 'Method not allowed' });
  }
}
