/**
 * GET /api/map/region-counts — V10.9.A
 *
 * Returns aggregated counts of synthetic-coord reports for the
 * explore-map "Region totals" panel + future choropleth layer.
 *
 * Query params:
 *   level?: 'country' | 'state'  (default 'country')
 *   country?: ISO 3166-1 alpha-2 (required when level=state)
 *   category?: filter by phenomenon category
 *
 * Response shape:
 *   {
 *     level: 'country',
 *     total: 57,
 *     buckets: [
 *       { code: 'US', name: 'United States', total: 56, by_category: {...} },
 *       { code: 'GB', name: 'United Kingdom', total: 1, by_category: {...} },
 *       ...
 *     ]
 *   }
 *
 * Reads from the report_region_counts materialized view (refresh
 * nightly via cron OR after every ingestion batch). Public endpoint
 * (no auth) — same access policy as the existing public /api/reports
 * surface.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const level = (req.query.level as string) || 'country'
  if (level !== 'country' && level !== 'state') {
    return res.status(400).json({ error: 'level must be "country" or "state"' })
  }
  const countryFilter = (req.query.country as string) || null
  const categoryFilter = (req.query.category as string) || null

  if (level === 'state' && !countryFilter) {
    return res.status(400).json({ error: 'country query param required when level=state' })
  }

  // Use anon key — the view is public (aggregated counts, no PII).
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!supabaseUrl || !anonKey) {
    return res.status(500).json({ error: 'Supabase env missing' })
  }
  const supabase = createClient(supabaseUrl, anonKey)

  let q = (supabase.from('report_region_counts') as any)
    .select('country_code, country, state_province, category, report_count')
  if (countryFilter) q = q.eq('country_code', countryFilter.toUpperCase())
  if (categoryFilter) q = q.eq('category', categoryFilter)

  const { data: rows, error } = await q
  if (error) {
    return res.status(500).json({ error: 'Region count query failed', detail: error.message })
  }

  // Roll up by the requested level. The view stores
  // (country, state, category) tuples; we aggregate further to
  // either (country) or (country, state) buckets here.
  const buckets = new Map<string, {
    code: string
    name: string
    state?: string
    total: number
    by_category: Record<string, number>
  }>()

  for (const row of (rows || [])) {
    const code = row.country_code
    const state = row.state_province
    const name = row.country
    const cat = row.category
    const count = Number(row.report_count) || 0

    const key = level === 'country' ? code : (code + '|' + (state || ''))
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = {
        code,
        name,
        state: level === 'state' ? (state || null as any) : undefined,
        total: 0,
        by_category: {},
      }
      buckets.set(key, bucket)
    }
    bucket.total += count
    bucket.by_category[cat] = (bucket.by_category[cat] || 0) + count
  }

  const bucketArray = Array.from(buckets.values()).sort((a, b) => b.total - a.total)
  const total = bucketArray.reduce((acc, b) => acc + b.total, 0)

  // Cache for 5 minutes at the edge — the underlying view refreshes
  // at most every ingest batch, so this saturates fine.
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600')
  return res.status(200).json({
    level,
    country_filter: countryFilter,
    category_filter: categoryFilter,
    total,
    buckets: bucketArray,
  })
}
