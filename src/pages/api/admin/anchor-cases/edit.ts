/**
 * POST /api/admin/anchor-cases/edit
 *
 * V9.3 — manual editorial save for anchor case fields. Lets the
 * editorial team override the LLM-generated content for top
 * phenomena (or any report) without going through the regenerate
 * endpoint.
 *
 * Body:
 *   {
 *     type: 'phenomena' | 'reports',
 *     id: UUID,
 *     anchor_case_hook?: string,
 *     anchor_when?: string,
 *     anchor_where?: string,
 *     anchor_witness?: string,
 *     unresolved_tension?: string | null,
 *     push_copy?: string
 *   }
 *
 * Only fields supplied in the body are updated; omitted fields stay
 * unchanged. Set unresolved_tension to null to clear it.
 *
 * Auth: x-admin-key OR signed-in admin user (same pattern as the
 * generator endpoints).
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

function getSupabaseAdmin() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(supabaseUrl, supabaseServiceKey)
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // Auth
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
  if (!isAuthed) return res.status(401).json({ error: 'Unauthorized' })

  var rawType = req.body?.type
  var type: 'phenomena' | 'reports' = rawType === 'reports' ? 'reports' : 'phenomena'
  var rowId = req.body?.id
  if (!rowId) return res.status(400).json({ error: 'Missing id' })

  var allowed = ['anchor_case_hook', 'anchor_when', 'anchor_where', 'anchor_witness', 'unresolved_tension', 'push_copy']
  var update: any = {}
  for (var i = 0; i < allowed.length; i++) {
    var f = allowed[i]
    if (Object.prototype.hasOwnProperty.call(req.body, f)) {
      update[f] = req.body[f]  // null is allowed for unresolved_tension
    }
  }

  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'No editable fields supplied' })
  }

  var supabase = getSupabaseAdmin()
  var { data: updated, error } = await supabase
    .from(type)
    .update(update)
    .eq('id', rowId)
    .select(allowed.join(', ') + ', id')
    .single()

  if (error) {
    console.error('[AnchorEdit] Update error:', error)
    return res.status(500).json({ error: error.message })
  }

  return res.status(200).json({ success: true, type: type, row: updated })
}
