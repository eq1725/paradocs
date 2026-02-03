/**
 * API: GET /api/phenomena/[slug]/reports
 * Get paginated reports linked to a phenomenon
 *
 * This endpoint ensures consistency between the Encyclopedia and Explore page
 * by using the same query logic and only returning approved reports.
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

  const { slug } = req.query;

  if (typeof slug !== 'string') {
    return res.status(400).json({ error: 'Invalid slug' });
  }

  try {
    // Get the phenomenon
    const phenomenon = await getPhenomenonBySlug(slug);

    if (!phenomenon) {
      return res.status(404).json({ error: 'Phenomenon not found' });
    }

    // Parse query params
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 12));
    const sort = (req.query.sort as string) || 'newest';
    const search = req.query.search as string;
    const category = req.query.category as string;
    const country = req.query.country as string;
    const credibility = req.query.credibility as string;

    const supabase = createServerClient();

    // Step 1: Get all report IDs linked to this phenomenon
    const { data: linkedReports, error: linkError } = await supabase
      .from('report_phenomena')
      .select('report_id, confidence')
      .eq('phenomenon_id', phenomenon.id);

    if (linkError) {
      console.error('[API] Error fetching linked reports:', linkError);
      throw linkError;
    }

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
          page,
          limit,
          total: 0,
          totalPages: 0,
        },
      });
    }

    // Create a map of report_id -> confidence for later use
    const confidenceMap = new Map(linkedReports.map(r => [r.report_id, r.confidence]));
    const reportIds = linkedReports.map(r => r.report_id);

    // Step 2: Query reports with filters
    let query = supabase
      .from('reports')
      .select('*, phenomenon_type:phenomenon_types(id, name, icon)', { count: 'exact' })
      .in('id', reportIds)
      .eq('status', 'approved');

    // Apply additional filters
    if (search) {
      query = query.or(`title.ilike.%${search}%,summary.ilike.%${search}%`);
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
    const from = (page - 1) * limit;
    query = query.range(from, from + limit - 1);

    const { data, count, error } = await query;

    if (error) {
      console.error('[API] Phenomenon reports error:', error);
      throw error;
    }

    // Add confidence scores to reports
    const reports = (data || []).map(report => ({
      ...report,
      match_confidence: confidenceMap.get(report.id) || 0,
    }));

    return res.status(200).json({
      phenomenon: {
        id: phenomenon.id,
        name: phenomenon.name,
        slug: phenomenon.slug,
        icon: phenomenon.icon,
      },
      reports,
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[API] Phenomenon reports error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
