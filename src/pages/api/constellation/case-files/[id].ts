/**
 * GET    /api/constellation/case-files/:id          — case file detail + artifact ids
 * PATCH  /api/constellation/case-files/:id          — rename / recolor / describe
 * DELETE /api/constellation/case-files/:id          — remove the case file (keeps artifacts)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

const ALLOWED_COVER_COLORS = new Set([
  '#6366f1', '#8b5cf6', '#ec4899', '#f59e0b',
  '#10b981', '#06b6d4', '#ef4444', '#64748b',
])

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const id = req.query.id as string
  if (!id) return res.status(400).json({ error: 'id required' })

  // Ownership gate — every operation verifies user_id matches before acting.
  const { data: owned, error: ownedErr } = await supabase
    .from('constellation_case_files')
    .select('id')
    .eq('id', id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (ownedErr) {
    console.error('[case-files:ownership]', ownedErr)
    return res.status(500).json({ error: 'Could not verify ownership' })
  }
  if (!owned) return res.status(404).json({ error: 'Case file not found' })

  if (req.method === 'GET') {
    const [{ data: detail }, { data: links }] = await Promise.all([
      supabase
        .from('constellation_case_files')
        .select('*')
        .eq('id', id)
        .single(),
      supabase
        .from('constellation_case_file_artifacts')
        .select('artifact_id, added_at, sort_order')
        .eq('case_file_id', id)
        .order('sort_order', { ascending: true }),
    ])

    return res.status(200).json({
      case_file: detail,
      artifact_ids: (links || []).map((l: any) => l.artifact_id),
    })
  }

  if (req.method === 'PATCH') {
    const body = (req.body || {}) as {
      title?: string; description?: string; cover_color?: string; icon?: string; sort_order?: number
    }
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (typeof body.title === 'string') {
      const t = body.title.trim().slice(0, 120)
      if (!t) return res.status(400).json({ error: 'title cannot be empty' })
      patch.title = t
    }
    if (typeof body.description === 'string') patch.description = body.description.trim().slice(0, 500) || null
    if (typeof body.cover_color === 'string' && ALLOWED_COVER_COLORS.has(body.cover_color)) patch.cover_color = body.cover_color
    if (typeof body.icon === 'string') patch.icon = body.icon.trim().slice(0, 16) || 'star'
    if (typeof body.sort_order === 'number' && Number.isFinite(body.sort_order)) patch.sort_order = Math.trunc(body.sort_order)

    const { data, error } = await supabase
      .from('constellation_case_files')
      .update(patch)
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[case-files:update]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ case_file: data })
  }

  if (req.method === 'DELETE') {
    // ON DELETE CASCADE on the junction means the artifact links go with it.
    // The artifacts themselves (constellation_artifacts) stay put.
    const { error } = await supabase
      .from('constellation_case_files')
      .delete()
      .eq('id', id)
      .eq('user_id', user.id)

    if (error) {
      console.error('[case-files:delete]', error)
      return res.status(400).json({ error: error.message })
    }
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
