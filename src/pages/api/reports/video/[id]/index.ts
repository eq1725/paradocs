/**
 * GET /api/reports/video/[id]
 *
 * Panel-feedback (May 2026), video pipeline. Returns the report +
 * report_videos pair for the /submit/video-review page along with a
 * signed playback URL for the video file.
 *
 * Auth: Bearer JWT, must match report_videos.user_id.
 *
 * Used by the client to poll for transcript completion (the cron
 * flips status='transcribing' → 'ready_for_review' once Whisper
 * lands), and to prefill the review form with any Haiku-extracted
 * metadata.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var SIGNED_URL_TTL_SEC = 60 * 60 // 1h — long enough for the review page session

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var reportId = (req.query.id as string) || ''
  if (!reportId) return res.status(400).json({ error: 'Missing report id' })

  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) return res.status(401).json({ error: 'Not authenticated' })

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) return res.status(401).json({ error: 'Not authenticated' })
  var userId = userData.user.id

  var { data: video, error: videoErr } = await admin
    .from('report_videos')
    .select('id, report_id, user_id, status, storage_bucket, storage_path, mime_type, size_bytes, duration_sec, transcript, transcript_segments, transcript_lang, extracted_meta, uploaded_at')
    .eq('report_id', reportId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (videoErr || !video) return res.status(404).json({ error: 'Video not found' })
  if ((video as any).user_id !== userId) return res.status(403).json({ error: 'Not authorized' })

  var { data: report, error: reportErr } = await admin
    .from('reports')
    .select('id, title, description, category, status, visibility, anonymous_submission, location_precision, latitude, longitude, city, state_province, country, event_date, event_date_raw, event_date_precision')
    .eq('id', (video as any).report_id)
    .maybeSingle()
  if (reportErr || !report) return res.status(404).json({ error: 'Report not found' })

  // Signed URL — Storage object is private, so the player needs a
  // short-lived URL to play it.
  var signed = await admin.storage
    .from((video as any).storage_bucket || 'report_videos')
    .createSignedUrl((video as any).storage_path, SIGNED_URL_TTL_SEC)

  if (signed.error || !signed.data) {
    console.error('[video/get] signed URL failed:', signed.error?.message)
    return res.status(500).json({ error: 'Could not generate playback URL' })
  }

  return res.status(200).json({
    ok: true,
    report: report,
    video: {
      id: (video as any).id,
      status: (video as any).status,
      mime_type: (video as any).mime_type,
      size_bytes: (video as any).size_bytes,
      duration_sec: (video as any).duration_sec,
      transcript: (video as any).transcript,
      transcript_segments: (video as any).transcript_segments,
      transcript_lang: (video as any).transcript_lang,
      extracted_meta: (video as any).extracted_meta,
      uploaded_at: (video as any).uploaded_at,
      playback_url: signed.data.signedUrl,
      playback_expires_at: new Date(Date.now() + SIGNED_URL_TTL_SEC * 1000).toISOString(),
    },
  })
}
