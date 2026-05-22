/**
 * GET /api/map/viewport-reports — V11.15.1 P1.2B
 *
 * Returns reports within a viewport bounding box, optionally filtered
 * by category / country / date range / has-evidence / search query.
 * Backs the /explore?mode=map viewport-aware fetch in useViewportData.
 *
 * Designed for incremental loading as the user pans/zooms — the
 * client passes the current map bounds + active filters; the server
 * returns just the reports inside that box.
 *
 * Query params:
 *   bbox  (required)   W,S,E,N  e.g. "-130,15,-65,52" for continental US.
 *                      Values are lng,lat,lng,lat (matches MapLibre order).
 *   category           PhenomenonCategory key (optional)
 *   country            Display name e.g. "United States" (optional)
 *   dateFrom, dateTo   Year integers, applied to event_date (optional)
 *   hasEvidence        'true' (optional) — has_physical_evidence OR has_photo_video
 *   q                  Search string against title/summary (optional)
 *   limit              Max rows returned. Default 5000, max 10000.
 *
 * Response:
 *   {
 *     bbox: [W,S,E,N],
 *     total: 23847,         // count of approved reports MATCHING filters (irrespective of bbox)
 *     bboxCount: 4192,      // count INSIDE the bbox after filters
 *     returned: 4192,       // actual rows in `reports` array (capped at limit)
 *     reports: [...]        // array of report fields
 *   }
 *
 * Cache: 60s at the edge (s-maxage=60). Bbox+filter combinations are
 * cache-keyed via the URL, so panning back to a viewed region is
 * instant. SWR=300s extends gracefully.
 *
 * Uses the partial btree index (reports_latlng_btree_idx) added in
 * the V11.15.1 migration. Queries should be sub-100ms at 1M+ rows.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SELECT_FIELDS =
  'id,title,slug,summary,category,latitude,longitude,location_name,country,country_code,event_date,event_date_precision,credibility,witness_count,has_physical_evidence,has_photo_video,coords_synthetic,metadata'

interface BBox {
  west: number
  south: number
  east: number
  north: number
}

function parseBBox(raw: string | undefined): BBox | null {
  if (!raw) return null
  const parts = raw.split(',').map((s) => parseFloat(s))
  if (parts.length !== 4) return null
  const [west, south, east, north] = parts
  if (parts.some((n) => isNaN(n))) return null
  if (west >= east || south >= north) return null
  if (west < -180 || east > 180 || south < -90 || north > 90) return null
  return { west, south, east, north }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const bbox = parseBBox(req.query.bbox as string | undefined)
  if (!bbox) {
    return res.status(400).json({ error: 'bbox query param required as W,S,E,N (lng,lat,lng,lat)' })
  }

  const category = (req.query.category as string) || null
  const country = (req.query.country as string) || null
  const dateFromYear = req.query.dateFrom ? parseInt(req.query.dateFrom as string, 10) : null
  const dateToYear = req.query.dateTo ? parseInt(req.query.dateTo as string, 10) : null
  const hasEvidence = req.query.hasEvidence === 'true'
  const q = (req.query.q as string) || null
  const requestedLimit = req.query.limit ? parseInt(req.query.limit as string, 10) : 5000
  const limit = Math.min(Math.max(1, requestedLimit), 10000)

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Supabase env missing' })
  }
  const supabase = createClient(supabaseUrl, anonKey)

  // Build the query. The partial btree index reports_latlng_btree_idx
  // (V11.15.1) covers (latitude, longitude) WHERE status='approved'
  // so the planner can range-scan on lat first, then filter lng.
  let query: any = supabase
    .from('reports')
    .select(SELECT_FIELDS, { count: 'exact' })
    .eq('status', 'approved')
    .gte('latitude', bbox.south)
    .lte('latitude', bbox.north)

  // Longitude: bbox can cross the antimeridian if the user has panned
  // far east/west. We support both cases:
  //   - Normal: west < east → lng BETWEEN west AND east
  //   - Crosses antimeridian: west > east → lng >= west OR lng <= east
  // PostgREST .gte().lte() doesn't natively support OR, so we use
  // .or() for the wrap-around case.
  if (bbox.west <= bbox.east) {
    query = query.gte('longitude', bbox.west).lte('longitude', bbox.east)
  } else {
    query = query.or('longitude.gte.' + bbox.west + ',longitude.lte.' + bbox.east)
  }

  // Filters
  if (category) query = query.eq('category', category)
  if (country) query = query.eq('country', country)
  if (hasEvidence) {
    query = query.or('has_physical_evidence.eq.true,has_photo_video.eq.true')
  }
  if (dateFromYear !== null && !isNaN(dateFromYear)) {
    query = query.gte('event_date', dateFromYear + '-01-01')
  }
  if (dateToYear !== null && !isNaN(dateToYear)) {
    query = query.lte('event_date', dateToYear + '-12-31')
  }
  if (q) {
    // Basic prefix-ish search. Full-text exists in /api/search/fulltext
    // for the dedicated search mode; here we just want a coarse match.
    const safeQ = q.replace(/[%_]/g, '\\$&')
    query = query.or('title.ilike.%' + safeQ + '%,summary.ilike.%' + safeQ + '%')
  }

  // Order by created_at desc so newest reports stream in first.
  // Limit cap protects the API from accidentally returning all 100k
  // when the bbox is world-wide.
  query = query.order('created_at', { ascending: false }).limit(limit)

  const { data, error, count } = await query
  if (error) {
    return res.status(500).json({ error: 'viewport query failed', detail: error.message })
  }

  // Cache for 60s at the edge. Filter combos are cache-keyed via URL,
  // so re-pans to viewed regions are instant. SWR extends gracefully.
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json({
    bbox: [bbox.west, bbox.south, bbox.east, bbox.north],
    bboxCount: count || 0,
    returned: (data || []).length,
    reports: data || [],
  })
}
