/**
 * GET /api/constellation/related-reports
 *
 * Surfaces unsaved reports from the global Paradocs feed that align with
 * the user's own research footprint. We build a lightweight profile from
 * the user's existing saves — top categories, top locations, top tags —
 * then query the `reports` table for recent items that match, excluding
 * anything they've already saved or logged to constellation.
 *
 * Response shape is designed to slot into the Patterns lane as a distinct
 * card type: the user sees "3 new reports match your Skinwalker research"
 * and can tap through to the report without leaving /lab.
 *
 * Auth required. Caches per-user for 5 minutes via Cache-Control; we also
 * recompute on save so the feed stays fresh.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

export interface RelatedReport {
  id: string
  slug: string
  title: string
  summary: string | null
  category: string | null
  country: string | null
  locationName: string | null
  eventDate: string | null
  credibility: number | null
  createdAt: string
  thumbnailUrl: string | null
  /** Why we surfaced this one — used by the UI to explain the match */
  matchReason: 'category' | 'location' | 'tag'
  matchLabel: string
}

export interface RelatedReportsResponse {
  /** Reports matching the user's research footprint, newest first */
  reports: RelatedReport[]
  /** What we used to build the match — so the UI can explain itself */
  profile: {
    topCategories: string[]
    topCountries: string[]
    topTags: string[]
  }
}

const MAX_REPORTS = 10
const FOOTPRINT_LOOKBACK_DAYS = 180

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  // ── Build a research footprint from the user's recent artifacts ──
  // We look at the last ~180 days of saves so new interests outweigh old ones.
  const since = new Date(Date.now() - FOOTPRINT_LOOKBACK_DAYS * 86400000).toISOString()

  const [artifactsRes, savesRes] = await Promise.all([
    supabase
      .from('constellation_artifacts')
      .select('source_type, source_platform, tags, metadata_json, external_url, created_at')
      .eq('user_id', user.id)
      .gte('created_at', since)
      .limit(200),
    supabase
      .from('saved_reports')
      .select('report_id')
      .eq('user_id', user.id)
      .limit(500),
  ])

  const artifacts = artifactsRes.data || []
  const savedReportIds = (savesRes.data || []).map(r => r.report_id).filter(Boolean)

  // Also pull reports the user has already logged via the constellation
  // "log to map" flow, so we don't re-suggest them.
  const { data: logged } = await supabase
    .from('constellation_entries')
    .select('report_id')
    .eq('user_id', user.id)
    .not('report_id', 'is', null)
    .limit(500)
  const loggedReportIds = (logged || []).map(r => r.report_id).filter(Boolean)
  const excludeReportIds = Array.from(new Set([...savedReportIds, ...loggedReportIds]))

  // Extract top tags from artifact tag arrays
  const tagCount: Record<string, number> = {}
  for (const a of artifacts) {
    for (const tag of (a.tags || []) as string[]) {
      const t = (tag || '').trim().toLowerCase()
      if (!t) continue
      tagCount[t] = (tagCount[t] || 0) + 1
    }
  }
  const topTags = Object.entries(tagCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t)

  // Extract top regions from metadata_json.location/country where present
  const countryCount: Record<string, number> = {}
  for (const a of artifacts) {
    const meta: any = a.metadata_json || {}
    const cc = (meta.country || meta.countryCode || '').toString().trim().toUpperCase()
    if (cc && cc.length === 2) countryCount[cc] = (countryCount[cc] || 0) + 1
  }
  const topCountries = Object.entries(countryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([c]) => c)

  // Derive top categories by looking at tags that match known phenomenon
  // categories. Also pull the user's explicit constellation_entries
  // categories since they're more structured.
  const { data: entries } = await supabase
    .from('constellation_entries')
    .select('category_override, report_id')
    .eq('user_id', user.id)
    .gte('created_at', since)
    .limit(300)
  const categoryCount: Record<string, number> = {}
  for (const e of entries || []) {
    const cat = (e as any).category_override
    if (cat) categoryCount[cat] = (categoryCount[cat] || 0) + 1
  }
  const topCategories = Object.entries(categoryCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([c]) => c)

  // If the user has no footprint at all, return an empty result — nothing
  // meaningful to recommend yet.
  if (topTags.length === 0 && topCategories.length === 0 && topCountries.length === 0) {
    return res.status(200).json({
      reports: [],
      profile: { topCategories: [], topCountries: [], topTags: [] },
    } as RelatedReportsResponse)
  }

  // ── Query reports matching the footprint ──
  //
  // We run three parallel queries (by category, by country, by tag via
  // phenomenon join) and merge. Each carries a `matchReason` + `matchLabel`
  // so the UI can explain why it surfaced. Ordered by event_date desc with
  // a fallback to created_at.
  const reportSelect =
    'id, slug, title, summary, category, country, location_name, event_date, credibility, created_at, thumbnail_url, primary_image_url'

  type QueryGroup = { data: any[] | null; reason: 'category' | 'location' | 'tag'; label: string }
  const queries: Promise<QueryGroup>[] = []

  for (const cat of topCategories) {
    queries.push((async () => {
      const r = await supabase
        .from('reports')
        .select(reportSelect)
        .eq('category', cat)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(8)
      return { data: r.data, reason: 'category' as const, label: cat }
    })())
  }
  for (const cc of topCountries) {
    queries.push((async () => {
      const r = await supabase
        .from('reports')
        .select(reportSelect)
        .eq('country', cc)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(6)
      return { data: r.data, reason: 'location' as const, label: cc }
    })())
  }
  for (const tag of topTags.slice(0, 4)) {
    queries.push((async () => {
      const r = await supabase
        .from('reports')
        .select(reportSelect)
        .contains('tags', [tag])
        .eq('status', 'published')
        .order('created_at', { ascending: false })
        .limit(6)
      return { data: r.data, reason: 'tag' as const, label: tag }
    })())
  }

  const results = await Promise.all(queries)

  // Merge and dedupe — keep the first match reason we saw for each id.
  const seen = new Map<string, RelatedReport>()
  for (const group of results) {
    for (const row of group.data || []) {
      if (!row?.id) continue
      if (excludeReportIds.includes(row.id)) continue
      if (seen.has(row.id)) continue
      seen.set(row.id, {
        id: row.id,
        slug: row.slug,
        title: row.title,
        summary: row.summary,
        category: row.category,
        country: row.country,
        locationName: row.location_name,
        eventDate: row.event_date,
        credibility: row.credibility,
        createdAt: row.created_at,
        thumbnailUrl: row.thumbnail_url || row.primary_image_url || null,
        matchReason: group.reason,
        matchLabel: group.label,
      })
    }
  }

  // Sort by freshness (event_date preferred, fallback created_at) then cap.
  const reports = Array.from(seen.values())
    .sort((a, b) => {
      const at = new Date(a.eventDate || a.createdAt).getTime()
      const bt = new Date(b.eventDate || b.createdAt).getTime()
      return bt - at
    })
    .slice(0, MAX_REPORTS)

  res.setHeader('Cache-Control', 'private, max-age=300, stale-while-revalidate=900')
  return res.status(200).json({
    reports,
    profile: { topCategories, topCountries, topTags },
  } as RelatedReportsResponse)
}
