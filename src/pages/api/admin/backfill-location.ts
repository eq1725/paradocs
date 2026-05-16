/**
 * POST /api/admin/backfill-location — V10.8.C follow-up
 *
 * Walks the reports table and re-runs `normalizeLocation` against every
 * row. Backfills the V10.8.C contract onto existing data:
 *
 *   - country folds to canonical name + country_code (ISO 3166-1 alpha-2)
 *   - lat/lng filled from MapTiler (city + state) OR state centroid OR
 *     country centroid (in that priority order)
 *   - coords_synthetic flagged true when coords came from a centroid
 *
 * Idempotent: re-running yields the same result. Rows whose normalized
 * output matches the current row are counted as 'skipped'.
 *
 * Selection: defaults to rows missing country_code OR missing lat/lng
 * (the V10.8.C signal that normalization hasn't run yet). Pass
 * force=true to re-run against every approved report regardless.
 *
 * Body params:
 *   limit?: number    — max rows per call (default 50, hard cap 200)
 *   force?: boolean   — re-normalize rows that already have country_code
 *   dryRun?: boolean  — fetch + compute but don't write
 *   slug?: string     — restrict to a single report (for spot-fixes)
 *
 * Returns: { scanned, updated, skipped, failed, processed[] }
 *
 * Auth: admin session via Bearer token OR ADMIN_API_KEY header OR
 *       CRON_SECRET via Bearer (matches backfill-witness-profile).
 *
 * Cost: zero per row when the result is centroid-only (no MapTiler call).
 * city+state combinations hit MapTiler — free with the flex plan, cached
 * via geocode_cache after the first lookup.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import {
  normalizeLocation,
  maptilerGeocoder,
  makeSupabaseGeocodeCache,
  NormalizedLocation,
} from '@/lib/ingestion/utils/normalize-location'

export const config = {
  maxDuration: 300,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ── Auth (matches backfill-witness-profile) ────────────────────
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
    limit?: number
    force?: boolean
    dryRun?: boolean
    slug?: string
  }
  const limit = Math.min(Math.max(1, body.limit || 50), 200)
  const force = !!body.force
  const dryRun = !!body.dryRun
  const slug = body.slug ? String(body.slug) : null

  // ── Row selection ──────────────────────────────────────────────
  let query = (admin.from('reports') as any)
    .select('id, slug, title, city, state_province, country, country_code, location_name, latitude, longitude, coords_synthetic, metadata, status')

  if (slug) {
    query = query.eq('slug', slug)
  } else {
    query = query.eq('status', 'approved')
    if (!force) {
      // Default selection: rows where V10.8.C clearly hasn't run.
      // country_code IS NULL is the single best "untouched" signal.
      query = query.is('country_code', null)
    }
  }
  query = query.order('created_at', { ascending: false }).limit(limit)

  const { data: rows, error: fetchErr } = await query
  if (fetchErr) {
    return res.status(500).json({ error: 'Failed to load reports', detail: fetchErr.message })
  }

  const geocoder = (process.env.NEXT_PUBLIC_MAPTILER_KEY || process.env.MAPTILER_API_KEY)
    ? maptilerGeocoder
    : undefined
  const cache = makeSupabaseGeocodeCache(admin)

  let updated = 0
  let skipped = 0
  let failed = 0
  const processed: Array<{
    id: string
    slug: string
    status: string
    before?: Record<string, unknown>
    after?: Record<string, unknown>
    detail?: string
  }> = []

  for (const r of (rows || [])) {
    try {
      const before = {
        country: r.country,
        country_code: r.country_code,
        state_province: r.state_province,
        latitude: r.latitude,
        longitude: r.longitude,
        coords_synthetic: r.coords_synthetic,
        location_name: r.location_name,
      }

      const normalized = await normalizeLocation(
        {
          city: r.city || null,
          state_province: r.state_province || null,
          country: r.country || null,
          country_code: r.country_code || null,
          location_name: r.location_name || null,
          latitude: r.latitude ?? null,
          longitude: r.longitude ?? null,
        },
        {
          geocoder: geocoder ? 'maptiler' : 'none',
          geocodeFn: geocoder,
          cache,
        },
      )

      // Idempotency check — skip if the normalized result matches what's
      // already in the DB. Float comparison uses a tiny epsilon.
      const epsilon = 0.0001
      const sameCoords =
        nullSafeEq(normalized.latitude, before.latitude, epsilon) &&
        nullSafeEq(normalized.longitude, before.longitude, epsilon)
      const unchanged =
        sameCoords &&
        normalized.country === before.country &&
        normalized.country_code === before.country_code &&
        normalized.state_province === before.state_province &&
        normalized.coords_synthetic === before.coords_synthetic &&
        normalized.location_name === before.location_name

      if (unchanged) {
        skipped++
        processed.push({ id: r.id, slug: r.slug, status: 'skipped_unchanged' })
        continue
      }

      if (dryRun) {
        processed.push({ id: r.id, slug: r.slug, status: 'dry_run', before, after: normalized as any })
        continue
      }

      // Merge location_precision into metadata (legacy storage).
      const mergedMeta = Object.assign({}, r.metadata || {}, {
        location_precision: normalized.location_precision,
      })

      const updatePayload: Record<string, unknown> = {
        city: normalized.city,
        state_province: normalized.state_province,
        country: normalized.country,
        country_code: normalized.country_code,
        location_name: normalized.location_name,
        latitude: normalized.latitude,
        longitude: normalized.longitude,
        coords_synthetic: normalized.coords_synthetic,
        metadata: mergedMeta,
        updated_at: new Date().toISOString(),
      }

      const { error: updateErr } = await (admin.from('reports') as any)
        .update(updatePayload)
        .eq('id', r.id)

      if (updateErr) {
        failed++
        processed.push({ id: r.id, slug: r.slug, status: 'update_failed', detail: updateErr.message })
        continue
      }

      updated++
      processed.push({ id: r.id, slug: r.slug, status: 'updated', before, after: normalized as any })
    } catch (e: any) {
      failed++
      processed.push({ id: r.id, slug: r.slug, status: 'exception', detail: e?.message || String(e) })
    }
  }

  return res.status(200).json({
    scanned: (rows || []).length,
    updated,
    skipped,
    failed,
    geocoder: geocoder ? 'maptiler' : 'centroid-only',
    dry_run: dryRun,
    processed,
  })
}

function nullSafeEq(a: number | null, b: number | null, eps: number): boolean {
  if (a === null && b === null) return true
  if (a === null || b === null) return false
  return Math.abs(a - b) < eps
}
