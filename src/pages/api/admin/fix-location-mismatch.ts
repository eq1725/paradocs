/**
 * POST /api/admin/fix-location-mismatch — V10.6.14
 *
 * Applies a corrected location to a single report row. Called
 * from the /admin/location-audit UI after the admin reviews a
 * mismatch and clicks 'Accept narrative'.
 *
 * Body params:
 *   id (required) — the reports.id to update
 *   city, state_province, country — the new values (typically
 *     the narrative-extracted ones, but the admin can override
 *     before submitting)
 *   latitude, longitude — optional, set to null if not provided
 *     so the map pin re-geocodes on the next render
 *
 * Auth: admin role (or ADMIN_API_KEY / CRON_SECRET fallback).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

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

  const body = (req.body || {}) as {
    id?: string
    city?: string | null
    state_province?: string | null
    country?: string | null
    latitude?: number | null
    longitude?: number | null
    location_name?: string | null
  }

  if (!body.id) return res.status(400).json({ error: 'Missing report id' })

  // Build the update payload from only the fields the admin sent.
  // Anything omitted is left alone. Send `null` explicitly to clear.
  const update: Record<string, any> = {}
  if ('city' in body) update.city = body.city
  if ('state_province' in body) update.state_province = body.state_province
  if ('country' in body) update.country = body.country
  if ('latitude' in body) update.latitude = body.latitude
  if ('longitude' in body) update.longitude = body.longitude
  if ('location_name' in body) update.location_name = body.location_name

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No fields to update' })
  }

  // V10.6.14 — when the structured location changes, the cached
  // lat/lng in metadata is also suspect. Clear it on update so
  // the next render re-geocodes from the new city/state.
  const { error: updateErr } = await (admin.from('reports') as any)
    .update(update)
    .eq('id', body.id)

  if (updateErr) {
    return res.status(500).json({ error: 'Update failed', detail: updateErr.message })
  }

  return res.status(200).json({ ok: true, id: body.id, applied: update })
}
