/**
 * GET /api/admin/bio-queue
 *
 * V9.9.1 — admin endpoint that returns the queue of pending bio
 * moderation entries (Claude Haiku flagged as borderline). Sorted
 * oldest first so longest-waiting entries get reviewed first.
 *
 * Pairs with /api/admin/bio-decision for approve/reject actions.
 *
 * Auth: Bearer token + admin role. Mirrors /api/admin/avatar-queue.
 *
 * Response:
 *   { items: Array<{
 *       id, username, display_name, avatar_url, bio,
 *       bio_moderation_categories, bio_moderation_at
 *     }> }
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

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
    .select('id, username, display_name, avatar_url, bio, bio_moderation_categories, bio_moderation_at')
    .eq('bio_pending_review', true)
    .order('bio_moderation_at', { ascending: true })
    .limit(50)

  if (error) {
    console.error('[BioQueue] error:', error.message)
    return res.status(500).json({ error: 'Failed to fetch queue' })
  }

  return res.status(200).json({ items: data || [] })
}
