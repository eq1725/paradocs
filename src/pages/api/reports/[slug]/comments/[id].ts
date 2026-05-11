/**
 * DELETE /api/reports/[slug]/comments/[id]
 *
 * V9.12 Phase 2.D — soft-delete a comment. Author-only.
 *
 * Sets deleted_at on the row; the public SELECT policy hides the
 * row from readers but the row stays in the database for audit
 * and potential restoration. Service-role admins can hard-delete
 * via Supabase directly if needed.
 *
 * Auth: bearer token. Author must match user_id.
 *
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' })

  var commentId = String(req.query.id || '').trim()
  if (!commentId) return res.status(400).json({ error: 'Missing comment id' })

  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: 'Bearer ' + token } },
  })
  var userResult = await authClient.auth.getUser(token)
  var user = userResult.data.user
  if (!user) return res.status(401).json({ error: 'Invalid session' })

  // RLS-protected update: only the owner can flip deleted_at.
  var updateResult = await (authClient.from('report_comments') as any)
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', commentId)
    .eq('user_id', user.id) // belt + suspenders
    .is('deleted_at', null)
    .select('id')
    .single()

  if (updateResult.error || !updateResult.data) {
    return res.status(404).json({ error: 'Comment not found or not yours' })
  }

  return res.status(200).json({ deleted: true, id: commentId })
}
