/**
 * GET /api/admin/avatar-queue
 *
 * V9.7 Phase 2 — admin endpoint that returns the queue of pending
 * avatar uploads for human review (Rekognition flagged borderline
 * content). Sorted oldest first so the longest-waiting users get
 * attention first.
 *
 * Auth: requires admin role (profiles.role = 'admin').
 *
 * Response:
 *   { items: Array<{
 *       id, username, display_name, avatar_url, avatar_pending_url,
 *       avatar_moderation_score, avatar_pending_uploaded_at
 *     }> }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // V9.7.4 — accept Authorization Bearer token (the client sends it)
  // instead of cookie-based session pickup which wasn't reliable
  // through Vercel.
  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  var { data: profile } = await (admin
    .from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!profile || (profile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  var { data, error } = await (admin
    .from('profiles') as any)
    .select('id, username, display_name, avatar_url, avatar_pending_url, avatar_moderation_score, avatar_pending_uploaded_at')
    .eq('avatar_pending_review', true)
    .order('avatar_pending_uploaded_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[AvatarQueue] error:', error.message)
    return res.status(500).json({ error: 'Failed to fetch queue' })
  }

  return res.status(200).json({ items: data || [] })
}
