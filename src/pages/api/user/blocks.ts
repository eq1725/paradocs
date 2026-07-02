/**
 * /api/user/blocks — viewer-level contributor blocking.
 *
 * V11.41 — UGC trust floor (APP_EXPERIENCE_PANEL_REVIEW.md P0-2).
 * Apple Guideline 1.2 requires the ability to block abusive users.
 * Blocks apply to user-submitted content; archive reports have no
 * author to block.
 *
 * GET    → { blocks: [{ blocked_user_id, created_at }] }
 * POST   { blocked_user_id } → { ok: true }
 * DELETE { blocked_user_id } → { ok: true }
 *
 * All methods require a signed-in caller (Bearer token).
 * SWC compat: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  var authHeader = req.headers.authorization || ''
  var token = authHeader.replace(/^Bearer\s+/i, '').trim()
  if (!token) return res.status(401).json({ error: 'Not authenticated' })

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  var u = await svc.auth.getUser(token)
  var userId = u.data.user ? u.data.user.id : null
  if (!userId) return res.status(401).json({ error: 'Not authenticated' })

  if (req.method === 'GET') {
    var list = await svc.from('user_blocks')
      .select('blocked_user_id, created_at')
      .eq('blocker_id', userId)
      .order('created_at', { ascending: false })
    if (list.error) return res.status(500).json({ error: list.error.message })
    return res.status(200).json({ blocks: list.data || [] })
  }

  var blockedId = String(req.body?.blocked_user_id || '').trim()
  if (!blockedId) return res.status(400).json({ error: 'Missing blocked_user_id' })
  if (blockedId === userId) return res.status(400).json({ error: 'Cannot block yourself' })

  if (req.method === 'POST') {
    var ins = await svc.from('user_blocks')
      .upsert({ blocker_id: userId, blocked_user_id: blockedId }, { onConflict: 'blocker_id,blocked_user_id' })
    if (ins.error) {
      console.error('[blocks] insert error:', ins.error.message)
      return res.status(500).json({ error: 'Could not block' })
    }
    return res.status(200).json({ ok: true })
  }

  if (req.method === 'DELETE') {
    var del = await svc.from('user_blocks')
      .delete()
      .eq('blocker_id', userId)
      .eq('blocked_user_id', blockedId)
    if (del.error) return res.status(500).json({ error: del.error.message })
    return res.status(200).json({ ok: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
}
