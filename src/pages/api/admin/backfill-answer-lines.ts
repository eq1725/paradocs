/**
 * POST /api/admin/backfill-answer-lines — V10.5
 *
 * Walks reports.answer_line IS NULL (or force=true for all) and
 * generates a one-sentence faithful paraphrase through the V10.4
 * unified rewrite pipeline (hedge voice + claim-citation +
 * audit log). Bounded per-call so the cron / admin can chunk
 * through the corpus without timing out.
 *
 * Body params:
 *   limit?: number    — max rows per call. Default 25, hard cap 100.
 *   force?: boolean   — if true, regen even rows that already have
 *                        answer_line. Default false.
 *   dryRun?: boolean  — generate but don't persist. Default false.
 *
 * Returns: { scanned, generated, skipped, failed, processed[] }
 *
 * Auth: admin role (matches the rest of /api/admin/*).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { generateAndSaveAnswerLine } from '@/lib/services/answer-line.service'

// V10.6.3 — bump function timeout to 5 min. Answer-line calls
// are short (~1-2s) so 25 rows usually finishes inside 60s, but
// a single slow Anthropic response can blow past that. Better to
// have headroom than have Vercel kill the loop mid-way.
export const config = {
  maxDuration: 300,
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

  const body = (req.body || {}) as { limit?: number; force?: boolean; dryRun?: boolean }
  const limit = Math.min(Math.max(1, body.limit || 25), 100)
  const force = !!body.force
  const dryRun = !!body.dryRun

  let query = (admin.from('reports') as any)
    .select('id, slug, title, answer_line, status')
    .eq('status', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (!force) query = query.is('answer_line', null)

  const { data: rows, error: fetchErr } = await query
  if (fetchErr) return res.status(500).json({ error: 'Failed to load reports', detail: fetchErr.message })

  let generated = 0
  let skipped = 0
  let failed = 0
  const processed: Array<{ id: string; slug: string; status: string; result?: string | null }> = []

  for (const r of (rows || [])) {
    if (!force && r.answer_line) {
      skipped++
      processed.push({ id: r.id, slug: r.slug, status: 'skipped_present' })
      continue
    }
    if (dryRun) {
      processed.push({ id: r.id, slug: r.slug, status: 'dry_run' })
      continue
    }
    try {
      const text = await generateAndSaveAnswerLine(r.id)
      if (text) {
        generated++
        processed.push({ id: r.id, slug: r.slug, status: 'generated', result: text })
      } else {
        failed++
        processed.push({ id: r.id, slug: r.slug, status: 'no_output' })
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
