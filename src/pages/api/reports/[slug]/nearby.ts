/**
 * API: GET /api/reports/[slug]/nearby — V10.7.B.0 refactor
 *
 * Returns approved reports within a radius of the focal report.
 * As of V10.7.B.0, the haversine math lives in a Postgres RPC
 * (nearby_reports_within_km) so this endpoint and getStaticProps
 * for /report/[slug] both call the same function — DRY math, one
 * place to optimize when we add PostGIS later.
 *
 * Query params:
 *   radius  — kilometers, default 50, clamped 1..500
 *   limit   — max rows, default 10, clamped 1..50
 *
 * Returns: { nearby: [{ id, slug, title, category, latitude,
 *           longitude, distance_km, location_name?, event_date?,
 *           summary? }], total, center, radius_km }
 *
 * Per-row enrichment (location_name, event_date, summary) is done
 * client-side after the RPC returns the cheap-to-fetch identity
 * columns — keeps the RPC interface narrow and stable.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '@/lib/supabase'

interface RpcRow {
  id: string
  slug: string
  title: string
  category: string | null
  latitude: number | string
  longitude: number | string
  distance_km: number | string
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { slug, radius = '50', limit = '10' } = req.query
  if (!slug || typeof slug !== 'string') {
    return res.status(400).json({ error: 'Report slug is required' })
  }

  const radiusKm = Math.min(Math.max(parseFloat(radius as string) || 50, 1), 500)
  const maxLimit = Math.min(Math.max(parseInt(limit as string) || 10, 1), 50)

  try {
    // Resolve slug → id + grab focal coords for the response center.
    const { data: sourceReport, error: reportError } = (await (supabase.from('reports') as any)
      .select('id, latitude, longitude')
      .eq('slug', slug)
      .eq('status', 'approved')
      .single()) as { data: any; error: any }

    if (reportError || !sourceReport) {
      return res.status(404).json({ error: 'Report not found' })
    }
    if (!sourceReport.latitude || !sourceReport.longitude) {
      return res.status(200).json({
        nearby: [],
        total: 0,
        message: 'Source report has no location data',
      })
    }

    // The math lives in Postgres now.
    const { data: rpcRows, error: rpcError } = await (supabase as any).rpc(
      'nearby_reports_within_km',
      {
        p_report_id: sourceReport.id,
        p_radius_km: radiusKm,
        p_limit: maxLimit,
      },
    )

    if (rpcError) {
      console.error('[nearby] RPC error:', rpcError)
      return res.status(500).json({ error: 'Failed to fetch nearby reports' })
    }

    const rows = (rpcRows || []) as RpcRow[]
    if (rows.length === 0) {
      return res.status(200).json({
        nearby: [],
        total: 0,
        center: {
          latitude: sourceReport.latitude,
          longitude: sourceReport.longitude,
        },
        radius_km: radiusKm,
      })
    }

    // Enrich with display fields not returned by the RPC. Cheap
    // because we already have the ids and the IN list is tiny
    // (capped at maxLimit which is itself capped at 50).
    const ids = rows.map(r => r.id)
    const { data: enrich } = (await (supabase.from('reports') as any)
      .select('id, location_name, event_date, summary')
      .in('id', ids)) as { data: any[] | null }

    const enrichById = new Map<string, any>(
      (enrich || []).map((e: any) => [e.id, e])
    )

    const out = rows.map(r => {
      const meta = enrichById.get(r.id) || {}
      return {
        id: r.id,
        slug: r.slug,
        title: r.title,
        category: r.category,
        latitude: typeof r.latitude === 'string' ? parseFloat(r.latitude) : r.latitude,
        longitude: typeof r.longitude === 'string' ? parseFloat(r.longitude) : r.longitude,
        distance_km: Math.round(
          (typeof r.distance_km === 'string' ? parseFloat(r.distance_km) : r.distance_km) * 10,
        ) / 10,
        location_name: meta.location_name || null,
        event_date: meta.event_date || null,
        summary: meta.summary || null,
      }
    })

    return res.status(200).json({
      nearby: out,
      total: out.length,
      center: {
        latitude: sourceReport.latitude,
        longitude: sourceReport.longitude,
      },
      radius_km: radiusKm,
    })
  } catch (error) {
    console.error('Nearby reports API error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
