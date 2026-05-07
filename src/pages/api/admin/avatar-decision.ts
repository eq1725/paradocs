/**
 * POST /api/admin/avatar-decision
 *
 * V9.7 Phase 2 — admin decision on a pending avatar upload.
 *
 * Body: { user_id: string, decision: 'approved' | 'rejected' }
 *
 * Approved: avatar_pending_url is promoted to avatar_url. Pending
 *   flags cleared. Old (replaced) avatar file is deleted from
 *   Storage (best-effort).
 *
 * Rejected: pending file is deleted from Storage. avatar_url stays
 *   on the user's previous (curated/approved) value, which they were
 *   already seeing — so no visible change for them. Pending flags
 *   cleared.
 *
 * Auth: requires admin role.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // V9.7.4 — Bearer token auth (matches /api/admin/avatar-queue and
  // /api/user/avatar/upload). Cookie-based pickup wasn't reliable.
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

  // Look up the pending state.
  var { data: target } = await (admin
    .from('profiles') as any)
    .select('avatar_url, avatar_pending_url')
    .eq('id', userId)
    .single()
  if (!target) return res.status(404).json({ error: 'User not found' })

  var pendingUrl = (target as any).avatar_pending_url as string | null
  var currentUrl = (target as any).avatar_url as string | null
  if (!pendingUrl) {
    return res.status(400).json({ error: 'No pending upload for this user' })
  }

  function pathFromUrl(url: string | null | undefined): string | null {
    if (!url) return null
    var m = url.match(/\/avatars-user\/(.+)$/)
    return m && m[1] ? m[1] : null
  }

  if (decision === 'approved') {
    // Promote pending → current. Delete the OLD avatar file (if it
    // was a custom upload — curated avatars under /avatars/curated/
    // are static and shouldn't be deleted).
    var oldPath = pathFromUrl(currentUrl)
    if (oldPath) {
      try { await admin.storage.from('avatars-user').remove([oldPath]) } catch { /* best effort */ }
    }
    var { error: updateErr } = await (admin.from('profiles') as any)
      .update({
        avatar_url: pendingUrl,
        avatar_pending_review: false,
        avatar_pending_url: null,
        avatar_pending_uploaded_at: null,
        avatar_moderation_decision: 'approved',
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId)
    if (updateErr) return res.status(500).json({ error: updateErr.message })
    return res.status(200).json({ ok: true, decision: 'approved' })
  }

  // Rejected — delete the pending file, clear flags, leave avatar_url alone.
  var pendingPath = pathFromUrl(pendingUrl)
  if (pendingPath) {
    try { await admin.storage.from('avatars-user').remove([pendingPath]) } catch { /* best effort */ }
  }
  var { error: updateErr2 } = await (admin.from('profiles') as any)
    .update({
      avatar_pending_review: false,
      avatar_pending_url: null,
      avatar_pending_uploaded_at: null,
      avatar_moderation_decision: 'rejected',
      updated_at: new Date().toISOString(),
    })
    .eq('id', userId)
  if (updateErr2) return res.status(500).json({ error: updateErr2.message })
  return res.status(200).json({ ok: true, decision: 'rejected' })
}
