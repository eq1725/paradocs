/**
 * GET /api/admin/videos/queue
 *
 * Panel-feedback (May 2026), video pipeline Phase A. Returns the
 * report_videos rows awaiting admin review with a signed playback
 * URL for each. Same admin email gate as /admin/source-takedown.
 *
 * Returns videos with status in (pending_review, failed,
 * ready_for_review), oldest first.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var ADMIN_EMAIL = 'williamschaseh@gmail.com'
var SIGNED_URL_TTL_SEC = 30 * 60

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
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  if (userData.user.email !== ADMIN_EMAIL) {
    return res.status(403).json({ error: 'Admin only' })
  }

  var { data: rows, error: queryErr } = await admin
    .from('report_videos')
    .select('id, report_id, user_id, status, mime_type, duration_sec, transcript, transcript_lang, moderation_result, uploaded_at, storage_bucket, storage_path')
    .in('status', ['pending_review', 'failed', 'ready_for_review'])
    .order('uploaded_at', { ascending: true })
    .limit(100)

  if (queryErr) {
    console.error('[admin/videos/queue] fetch failed:', queryErr.message)
    return res.status(500).json({ error: 'Failed to fetch queue' })
  }

  var videos: any[] = (rows as any[]) || []
  var reportIds: string[] = Array.from(new Set(videos.map(function (v) { return v.report_id })))

  var reportMap: Record<string, any> = {}
  if (reportIds.length > 0) {
    var { data: reportRows } = await admin
      .from('reports')
      .select('id, title, description, slug, category, status')
      .in('id', reportIds)
    var rrs: any[] = (reportRows as any[]) || []
    for (var i = 0; i < rrs.length; i++) reportMap[rrs[i].id] = rrs[i]
  }

  // Generate signed playback URLs in parallel.
  var enriched = await Promise.all(videos.map(async function (v) {
    var signed = await admin.storage
      .from(v.storage_bucket || 'report_videos')
      .createSignedUrl(v.storage_path, SIGNED_URL_TTL_SEC)
    return {
      id: v.id,
      report_id: v.report_id,
      user_id: v.user_id,
      status: v.status,
      mime_type: v.mime_type,
      duration_sec: v.duration_sec,
      transcript: v.transcript,
      transcript_lang: v.transcript_lang,
      moderation_result: v.moderation_result,
      uploaded_at: v.uploaded_at,
      playback_url: signed.error ? null : signed.data?.signedUrl || null,
      report: reportMap[v.report_id] || null,
    }
  }))

  return res.status(200).json({ ok: true, videos: enriched })
}
