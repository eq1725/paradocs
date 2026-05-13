/**
 * POST /api/admin/audit-location-mismatches — V10.6.14
 *
 * Scans the reports corpus for rows where the structured location
 * columns (city / state_province / country) disagree with the
 * location named in the actual narrative description. These
 * mismatches surfaced when the answer-line backfill kept failing
 * claim-check on reports where the DB said one state and the
 * source text said another (e.g., DB="Georgia" but narrative
 * said "New Orleans, Louisiana").
 *
 * Detection strategy:
 *   - OBERF/NDERF descriptions reliably contain an inline
 *     "Location <city>, <state>, <country>" prefix. We regex
 *     that prefix and compare to the structured columns.
 *   - When they disagree on state-name, the row is flagged.
 *
 * Output: { scanned, mismatches: [{ id, slug, db_*, narrative_* }] }
 *
 * This endpoint is READ-ONLY — it never mutates a row. Apply
 * a fix via POST /api/admin/fix-location-mismatch.
 *
 * Auth: admin role (or ADMIN_API_KEY / CRON_SECRET fallback).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export const config = {
  maxDuration: 300,
}

interface Mismatch {
  id: string
  slug: string
  title: string | null
  db_city: string | null
  db_state: string | null
  db_country: string | null
  narrative_city: string | null
  narrative_state: string | null
  narrative_country: string | null
  source_label: string | null
}

// Match OBERF/NDERF "Location <city>, <state>, <country>" or
// "Location <city>, <country>" prefix. Anchored near the start
// of the description (within the first 800 chars) so we don't
// hit later mentions of unrelated places in the narrative body.
const LOCATION_RE = /Location\s+([^,\n]+?),\s*([^,\n]+?)(?:,\s*([^,\n]+?))?\s*(?:Summary|Date Reported|Day\/Night|No\. of Witness|\n|$)/i

function extractNarrativeLocation(description: string): {
  city: string | null
  state: string | null
  country: string | null
} {
  if (!description) return { city: null, state: null, country: null }
  const head = description.slice(0, 800)
  const m = head.match(LOCATION_RE)
  if (!m) return { city: null, state: null, country: null }
  // Three-comma form ("New Orleans, Louisiana, United States"):
  // m[1]=city, m[2]=state, m[3]=country
  // Two-comma form ("Paris, France"):
  // m[1]=city, m[2]=country, m[3]=undefined
  const a = (m[1] || '').trim()
  const b = (m[2] || '').trim()
  const c = (m[3] || '').trim()
  if (c) {
    return { city: a || null, state: b || null, country: c || null }
  }
  return { city: a || null, state: null, country: b || null }
}

function normalizeForCompare(s: string | null | undefined): string {
  if (!s) return ''
  return s.toLowerCase().trim()
    .replace(/^the\s+/, '')
    .replace(/\s+/g, ' ')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // V10.6.2 — three auth paths (admin session, ADMIN_API_KEY, CRON_SECRET).
  const authHeader = req.headers.authorization || ''
  const token = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  const adminKey = req.headers['x-admin-key']
  let authed = false

  if (adminKey && adminKey === process.env.ADMIN_API_KEY) authed = true
  if (!authed && token && process.env.CRON_SECRET && token === process.env.CRON_SECRET) authed = true

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  if (!authed) {
    if (!token) return res.status(401).json({ error: 'Not authenticated' })
    const { data: userData, error: authErr } = await admin.auth.getUser(token)
    if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
    const { data: profile } = await (admin.from('profiles') as any)
      .select('role')
      .eq('id', userData.user.id)
      .single()
    if (!profile || (profile as any).role !== 'admin') {
      return res.status(403).json({ error: 'Admin only' })
    }
  }

  const body = (req.body || {}) as { limit?: number; offset?: number }
  // Hard cap at 500 rows per scan call to keep the function under
  // 5 min. Admin can paginate via the offset param.
  const limit = Math.min(Math.max(1, body.limit || 200), 500)
  const offset = Math.max(0, body.offset || 0)

  const { data: rows, error: fetchErr } = await (admin.from('reports') as any)
    .select('id, slug, title, city, state_province, country, source_label, description')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)
  if (fetchErr) return res.status(500).json({ error: 'Failed to load reports', detail: fetchErr.message })

  const mismatches: Mismatch[] = []
  let parsedCount = 0

  for (const r of (rows || [])) {
    if (!r.description) continue
    const narrative = extractNarrativeLocation(r.description)
    // Skip rows where we couldn't parse a location header — most
    // BFRO / user-submitted reports don't follow OBERF format and
    // are out of scope for this audit pass.
    if (!narrative.city && !narrative.state) continue
    parsedCount++

    const dbState = normalizeForCompare(r.state_province)
    const dbCity = normalizeForCompare(r.city)
    const dbCountry = normalizeForCompare(r.country)
    const nState = normalizeForCompare(narrative.state)
    const nCity = normalizeForCompare(narrative.city)
    const nCountry = normalizeForCompare(narrative.country)

    // Flag when EITHER state or city diverges from narrative. Skip
    // when the narrative didn't surface a state but the DB has one
    // (might just be that we couldn't parse, not a real mismatch).
    const stateMismatch = nState && dbState && nState !== dbState
    const cityMismatch = nCity && dbCity && nCity !== dbCity
    const countryMismatch = nCountry && dbCountry && nCountry !== dbCountry

    if (stateMismatch || cityMismatch || countryMismatch) {
      mismatches.push({
        id: r.id,
        slug: r.slug,
        title: r.title,
        db_city: r.city,
        db_state: r.state_province,
        db_country: r.country,
        narrative_city: narrative.city,
        narrative_state: narrative.state,
        narrative_country: narrative.country,
        source_label: r.source_label,
      })
    }
  }

  return res.status(200).json({
    scanned: (rows || []).length,
    parsed: parsedCount,
    mismatched: mismatches.length,
    mismatches,
    next_offset: offset + (rows || []).length,
  })
}
