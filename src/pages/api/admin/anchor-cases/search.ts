/**
 * GET /api/admin/anchor-cases/search?type=phenomena&q=...
 *
 * V9.3 — search endpoint for the anchor-case admin editor. Returns
 * up to 20 matches by name (phenomena) or title (reports) with the
 * current anchor fields so the editor UI can show a result list.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  // Auth — same pattern as edit endpoint
  var adminKey = req.headers['x-admin-key']
  var isAuthed = adminKey === process.env.ADMIN_API_KEY
  if (!isAuthed) {
    var authHeader = req.headers.authorization
    if (!authHeader) return res.status(401).json({ error: 'Unauthorized' })
    var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    var supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    var userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    })
    var { data: userData } = await userClient.auth.getUser()
    if (!userData?.user) return res.status(401).json({ error: 'Unauthorized' })
    isAuthed = true
  }

  var rawType = (req.query.type as string) || 'phenomena'
  var type: 'phenomena' | 'reports' = rawType === 'reports' ? 'reports' : 'phenomena'
  var q = ((req.query.q as string) || '').trim()
  if (!q || q.length < 2) {
    return res.status(200).json({ results: [] })
  }

  var supabase = getSupabaseAdmin()
  var nameField = type === 'reports' ? 'title' : 'name'
  var selectFields = type === 'reports'
    ? 'id, title, slug, source_label, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension, push_copy'
    : 'id, name, slug, category, report_count, anchor_case_hook, anchor_when, anchor_where, anchor_witness, unresolved_tension, push_copy'

  var { data, error } = await supabase
    .from(type)
    .select(selectFields)
    .ilike(nameField, '%' + q + '%')
    .order(type === 'reports' ? 'created_at' : 'report_count', { ascending: false, nullsFirst: false })
    .limit(20)

  if (error) {
    console.error('[AnchorSearch] Error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ results: data || [], type: type })
}
