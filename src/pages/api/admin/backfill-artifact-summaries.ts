/**
 * POST /api/admin/backfill-artifact-summaries
 *
 * V10.3 QA #3b — Backfill AI-generated summaries for external
 * artifacts that were saved before the AI-summary path landed.
 * Walks constellation_artifacts where source_type != 'paradocs_report'
 * and metadata_json.ai_summary is missing, generates a Haiku
 * summary, and updates the row.
 *
 * Body params:
 *   limit?: number    — max rows to process (default 20, hard cap 100)
 *   dryRun?: boolean  — if true, generate but don't persist
 *   userId?: string   — restrict backfill to a single user's saves
 *   onlyMissing?: boolean — if false, regenerate even rows that already
 *                           have ai_summary (default true)
 *
 * Returns: per-row report + summary counts.
 *
 * Auth: admin role (matches queue-counts pattern).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { summarizeArtifact } from '@/lib/services/artifact-summary.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  var authHeader = req.headers.authorization || ''
  var token = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(token)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  var { data: profile } = await (admin.from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!profile || (profile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  var body = (req.body || {}) as {
    limit?: number
    dryRun?: boolean
    userId?: string
    onlyMissing?: boolean
  }
  var limit = Math.min(Math.max(1, body.limit || 20), 100)
  var dryRun = !!body.dryRun
  var onlyMissing = body.onlyMissing !== false

  var query = (admin.from('constellation_artifacts') as any)
    .select('id, external_url, title, metadata_json, source_type, source_platform, user_id')
    .neq('source_type', 'paradocs_report')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (body.userId) query = query.eq('user_id', body.userId)

  var { data: rows, error: fetchErr } = await query
  if (fetchErr) {
    return res.status(500).json({ error: 'Failed to load artifacts', detail: fetchErr.message })
  }

  var processed: any[] = []
  var generated = 0
  var skipped = 0
  var failed = 0

  for (var r of (rows || [])) {
    var meta = (r.metadata_json && typeof r.metadata_json === 'object') ? { ...r.metadata_json } : {}
    if (onlyMissing && typeof meta.ai_summary === 'string' && meta.ai_summary.length > 0) {
      skipped++
      processed.push({ id: r.id, status: 'skipped_has_summary', title: r.title })
      continue
    }
    var description = typeof meta.description === 'string' ? meta.description : null
    var pageText = typeof meta.page_text === 'string' ? meta.page_text : null

    var result = await summarizeArtifact({
      url: r.external_url,
      title: r.title || '',
      metaDescription: description,
      pageText: pageText,
      sourcePlatform: r.source_platform || r.source_type,
    })

    if (!result.summary) {
      failed++
      processed.push({ id: r.id, status: 'no_summary', source: result.source, title: r.title })
      continue
    }

    if (dryRun) {
      generated++
      processed.push({ id: r.id, status: 'dry_run', summary: result.summary, title: r.title })
      continue
    }

    meta.ai_summary = result.summary
    meta.ai_summary_generated_at = new Date().toISOString()
    meta.ai_summary_source = 'haiku_v10_3_backfill'

    var { error: updateErr } = await (admin.from('constellation_artifacts') as any)
      .update({ metadata_json: meta })
      .eq('id', r.id)
    if (updateErr) {
      failed++
      processed.push({ id: r.id, status: 'update_failed', error: updateErr.message, title: r.title })
    } else {
      generated++
      processed.push({ id: r.id, status: 'updated', summary: result.summary, title: r.title })
    }
  }

  return res.status(200).json({
    scanned: rows?.length || 0,
    generated,
    skipped,
    failed,
    dry_run: dryRun,
    processed,
  })
}
