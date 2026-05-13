/**
 * POST /api/admin/backfill-analysis — V10.6
 *
 * Walks reports whose paradocs_assessment is missing the new
 * V10.6 frames + open_questions shape and regenerates the full
 * Paradocs Analysis through the new prompt. Lets us refresh the
 * existing corpus without re-ingesting every report.
 *
 * Body params:
 *   limit?: number   — max rows per call. Default 25, hard cap 100.
 *   force?: boolean  — regenerate even reports that already have
 *                       frames in their assessment. Default false.
 *   dryRun?: boolean — fetch + count but don't call the AI. Default false.
 *
 * Returns: { scanned, generated, skipped, failed, processed[] }
 *
 * Auth: admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateAndSaveParadocsAnalysis } from '@/lib/services/paradocs-analysis.service'

// V10.6.3 — bump function timeout to 5 min. Each analysis call
// can take 10–20s (longer w/ retry on the fallback model), and
// the loop does up to 25 rows serially. Without this, Vercel
// defaults to ~60s and kills the function mid-loop.
export const config = {
  maxDuration: 300,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // V10.6.2 — accept three auth paths so the same endpoint
  // works from (1) the admin UI session token, (2) curl with
  // ADMIN_API_KEY, (3) Vercel cron with CRON_SECRET. Mirrors
  // the pattern used by /api/cron/refresh-global-save-counts.
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

  const body = (req.body || {}) as { limit?: number; force?: boolean; dryRun?: boolean; slug?: string }
  const limit = Math.min(Math.max(1, body.limit || 25), 100)
  const force = !!body.force
  const dryRun = !!body.dryRun
  const slug = typeof body.slug === 'string' && body.slug.trim().length > 0
    ? body.slug.trim()
    : null

  // V10.7.B.4.4 — When slug is provided, target that single report
  // for regen. Bypasses the limit/force gating since the admin is
  // explicitly asking. Useful for "this one report's narrative came
  // back null, please retry it" cases without walking the full corpus.
  let rowsQuery = (admin.from('reports') as any)
    .select('id, slug, title, paradocs_assessment')
    .eq('status', 'approved')
  if (slug) {
    rowsQuery = rowsQuery.eq('slug', slug).limit(1)
  } else {
    rowsQuery = rowsQuery.order('created_at', { ascending: false }).limit(force ? limit : limit * 4)
  }
  const { data: rows, error: fetchErr } = await rowsQuery
  if (fetchErr) return res.status(500).json({ error: 'Failed to load reports', detail: fetchErr.message })

  const candidates: any[] = []
  for (const r of (rows || [])) {
    if (candidates.length >= limit) break
    // V10.7.B.4.4 — when slug is targeted OR force is set, always
    // include the row. Without slug + without force, only include
    // rows missing frames (the "still pending" cohort).
    if (slug || force) {
      candidates.push(r)
      continue
    }
    const a = r.paradocs_assessment || {}
    const hasFrames = Array.isArray(a.frames) && a.frames.length > 0
    if (!hasFrames) candidates.push(r)
  }

  let generated = 0
  let skipped = 0
  let failed = 0
  const processed: Array<{ id: string; slug: string; status: string; error?: string }> = []

  for (const r of candidates) {
    if (dryRun) {
      processed.push({ id: r.id, slug: r.slug, status: 'dry_run' })
      continue
    }
    try {
      const ok = await generateAndSaveParadocsAnalysis(r.id)
      if (ok) {
        generated++
        processed.push({ id: r.id, slug: r.slug, status: 'generated' })
      } else {
        failed++
        processed.push({ id: r.id, slug: r.slug, status: 'no_output' })
      }
    } catch (err: any) {
      failed++
      processed.push({ id: r.id, slug: r.slug, status: 'error', error: err?.message || String(err) })
    }
  }

  return res.status(200).json({
    scanned: candidates.length,
    generated,
    skipped,
    failed,
    dry_run: dryRun,
    processed,
  })
}
