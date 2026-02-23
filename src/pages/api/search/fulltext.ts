/**
 * API: GET /api/search/fulltext
 * Full-text search across reports using PostgreSQL text search
 *
 * Query parameters:
 * - q: search query string (required)
 * - mode: 'simple' | 'phrase' | 'advanced' (default: 'simple')
 * - category: filter by category (optional)
 * - limit: max results (default: 50, max: 500)
 *
 * SUPABASE MIGRATION - Run this SQL in Supabase SQL editor:
 *
 * CREATE OR REPLACE FUNCTION fulltext_search(
 *   search_query TEXT,
 *   search_mode TEXT DEFAULT 'simple',
 *   filter_category TEXT DEFAULT NULL,
 *   max_results INTEGER DEFAULT 50
 * )
 * RETURNS TABLE (
 *   id UUID, title TEXT, slug TEXT, summary TEXT, category TEXT,
 *   country TEXT, city TEXT, state_province TEXT,
 *   latitude DECIMAL, longitude DECIMAL, location_name TEXT,
 *   event_date DATE, credibility TEXT, upvotes INTEGER,
 *   created_at TIMESTAMPTZ, rank REAL
 * )
 * LANGUAGE sql STABLE
 * AS $$
 *   DECLARE
 *     query_tsquery TSQUERY;
 *     processed_query TEXT;
 *   BEGIN
 *     -- Process query based on mode
 *     processed_query := CASE
 *       WHEN search_mode = 'phrase' THEN '"& || search_query || '"'
 *       WHEN search_mode = 'advanced' THEN search_query
 *       ELSE search_query -- simple mode
 *     END;
 *
 *     -- Convert query to tsquery using websearch syntax
 *     query_tsquery := websearch_to_tsquery('english', processed_query);
 *
 *     RETURN QUERY
 *     SELECT
 *       r.id, r.title, r.slug, r.summary, r.category::text,
 *       r.country, r.city, r.state_province,
 *       r.latitude, r.longitude, r.location_name,
 *       r.event_date::date, r.credibility::text, r.upvotes,
 *       r.created_at, ts_rank_cd(r.search_vector, query_tsquery) as rank
 *     FROM reports r
 *     WHERE r.status = 'approved'
 *       AND r.search_vector @@ query_tsquery
 *       AND (filter_category IS NULL OR r.category::text = filter_category)
 *     ORDER BY rank DESC, r.created_at DESC
 *     LIMIT max_results;
 *   END;
 * $$;
 *
 * GRANT EXECUTE ON FUNCTION fulltext_search TO anon, authenticated;
 *
 * Note: Ensure the reports table has a search_vector column:
 *   ALTER TABLE reports ADD COLUMN IF NOT EXISTS search_vector tsvector
 *     GENERATED ALWAYS AS (
 *       setweight(to_tsvector('english', COALESCE(title, '')), 'A') ||
 *       setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
 *       setweight(to_tsvector('english', COALESCE(description, '')), 'C') ||
 *       setweight(to_tsvector('english', COALESCE(location_name, '')), 'B')
 *     ) STORED;
 *   CREATE INDEX IF NOT EXISTS idx_reports_search_vector ON reports USING GIN(search_vector);
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

type SearchMode = 'simple' | 'phrase' | 'advanced';

interface FulltextReport {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  country: string | null;
  city: string | null;
  state_province: string | null;
  latitude: number | null;
  longitude: number | null;
  location_name: string | null;
  event_date: string | null;
  credibility: string;
  upvotes: number;
  created_at: string;
  rank: number;
}

interface FulltextResponse {
  reports?: FulltextReport[];
  count?: number;
  query?: string;
  mode?: string;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<FulltextResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { q, mode = 'simple', category, limit = '50' } = req.query;

    // Validate required parameters
    if (!q || typeof q !== 'string') {
      return res.status(400).json({
        error: 'Missing required parameter: q (search query)',
      });
    }

    const query = q.trim();
    if (query.length === 0) {
      return res.status(400).json({
        error: 'Search query cannot be empty',
      });
    }

    if (query.length > 500) {
      return res.status(400).json({
        error: 'Search query is too long (max 500 characters)',
      });
    }

    const searchMode = (mode as string).toLowerCase() as SearchMode;
    if (!['simple', 'phrase', 'advanced'].includes(searchMode)) {
      return res.status(400).json({
        error: "Invalid mode. Must be 'simple', 'phrase', or 'advanced'",
      });
    }

    const limitNum = Math.min(parseInt(limit as string) || 50, 500);

    // Create server client for admin operations
    const supabase = createServerClient();

    // Call the fulltext_search RPC function
    const { data, error } = await supabase.rpc('fulltext_search', {
      search_query: query,
      search_mode: searchMode,
      filter_category: category ? (category as string) : null,
      max_results: limitNum,
    });

    if (error) {
      console.error('[API] Fulltext search error:', error);
      return res.status(500).json({
        error: error.message || 'Failed to search reports',
      });
    }

    const reports = (data || []) as FulltextReport[];

    return res.status(200).json({
      reports,
      count: reports.length,
      query,
      mode: searchMode,
    });
  } catch (error) {
    console.error('[API] Fulltext search exception:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
