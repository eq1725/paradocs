/**
 * PATCH  /api/constellation/artifacts/:id  — update user_note / verdict / tags / title
 * DELETE /api/constellation/artifacts/:id  — remove (owner only)
 *
 * Scoped to the authenticated user's own artifacts. Used by the NoteEditorModal
 * to save note edits and by list row delete affordances (future work).
 *
 * Paradocs-report-linked saves live in constellation_entries; callers should
 * route those edits through /api/constellation/entries (POST upserts by
 * user_id + report_id). This endpoint is only for externals (pasted URLs).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const VALID_VERDICTS = new Set(['compelling', 'inconclusive', 'skeptical', 'needs_info'])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'id required' })

  // Verify ownership before any mutation.
  const { data: owned } = await supabase
    .from('constellation_artifacts')
    .select('id, report_id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!owned) return res.status(404).json({ error: 'Artifact not found' })

  // Guardrail: Paradocs-report-linked rows (report_id set) should be updated
  // via /api/constellation/entries so the entries table stays in sync. Reject
  // here to prevent drift between the two tables.
  if (owned.report_id) {
    return res.status(400).json({
      error: 'This is a Paradocs report save. Use the entries endpoint to update it.',
    })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as {
      user_note?: string
      verdict?: string
      tags?: string[]
      title?: string
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.user_note === 'string') {
      patch.user_note = body.user_note.slice(0, 2000)
    }
    if (typeof body.verdict === 'string' && VALID_VERDICTS.has(body.verdict)) {
      patch.verdict = body.verdict
    }
    if (Array.isArray(body.tags)) {
      patch.tags = body.tags
        .filter(t => typeof t === 'string' && t.length > 0)
        .map(t => t.trim().toLowerCase().replace(/^#/, ''))
        .filter((t: string, i: number, arr: string[]) => t.length > 0 && arr.indexOf(t) === i)
        .slice(0, 20)
    }
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 400)
      if (!t) return res.status(400).json({ error: 'title cannot be empty' })
      patch.title = t
    }

    const { data, error } = await supabase
      .from('constellation_artifacts')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[artifacts:update]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ artifact: data })
  }

  if (req.method === 'DELETE') {
    const { error } = await supabase
      .from('constellation_artifacts')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[artifacts:delete]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
