/**
 * /api/admin/cost-summary — V11.17.84 unified cost tracking
 *
 * Returns aggregate AI spend over a date range, partitioned by service,
 * by model, and by day. Lets the founder see real spend at a glance
 * instead of "I think we spent $900 — what was that?".
 *
 * Query params (all optional):
 *   - from: ISO date (default = 7 days ago)
 *   - to:   ISO date (default = now)
 *   - service: filter to a single service code
 *
 * Response:
 *   {
 *     from, to,
 *     total_usd, total_calls,
 *     by_service: { [service]: { spend_usd, calls } },
 *     by_model:   { [model]:   { spend_usd, calls } },
 *     by_day:     [ { day, spend_usd, calls } ],
 *     by_status:  { [status]:  { spend_usd, calls } }
 *   }
 *
 * This endpoint reads from `paradocs_narrative_cost_log`. Every row
 * written by the unified ai-cost-logger (and the legacy
 * consolidated-narrative + consolidated-batch writers) appears here.
 *
 * V11.17.84 — covers the missing $590 in the June 1–5 reconciliation:
 * before the migration extended the schema, tag-verify / classifier /
 * location-extract / synthesized-paragraph / cluster-finding never
 * wrote rows. After deploy, all callsites populate the table, and
 * this endpoint surfaces a real per-service partition.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Lazy admin client — same pattern other admin endpoints use.
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  )
}

interface CostRow {
  service: string | null
  model: string | null
  cost_usd: number | string | null
  status: string | null
  created_at: string
}

interface Bucket {
  spend_usd: number
  calls: number
}

function addToBucket(map: Record<string, Bucket>, key: string, cost: number): void {
  if (!map[key]) map[key] = { spend_usd: 0, calls: 0 }
  map[key].spend_usd += cost
  map[key].calls += 1
}

function toNumber(v: number | string | null): number {
  if (v == null) return 0
  if (typeof v === 'number') return v
  var n = parseFloat(v)
  return isNaN(n) ? 0 : n
}

function toIsoDay(ts: string): string {
  // Truncate the timestamp to YYYY-MM-DD (UTC).
  return (ts || '').slice(0, 10)
}

function parseDateOrDefault(raw: string | string[] | undefined, fallback: Date): Date {
  if (!raw) return fallback
  var s = Array.isArray(raw) ? raw[0] : raw
  var d = new Date(s)
  if (isNaN(d.getTime())) return fallback
  return d
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  // Defaults: last 7 days, ending now.
  var now = new Date()
  var sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  var from = parseDateOrDefault(req.query.from, sevenDaysAgo)
  var to = parseDateOrDefault(req.query.to, now)
  var serviceFilter = typeof req.query.service === 'string' ? req.query.service : null

  // Guard: from must be before to.
  if (from.getTime() >= to.getTime()) {
    return res.status(400).json({ error: 'from must be before to' })
  }

  var supabase = getAdminClient()

  // Page through the rows so we don't hit the default 1000-row limit.
  // Daily volume is on the order of 100k–500k rows during mass drain
  // (one row per tag-verify call) so we must paginate.
  var PAGE_SIZE = 10000
  var allRows: CostRow[] = []
  var offset = 0
  while (true) {
    var query = supabase
      .from('paradocs_narrative_cost_log')
      .select('service, model, cost_usd, status, created_at')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('created_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1)
    if (serviceFilter) query = query.eq('service', serviceFilter)
    var { data, error } = await query
    if (error) {
      console.error('[cost-summary] supabase error:', error.message)
      return res.status(500).json({ error: 'query_failed', detail: error.message })
    }
    if (!data || data.length === 0) break
    allRows = allRows.concat(data as CostRow[])
    if (data.length < PAGE_SIZE) break
    offset += PAGE_SIZE
    // Safety cap: never page more than ~5M rows in a single request.
    if (offset > 5_000_000) break
  }

  var by_service: Record<string, Bucket> = {}
  var by_model: Record<string, Bucket> = {}
  var by_day_map: Record<string, Bucket> = {}
  var by_status: Record<string, Bucket> = {}
  var total_usd = 0
  var total_calls = 0

  for (var i = 0; i < allRows.length; i++) {
    var row = allRows[i]
    var cost = toNumber(row.cost_usd)
    var service = row.service || 'unknown'
    var model = row.model || 'unknown'
    var status = row.status || 'unknown'
    var day = toIsoDay(row.created_at)

    total_usd += cost
    total_calls += 1
    addToBucket(by_service, service, cost)
    addToBucket(by_model, model, cost)
    addToBucket(by_day_map, day, cost)
    addToBucket(by_status, status, cost)
  }

  // Convert by_day to a sorted array (most useful shape for charting).
  var by_day = Object.keys(by_day_map).sort().map(function (day) {
    return {
      day: day,
      spend_usd: Number(by_day_map[day].spend_usd.toFixed(6)),
      calls: by_day_map[day].calls,
    }
  })

  // Round buckets for cleaner JSON.
  function roundMap(m: Record<string, Bucket>): Record<string, Bucket> {
    var out: Record<string, Bucket> = {}
    Object.keys(m).forEach(function (k) {
      out[k] = { spend_usd: Number(m[k].spend_usd.toFixed(6)), calls: m[k].calls }
    })
    return out
  }

  return res.status(200).json({
    from: from.toISOString(),
    to: to.toISOString(),
    service_filter: serviceFilter,
    total_usd: Number(total_usd.toFixed(6)),
    total_calls: total_calls,
    by_service: roundMap(by_service),
    by_model: roundMap(by_model),
    by_status: roundMap(by_status),
    by_day: by_day,
  })
}
