/**
 * GET  /api/constellation/case-files     — list the user's case files
 * POST /api/constellation/case-files     — create a new case file
 *
 * A case file is a named grouping of saved artifacts — Ancestry's "family
 * file" for paranormal research. Each belongs to one user; artifacts can
 * belong to multiple case files (many-to-many via the junction table).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Preset palette offered by the CreateCaseFileModal. Accepting any hex
// on the server would let a caller pick hostile values; the allowlist
// keeps the UI and the DB aligned.
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

  if (req.method === 'GET') {
    // Pull the user's case files + artifact counts via a sub-select.
    // We use the service key here because the API already authenticated the
    // user and scopes results to user.id.
    const { data: files, error } = await supabase
      .from('constellation_case_files')
      .select(`
        id, title, description, cover_color, icon, visibility, sort_order,
        created_at, updated_at,
        artifacts:constellation_case_file_artifacts(artifact_id)
      `)
      .eq('user_id', user.id)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })

    if (error) {
      console.error('[case-files:list]', error)
      return res.status(400).json({ error: error.message })
    }

    // Flatten the nested join into a simple artifact_count per row.
    const out = (files || []).map((f: any) => ({
      id: f.id,
      title: f.title,
      description: f.description,
      cover_color: f.cover_color,
      icon: f.icon,
      visibility: f.visibility,
      sort_order: f.sort_order,
      artifact_count: Array.isArray(f.artifacts) ? f.artifacts.length : 0,
      created_at: f.created_at,
      updated_at: f.updated_at,
    }))

    return res.status(200).json({ case_files: out })
  }

  if (req.method === 'POST') {
    const { title, description, cover_color, icon } = (req.body || {}) as {
      title?: string; description?: string; cover_color?: string; icon?: string
    }

    const cleanTitle = (title || '').trim().slice(0, 120)
    if (!cleanTitle) return res.status(400).json({ error: 'title is required' })
    const cleanDescription = (description || '').trim().slice(0, 500) || null
    const cleanCover = cover_color && ALLOWED_COVER_COLORS.has(cover_color) ? cover_color : '#6366f1'
    const cleanIcon = (icon || '').trim().slice(0, 16) || 'star'

    const { data, error } = await supabase
      .from('constellation_case_files')
      .insert({
        user_id: user.id,
        title: cleanTitle,
        description: cleanDescription,
        cover_color: cleanCover,
        icon: cleanIcon,
      })
      .select()
      .single()

    if (error) {
      console.error('[case-files:create]', error)
      return res.status(400).json({ error: error.message })
    }

    return res.status(201).json({
      case_file: {
        ...data,
        artifact_count: 0,
      },
    })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
