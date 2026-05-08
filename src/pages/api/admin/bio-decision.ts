/**
 * POST /api/admin/bio-decision
 *
 * V9.9.1 — admin decision on a pending bio entry.
 *
 * Body: { user_id: string, decision: 'approved' | 'rejected' }
 *
 * Approved: clears bio_pending_review, sets decision='approved'.
 *   Bio text stays as-is (it was already saved + visible per V9.9
 *   moderation flow).
 *
 * Rejected: clears the bio (sets to NULL), clears pending flag,
 *   sets decision='rejected'. The user's profile bio disappears
 *   from public view; they'll see the empty bio next time they
 *   open settings and can rewrite something compliant.
 *
 * Auth: Bearer token + admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

  var { data: adminProfile } = await (admin
    .from('profiles') as any)
    .select('role')
    .eq('id', userData.user.id)
    .single()
  if (!adminProfile || (adminProfile as any).role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' })
  }

  var userId = req.body?.user_id
  var decision = req.body?.decision
  if (!userId || (decision !== 'approved' && decision !== 'rejected')) {
    return res.status(400).json({ error: 'Missing user_id or decision' })
  }

  var update: any = {
    bio_pending_review: false,
    bio_moderation_decision: decision,
    bio_moderation_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  if (decision === 'rejected') {
    // Clear the offending bio. User can rewrite next visit.
    update.bio = null
  }

  var { error: updateErr } = await (admin
    .from('profiles') as any)
    .update(update)
    .eq('id', userId)
  if (updateErr) {
    console.error('[BioDecision] update error:', updateErr.message)
    return res.status(500).json({ error: updateErr.message })
  }

  return res.status(200).json({ ok: true, decision })
}
