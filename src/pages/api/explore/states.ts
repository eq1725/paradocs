/**
 * API: GET /api/explore/states?country=United+States
 *
 * Returns the list of distinct state_province values for approved
 * reports in a given country, sorted by report count descending. Used
 * by the /explore Browse view's conditional State/Province filter
 * (V11.17.39 — Bug #2).
 *
 * Response shape:
 *   { states: Array<{ state: string, count: number }> }
 *
 * Returns empty array if no country provided or if the country has
 * fewer than 2 distinct subdivisions (single-state countries don't
 * need a filter — there's nothing to choose between).
 *
 * Implementation note: Supabase JS client doesn't expose GROUP BY
 * directly, so we pull the state_province column for all approved
 * reports in the country and dedupe + count in JS. For the largest
 * single-country bucket (US ~50k approved reports as of 2026-05),
 * this is ~1-2MB transfer + ~100ms processing — acceptable for an
 * on-filter-change fetch that's cached on the client.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const country = (req.query.country as string || '').trim()
  if (!country) return res.status(200).json({ states: [] })

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Page through to handle countries with > 1000 reports. We cap at
    // 50k rows total — well above the ~30k for the biggest single
    // country (US) — to keep memory + latency bounded.
    const MAX_ROWS = 50000
    const PAGE_SIZE = 1000
    const counts: Record<string, number> = {}
    let offset = 0
    while (offset < MAX_ROWS) {
      const { data, error } = await supabase
        .from('reports')
        .select('state_province')
        .eq('status', 'approved')
        .eq('country', country)
        .not('state_province', 'is', null)
        .range(offset, offset + PAGE_SIZE - 1)
      if (error) return res.status(500).json({ error: error.message })
      if (!data || data.length === 0) break
      for (const row of data as any[]) {
        const s = (row.state_province || '').toString().trim()
        if (!s) continue
        counts[s] = (counts[s] || 0) + 1
      }
      if (data.length < PAGE_SIZE) break
      offset += PAGE_SIZE
    }

    const states = Object.entries(counts)
      .map(([state, count]) => ({ state, count }))
      .sort((a, b) => (b.count - a.count) || a.state.localeCompare(b.state))

    // If only 0 or 1 distinct subdivision, return empty — the filter
    // dropdown should not render (nothing to choose between).
    if (states.length < 2) return res.status(200).json({ states: [] })

    // Set cache headers — state list per country is stable for hours.
    // Edge cache so we don't re-aggregate on every keystroke.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400')
    return res.status(200).json({ states })
  } catch (e: any) {
    console.error('[api/explore/states] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}
