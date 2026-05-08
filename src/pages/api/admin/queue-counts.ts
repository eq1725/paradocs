/**
 * GET /api/admin/queue-counts
 *
 * V9.8 — returns pending-item counts for each admin review queue
 * so the AdminLayout sub-nav can render badges next to the pills
 * (e.g. "Avatars (3)") without having to load each queue page.
 *
 * Response shape:
 *   {
 *     reports: number,    // pending submitted reports awaiting review
 *     media: number,      // media uploads pending review
 *     avatars: number,    // custom avatars in moderation queue
 *     anchors: number,    // 0 — anchor-cases is an editor, not a queue
 *   }
 *
 * Auth: requires admin role. Bearer token (matches the rest of the
 * admin endpoints).
 *
 * Caching: 30s server cache; clients also poll for fresh counts.
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

  // Run all count queries in parallel.
  var [pendingReports, pendingAvatars, pendingBios] = await Promise.all([
    (admin.from('reports') as any)
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending'),
    (admin.from('profiles') as any)
      .select('id', { count: 'exact', head: true })
      .eq('avatar_pending_review', true),
    // V9.9.1 — bios queue count
    (admin.from('profiles') as any)
      .select('id', { count: 'exact', head: true })
      .eq('bio_pending_review', true),
  ])

  res.setHeader('Cache-Control', 'private, max-age=30')
  return res.status(200).json({
    reports: pendingReports.count || 0,
    media: 0, // V9.8 P2 placeholder — wire up when media queue gets a status column
    avatars: pendingAvatars.count || 0,
    bios: pendingBios.count || 0,
    anchors: 0, // anchor-cases is an editor, no queue
  })
}
