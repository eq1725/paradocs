/**
 * API: GET /api/phenomena/[slug]/reports
 * Get paginated reports linked to a phenomenon
 *
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 12, max: 100)
 * - sort: 'newest' | 'oldest' | 'popular' | 'most_viewed' | 'confidence' (default: 'newest')
 * - search: Text search query (optional)
 * - category: Filter by category (optional)
 * - country: Filter by country (optional)
 * - credibility: Filter by credibility level (optional)
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';
import { getPhenomenonBySlug } from '@/lib/services/phenomena.service';

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  var slug = req.query.slug;

  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  try {
    // Prevent stale cache on client-side navigation
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    // Get the phenomenon
    var phenomenon = await getPhenomenonBySlug(slug);

    if (!phenomenon) {
      return res.status(404).json({ error: 'Phenomenon not found' });
    }

    // Parse query params
    var page = Math.max(1, parseInt(req.query.page) || 1);
    var limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 12));
    var sort = req.query.sort || 'newest';
    var search = req.query.search;
    var category = req.query.category;
    var country = req.query.country;
    var credibility = req.query.credibility;

    var supabase = createServerClient();

    // Step 1: Get all report IDs linked to this phenomenon
    var linkResult = await supabase
      .from('report_phenomena')
      .select('report_id, confidence')
      .eq('phenomenon_id', phenomenon.id);

    if (linkResult.error) {
      console.error('[API] Error fetching linked reports:', linkResult.error);
      throw linkResult.error;
    }

    var linkedReports = linkResult.data;

    if (!linkedReports || linkedReports.length === 0) {
      return res.status(200).json({
        phenomenon: {
          id: phenomenon.id,
          name: phenomenon.name,
          slug: phenomenon.slug,
          icon: phenomenon.icon,
        },
        reports: [],
        pagination: {
          page: page,
          limit: limit,
          total: 0,
          totalPages: 0,
        },
      });
    }

    // Create a map of report_id -> confidence for later use
    var confidenceMap = new Map(linkedReports.map(function(r) { return [r.report_id, r.confidence]; }));
    var reportIds = linkedReports.map(function(r) { return r.report_id; });

    // Step 2: Query reports with filters
    var query = supabase
      .from('reports')
      .select('*, phenomenon_type:phenomenon_types(id, name, icon)', { count: 'exact' })
      .in('id', reportIds)
      .eq('status', 'approved');

    // Apply additional filters
    if (search) {
      query = query.or('title.ilike.%' + search + '%,summary.ilike.%' + search + '%');
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (country) {
      query = query.eq('country', country);
    }
    if (credibility) {
      query = query.eq('credibility', credibility);
    }

    // Apply sorting
    switch (sort) {
      case 'oldest':
        query = query.order('event_date', { ascending: true, nullsFirst: false });
        break;
      case 'popular':
        query = query.order('upvotes', { ascending: false });
        break;
      case 'most_viewed':
        query = query.order('view_count', { ascending: false });
        break;
      case 'newest':
      default:
        query = query.order('created_at', { ascending: false });
    }

    // Apply pagination
    var from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    var result = await query;

    if (result.error) {
      console.error('[API] Phenomenon reports error:', result.error);
      throw result.error;
    }

    // Add confidence scores to reports
    var reports = (result.data || []).map(function(report) {
      return Object.assign({}, report, {
        match_confidence: confidenceMap.get(report.id) || 0
      });
    });

    return res.status(200).json({
      phenomenon: {
        id: phenomenon.id,
        name: phenomenon.name,
        slug: phenomenon.slug,
        icon: phenomenon.icon,
      },
      reports: reports,
      pagination: {
        page: page,
        limit: limit,
        total: result.count || 0,
        totalPages: Math.ceil((result.count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[API] Phenomenon reports error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
