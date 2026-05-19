/**
 * POST /api/reports/video/[id]/finalize
 *
 * Panel-feedback (May 2026), video pipeline Phase A — direct-to-
 * Storage upload finalization.
 *
 * After the client has PUT the video bytes to the signed upload URL
 * issued by /upload-url, it calls this endpoint to confirm the
 * upload landed and flip the report_videos row out of 'uploading'.
 *
 * Pipeline:
 *   1. Bearer auth → user id.
 *   2. Look up report_videos for this report. Must belong to user
 *      and currently be status='uploading'.
 *   3. HEAD the Storage object to confirm it exists and pick up
 *      the actual byte size (Supabase doesn't tell us at upload
 *      time when the client uploads directly).
 *   4. Flip status:
 *        - 'transcribing' if OPENAI_API_KEY is configured (cron
 *          will pick it up within 5 minutes)
 *        - 'ready_for_review' otherwise (Phase A only / no Whisper)
 *   5. Persist any client-supplied metadata (duration, dimensions).
 *
 * Idempotent: calling twice is a no-op on the second call.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface RequestBody {
  duration_sec?: number
  width?: number
  height?: number
  size_bytes?: number
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
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

  // Look up the in-flight video row.
  var { data: video, error: videoErr } = await admin
    .from('report_videos')
    .select('id, report_id, user_id, status, storage_bucket, storage_path, mime_type, size_bytes, duration_sec, width, height')
    .eq('report_id', reportId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (videoErr || !video) {
    return res.status(404).json({ error: 'Video row not found' })
  }
  if ((video as any).user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized' })
  }

  // Idempotent: if already past 'uploading' just return current state.
  if ((video as any).status !== 'uploading') {
    return res.status(200).json({
      ok: true,
      already_finalized: true,
      report_id: reportId,
      video_id: (video as any).id,
      status: (video as any).status,
    })
  }

  // Confirm the object actually landed in Storage. The `list`
  // approach is the cheapest existence check Supabase exposes that
  // also returns size — `download` would pull the bytes.
  var pathParts = ((video as any).storage_path || '').split('/')
  var filename = pathParts[pathParts.length - 1]
  var prefix = pathParts.slice(0, -1).join('/')

  var { data: listing, error: listErr } = await admin.storage
    .from((video as any).storage_bucket || 'report_videos')
    .list(prefix, { limit: 100, search: filename })

  if (listErr) {
    console.error('[video/finalize] storage list failed:', listErr.message)
    return res.status(500).json({ error: 'Could not verify upload' })
  }

  var match = (listing || []).find(function (entry: any) { return entry.name === filename })
  if (!match) {
    return res.status(400).json({ error: 'Upload not found in storage — did the upload complete?' })
  }
  var actualSize = match.metadata?.size || null

  var body = (req.body || {}) as RequestBody
  var nextStatus = process.env.OPENAI_API_KEY ? 'transcribing' : 'ready_for_review'

  var updates: any = {
    status: nextStatus,
  }
  if (actualSize) updates.size_bytes = actualSize
  else if (body.size_bytes) updates.size_bytes = body.size_bytes
  if (body.duration_sec) updates.duration_sec = body.duration_sec
  if (body.width) updates.width = body.width
  if (body.height) updates.height = body.height

  var { error: updateErr } = await admin
    .from('report_videos')
    .update(updates)
    .eq('id', (video as any).id)

  if (updateErr) {
    console.error('[video/finalize] update failed:', updateErr.message)
    return res.status(500).json({ error: 'Could not finalize video' })
  }

  // Panel-feedback (May 2026): kick off transcription immediately
  // instead of waiting up to 5 minutes for the next cron tick.
  // Fire-and-forget: we don't await, don't block the response.
  // The cron still runs as a backup retry mechanism in case this
  // immediate kick fails or the lambda warm-up is slow.
  if (nextStatus === 'transcribing' && process.env.CRON_SECRET) {
    try {
      var proto = (req.headers['x-forwarded-proto'] as string) || 'https'
      var host = (req.headers['x-forwarded-host'] as string) || req.headers.host
      if (host) {
        var transcribeUrl = proto + '://' + host + '/api/cron/transcribe-videos'
        // Don't await — fire and forget. The cron is idempotent and
        // looks for rows in 'transcribing' status; if our row is the
        // only one, it'll process just that. If multiple are queued,
        // it processes up to MAX_PER_RUN of them.
        fetch(transcribeUrl, {
          method: 'POST',
          headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET },
        }).catch(function (e: any) {
          console.warn('[video/finalize] immediate transcribe kick failed (cron backup will retry):', e?.message)
        })
      }
    } catch (e: any) {
      console.warn('[video/finalize] could not schedule immediate transcribe:', e?.message)
    }
  }

  return res.status(200).json({
    ok: true,
    report_id: reportId,
    video_id: (video as any).id,
    status: nextStatus,
    size_bytes: updates.size_bytes || null,
    review_url: '/submit/video-review/' + reportId,
  })
}
