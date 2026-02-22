/**
 * API: GET /api/search/proximity
 * Find reports within a geographic radius using PostGIS
 *
 * SUPABASE MIGRATION - Run this SQL in Supabase SQL editor:
 *
 * CREATE OR REPLACE FUNCTION nearby_reports(
 *   search_lat DOUBLE PRECISION,
 *   search_lng DOUBLE PRECISION,
 *   radius_miles DOUBLE PRECISION DEFAULT 50,
 *   filter_category TEXT DEFAULT NULL,
 *   max_results INTEGER DEFAULT 100
 * )
 * RETURNS TABLE (
 *   id UUID, title TEXT, slug TEXT, summary TEXT, category TEXT,
 *   latitude DECIMAL, longitude DECIMAL, location_name TEXT,
 *   event_date DATE, credibility TEXT, witness_count INTEGER,
 *   distance_miles DOUBLE PRECISION
 * )
 * LANGUAGE sql STABLE
 * AS $$
 *   SELECT
 *     r.id, r.title, r.slug, r.summary, r.category::text,
 *     r.latitude, r.longitude, r.location_name,
 *     r.event_date::date, r.credibility::text, r.witness_count,
 *     ST_Distance(r.coordinates, ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography) / 1609.34 as distance_miles
 *   FROM reports r
 *   WHERE r.status = 'approved'
 *     AND r.coordinates IS NOT NULL
 *     AND ST_DWithin(r.coordinates, ST_SetSRID(ST_MakePoint(search_lng, search_lat), 4326)::geography, radius_miles * 1609.34)
 *     AND (filter_category IS NULL OR r.category::text = filter_category)
 *   ORDER BY distance_miles ASC
 *   LIMIT max_results;
 * $$;
 *
 * GRANT EXECUTE ON FUNCTION nearby_reports TO anon, authenticated;
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { createServerClient } from '@/lib/supabase';

interface ProximityReport {
  id: string;
  title: string;
  slug: string;
  summary: string;
  category: string;
  latitude: number;
  longitude: number;
  location_name: string | null;
  event_date: string | null;
  credibility: string;
  witness_count: number;
  distance_miles: number;
}

interface ProximityResponse {
  reports?: ProximityReport[];
  count?: number;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ProximityResponse>
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { lat, lng, radius, category, limit = '100' } = req.query;

    // Validate required parameters
    if (!lat || !lng || !radius) {
      return res.status(400).json({
        error: 'Missing required parameters: lat, lng, radius',
      });
    }

    const latitude = parseFloat(lat as string);
    const longitude = parseFloat(lng as string);
    const radiusMiles = parseFloat(radius as string);
    const limitNum = Math.min(parseInt(limit as string) || 100, 1000);

    // Validate parameter ranges
    if (isNaN(latitude) || latitude < -90 || latitude > 90) {
      return res.status(400).json({ error: 'Invalid latitude' });
    }
    if (isNaN(longitude) || longitude < -180 || longitude > 180) {
      return res.status(400).json({ error: 'Invalid longitude' });
    }
    if (isNaN(radiusMiles) || radiusMiles <= 0 || radiusMiles > 25000) {
      return res.status(400).json({ error: 'Invalid radius (must be > 0 and <= 25000 miles)' });
    }

    // Create server client for admin operations
    const supabase = createServerClient();

    // Call the nearby_reports RPC function
    const { data, error } = await supabase.rpc('nearby_reports', {
      search_lat: latitude,
      search_lng: longitude,
      radius_miles: radiusMiles,
      filter_category: category ? (category as string) : null,
      max_results: limitNum,
    });

    if (error) {
      console.error('[API] Proximity search error:', error);
      return res.status(500).json({
        error: error.message || 'Failed to search nearby reports',
      });
    }

    const reports = (data || []) as ProximityReport[];

    return res.status(200).json({
      reports,
      count: reports.length,
    });
  } catch (error) {
    console.error('[API] Proximity search exception:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
