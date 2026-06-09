// V11.18.x — Extended per UI_SHIPPING_ROADMAP_V2 Sprint 1A additions.
//
// Public, unauthenticated endpoint. Returns the catalogued-accounts
// count + phenomena_tracked + active_users_30d (best-effort) and a
// pre-computed display string ("200,000") rounded DOWN to the nearest
// 1,000. The CorpusStatEyebrow component reads this on mount.
//
// Back-compat: the legacy keys (total, thisMonth, countries) are
// retained alongside the new keys so any existing consumers keep
// working.
//
// Cache: edge + CDN 5min, stale-while-revalidate 1h.

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Use service role for server-side queries (no row limit)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function formatDisplayCount(n: number): string {
  // Round DOWN to nearest 1,000 per Sprint 1A spec ("200,000" not
  // "200,342"). Below 1,000 we just emit the raw integer.
  if (!n || n < 1000) return String(Math.max(0, Math.floor(n || 0)))
  var floored = Math.floor(n / 1000) * 1000
  return floored.toLocaleString('en-US')
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    // ── Catalogued accounts = COUNT(*) FROM reports WHERE status='approved' ──
    let total = 0
    try {
      const { data: countData } = await supabaseAdmin
        .rpc('get_approved_reports_count')
        .single()
      if (countData && typeof (countData as any).count !== 'undefined') {
        total = Number((countData as any).count)
      }
    } catch {
      // RPC may not exist — fall back to head count
    }
    if (!total) {
      try {
        const { count } = await supabaseAdmin
          .from('reports')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'approved')
        total = count || 0
      } catch {
        total = 0
      }
    }

    // ── Phenomena tracked = COUNT(*) FROM phenomena WHERE status='active' ──
    let phenomenaTracked = 0
    try {
      const { count } = await supabaseAdmin
        .from('phenomena')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
      phenomenaTracked = count || 0
    } catch {
      phenomenaTracked = 0
    }

    // ── Active users 30d ──
    // V11.18.x — best-effort. We don't have a single canonical activity
    // table in this codebase; the closest signal is lab_hint_impressions
    // (per-user user_id rows written whenever the Hints rail renders).
    // We count distinct user_ids over the last 30 days. If that table
    // isn't yet populated or the query fails, we return 0 and the
    // eyebrow simply omits the figure. Documented for the operator
    // runbook.
    let activeUsers30d = 0
    try {
      const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
      const { data: rows } = await supabaseAdmin
        .from('lab_hint_impressions')
        .select('user_id')
        .gte('shown_at', thirtyDaysAgoIso)
        .limit(50000)
      if (rows && Array.isArray(rows)) {
        const set = new Set<string>()
        for (const r of rows) {
          const uid = (r as any).user_id
          if (uid && typeof uid === 'string') set.add(uid)
        }
        activeUsers30d = set.size
      }
    } catch {
      activeUsers30d = 0
    }

    // ── Legacy compat: monthly + unique countries ──────────────────
    const thisMonth = new Date()
    thisMonth.setUTCDate(1)
    thisMonth.setUTCHours(0, 0, 0, 0)

    let monthly = 0
    try {
      const { data: recentData, error: monthlyError } = await supabaseAdmin
        .from('reports')
        .select('id')
        .eq('status', 'approved')
        .gte('created_at', thisMonth.toISOString())
        .limit(10000)
      if (!monthlyError && recentData) {
        monthly = recentData.length
      }
    } catch {
      monthly = 0
    }

    let uniqueCountries = 0
    try {
      const { data: countryData, error: countryError } = await supabaseAdmin
        .rpc('get_unique_countries_count')
        .single()
      if (!countryError && countryData && typeof (countryData as any).count !== 'undefined') {
        uniqueCountries = Number((countryData as any).count)
      }
    } catch {
      // RPC may not exist
    }
    if (!uniqueCountries) {
      try {
        const { data: countries } = await supabaseAdmin
          .from('reports')
          .select('country')
          .eq('status', 'approved')
          .not('country', 'is', null)
          .limit(10000)
        const uniqueSet = new Set(
          (countries || []).map(function (r: any) { return r.country }).filter(Boolean)
        )
        uniqueCountries = uniqueSet.size
      } catch {
        uniqueCountries = 0
      }
    }

    // ── Cache: edge 5min, CDN 5min, SWR 1h ─────────────────────────
    res.setHeader(
      'Cache-Control',
      's-maxage=300, stale-while-revalidate=3600'
    )

    return res.status(200).json({
      // V11.18.x Sprint 1A spec ───────────────────────────────────
      catalogued_accounts: total || 0,
      catalogued_accounts_display: formatDisplayCount(total || 0) + '+',
      active_users_30d: activeUsers30d,
      phenomena_tracked: phenomenaTracked,
      last_updated: new Date().toISOString(),
      // Legacy back-compat ────────────────────────────────────────
      total: total || 0,
      thisMonth: monthly || 0,
      countries: uniqueCountries,
    })
  } catch (error) {
    console.error('Stats API error:', error)
    return res.status(500).json({ error: 'Failed to fetch stats' })
  }
}
