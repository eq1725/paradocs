/**
 * POST /api/admin/videos/[id]/decide
 *
 * Panel-feedback (May 2026), video pipeline Phase A. Admin decision
 * on a queued video. action='approve' flips report_videos to
 * 'ready' and the parent reports row to 'approved'. action='reject'
 * flips report_videos to 'rejected' and parent reports to
 * 'rejected' (record stays for audit, never goes public).
 *
 * Auth: admin email gate.
 *
 * Body: { action: 'approve' | 'reject', reason?: string }
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ADMIN_EMAIL = 'williamschaseh@gmail.com'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var videoId = (req.query.id as string) || ''
  if (!videoId) return res.status(400).json({ error: 'Missing video id' })

  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  if (userData.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin only' })
  }
  var adminUserId = userData.user.id

  var body = req.body || {}
  var action = (body.action || '').toString()
  var reason = (body.reason || '').toString().trim() || null

  if (action !== 'approve' && action !== 'reject') {
    return res.status(400).json({ error: 'Invalid action' })
  }
  if (action === 'reject' && !reason) {
    return res.status(400).json({ error: 'Rejection reason required' })
  }

  // Look up the video + parent report.
  var { data: video, error: videoErr } = await admin
    .from('report_videos')
    .select('id, report_id, status')
    .eq('id', videoId)
    .maybeSingle()
  if (videoErr || !video) return res.status(404).json({ error: 'Video not found' })

  var now = new Date().toISOString()

  if (action === 'approve') {
    await admin.from('report_videos').update({
      status: 'ready',
      reviewed_by: adminUserId,
      reviewed_at: now,
      reviewer_notes: reason,
      published_at: now,
    }).eq('id', videoId)

    await admin.from('reports').update({
      status: 'approved',
      updated_at: now,
    }).eq('id', (video as any).report_id)

    return res.status(200).json({ ok: true, action: 'approve', video_id: videoId })
  }

  // Reject
  await admin.from('report_videos').update({
    status: 'rejected',
    rejection_reason: reason,
    rejected_at: now,
    reviewed_by: adminUserId,
    reviewed_at: now,
    reviewer_notes: reason,
  }).eq('id', videoId)

  await admin.from('reports').update({
    status: 'rejected',
    updated_at: now,
  }).eq('id', (video as any).report_id)

  return res.status(200).json({ ok: true, action: 'reject', video_id: videoId })
}
