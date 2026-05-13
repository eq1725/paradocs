/**
 * POST /api/admin/backfill-witness-profile — V10.7.A.1
 *
 * Walks reports.witness_profile IS NULL (or force=true for all) and
 * runs the structured witness-profile extraction defined in
 * src/lib/services/witness-profile.service.ts. Mirrors the
 * backfill-answer-lines endpoint shape so the /admin/backfill UI
 * can drive it the same way.
 *
 * Body params:
 *   limit?: number    — max rows per call. Default 25, hard cap 100.
 *   force?: boolean   — regen rows that already have a profile.
 *                        Default false.
 *   dryRun?: boolean  — fetch + count but don't call AI. Default false.
 *
 * Returns: { scanned, generated, skipped, failed, processed[] }
 *
 * Auth: admin role (matches the rest of /api/admin/*).
 *
 * Cost: ~$0.001/row (Haiku, ~400 output tokens, single call,
 * no claim-check pass). At 10/chunk this is comfortably inside
 * the 5-min Vercel function window.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateAndSaveWitnessProfile } from '@/lib/services/witness-profile.service'

// V10.7 — match the other backfill endpoints. 5 min cap.
export const config = {
  maxDuration: 300,
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Three auth paths matching backfill-answer-lines:
  //   - admin session via Bearer token
  //   - ADMIN_API_KEY header (curl / scripts)
  //   - CRON_SECRET via Bearer (Vercel cron)
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

  const body = (req.body || {}) as { limit?: number; force?: boolean; dryRun?: boolean }
  const limit = Math.min(Math.max(1, body.limit || 25), 100)
  const force = !!body.force
  const dryRun = !!body.dryRun

  // Selection: approved reports with non-trivial description (the
  // service short-circuits when description is missing, but we'd
  // rather skip those at query time than burn a network round-trip).
  let query = (admin.from('reports') as any)
    .select('id, slug, title, witness_profile, status')
    .eq('status', 'approved')
    .not('description', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!force) query = query.is('witness_profile', null)

  const { data: rows, error: fetchErr } = await query
  if (fetchErr) {
    return res.status(500).json({ error: 'Failed to load reports', detail: fetchErr.message })
  }

  let generated = 0
  let skipped = 0
  let failed = 0
  const processed: Array<{ id: string; slug: string; status: string; result?: string | null }> = []

  for (const r of (rows || [])) {
    if (!force && r.witness_profile) {
      skipped++
      processed.push({ id: r.id, slug: r.slug, status: 'skipped_present' })
      continue
    }
    if (dryRun) {
      processed.push({ id: r.id, slug: r.slug, status: 'dry_run' })
      continue
    }
    try {
      const out = await generateAndSaveWitnessProfile(r.id)
      if (out.profile) {
        generated++
        // Short summary string — full JSON would clutter the admin log
        // and is already in ai_rewrite_audit for spot-checking.
        const p = out.profile
        const parts: string[] = []
        if (p.age_range && p.age_range !== 'unspecified') parts.push(p.age_range)
        if (p.gender && p.gender !== 'unspecified') parts.push(p.gender)
        if (p.occupation_category && p.occupation_category !== 'unspecified') parts.push(p.occupation_category)
        if (p.state_at_event && p.state_at_event !== 'unspecified') parts.push(p.state_at_event)
        const summary = parts.length ? parts.join(' · ') + ' (conf=' + (p.confidence ?? '?') + ')' : '(all unspecified)'
        processed.push({ id: r.id, slug: r.slug, status: 'generated', result: summary })
      } else {
        failed++
        processed.push({ id: r.id, slug: r.slug, status: 'no_output', result: out.reason || 'unknown' })
      }
    } catch (err: any) {
      failed++
      processed.push({ id: r.id, slug: r.slug, status: 'error', result: err?.message || String(err) })
    }
  }

  return res.status(200).json({
    scanned: (rows || []).length,
    generated,
    skipped,
    failed,
    dry_run: dryRun,
    processed,
  })
}
