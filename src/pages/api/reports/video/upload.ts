/**
 * POST /api/reports/video/upload
 *
 * Panel-feedback (May 2026), video pipeline Phase A.
 *
 * Pipeline:
 *   1. Bearer auth → user id.
 *   2. Read raw video bytes from request body (bodyParser disabled
 *      so we get the stream untouched, same pattern as the avatar
 *      upload endpoint at /api/user/avatar/upload).
 *   3. Validate mime + size (max 50MB, 60-sec cap is enforced
 *      client-side; we can't trust client claims about duration so
 *      we accept anything that fits in size).
 *   4. Create a DRAFT report row (status='pending', visibility=
 *      'private', source_type='user_submission'). The user will
 *      finalize metadata on /submit/video-review/[report_id] after
 *      the transcribe cron lands the transcript.
 *   5. Upload to Supabase Storage bucket 'report_videos' at
 *      <user_id>/<report_id>/<file_id>.<ext>.
 *   6. Create a report_videos row with status='transcribing'.
 *      The Phase B cron /api/cron/transcribe-videos picks it up
 *      every 5 minutes and runs Whisper + Haiku extraction.
 *   7. Return { report_id, video_id, storage_path, review_url }.
 *      Client redirects user to /submit/video-review/[report_id]
 *      which polls for transcript completion.
 *
 * Why a draft report instead of waiting until publish: the upload
 * is the user's irrevocable action ("I uploaded a video, I want
 * this submitted"). Anchoring it to a row immediately means we can
 * track it in admin queue + cron + analytics even if the user
 * never reaches the review step. They can always cancel from the
 * review page (DELETE /api/reports/video/[id]).
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

export const config = {
  api: {
    bodyParser: false,
    responseLimit: false,
  },
}

var MAX_BYTES = 50 * 1024 * 1024 // 50MB — enough for 60-sec vertical at modest bitrate

// MIME → file extension. We only accept formats MediaRecorder + native
// camera produce. Whisper handles all of these.
var ALLOWED_MIME: Record<string, string> = {
  'video/webm': 'webm',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/x-matroska': 'mkv',
}

async function readRawBody(req: NextApiRequest, maxBytes: number): Promise<Buffer> {
  return new Promise(function (resolve, reject) {
    var chunks: Buffer[] = []
    var total = 0
    req.on('data', function (chunk: Buffer | string) {
      var buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buf.length
      if (total > maxBytes) {
        reject(new Error('PAYLOAD_TOO_LARGE'))
        req.destroy()
        return
      }
      chunks.push(buf)
    })
    req.on('end', function () { resolve(Buffer.concat(chunks)) })
    req.on('error', function (err: any) { reject(err) })
  })
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // ── 1. Auth ──────────────────────────────────────────────────
  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''
  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated' })
  }

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  var { data: userData, error: authErr } = await admin.auth.getUser(accessToken)
  if (authErr || !userData?.user) {
    return res.status(401).json({ error: 'Not authenticated' })
  }
  var userId = userData.user.id

  // ── 2. Mime + size ───────────────────────────────────────────
  var rawMime = (req.headers['x-mime'] as string) || (req.headers['content-type'] as string) || ''
  // Strip codecs= suffix that browsers add, e.g. "video/webm; codecs=vp9".
  var mime = rawMime.split(';')[0].trim().toLowerCase()
  var ext = ALLOWED_MIME[mime]
  if (!ext) {
    return res.status(415).json({ error: 'Unsupported video type', mime: mime })
  }

  // Optional metadata via custom headers (no body re-parse needed).
  var clientDuration = parseFloat((req.headers['x-duration-sec'] as string) || '0') || null
  var clientWidth = parseInt((req.headers['x-width'] as string) || '0', 10) || null
  var clientHeight = parseInt((req.headers['x-height'] as string) || '0', 10) || null

  // ── 3. Read body ─────────────────────────────────────────────
  var raw: Buffer
  try {
    raw = await readRawBody(req, MAX_BYTES + 256 * 1024)
  } catch (err: any) {
    if (err?.message === 'PAYLOAD_TOO_LARGE') {
      return res.status(413).json({ error: 'Video too large', max_bytes: MAX_BYTES })
    }
    return res.status(400).json({ error: 'Could not read upload' })
  }
  if (!raw || !raw.length) {
    return res.status(400).json({ error: 'Empty body' })
  }
  if (raw.length > MAX_BYTES) {
    return res.status(413).json({ error: 'Video too large', max_bytes: MAX_BYTES })
  }

  // ── 4. Create the draft report row ───────────────────────────
  // We need an ID up-front so we can namespace the storage path.
  // The user will fill in title/description/location/date on
  // /submit/video-review after transcription.
  var draftReportId = crypto.randomUUID()
  var placeholderTitle = 'Video report — pending review'
  var placeholderSlug = 'video-' + draftReportId.slice(0, 8)
  var placeholderDescription = '(Video uploaded; transcript and details pending.)'

  var { error: reportErr } = await (admin.from('reports') as any).insert({
    id: draftReportId,
    title: placeholderTitle,
    slug: placeholderSlug,
    summary: placeholderDescription,
    description: placeholderDescription,
    category: 'combination',
    status: 'pending',
    visibility: 'private',
    submitted_by: userId,
    source_type: 'user_submission',
    has_video: false, // flipped by trigger when video status='ready'
    onboarding_first_report: false,
  })
  if (reportErr) {
    console.error('[video/upload] reports insert failed:', reportErr.message)
    return res.status(500).json({ error: 'Could not start video report' })
  }

  // ── 5. Storage upload ────────────────────────────────────────
  var fileId = crypto.randomUUID()
  var storagePath = userId + '/' + draftReportId + '/' + fileId + '.' + ext

  var { error: storageErr } = await admin.storage
    .from('report_videos')
    .upload(storagePath, raw, {
      contentType: mime,
      cacheControl: '3600',
      upsert: false,
    })

  if (storageErr) {
    // Roll back the draft report so we don't leak orphaned rows.
    await admin.from('reports').delete().eq('id', draftReportId)
    console.error('[video/upload] storage upload failed:', storageErr.message)
    return res.status(500).json({ error: 'Could not save video to storage. Try again.' })
  }

  // ── 6. Create the report_videos row ──────────────────────────
  var { data: videoRow, error: videoErr } = await (admin.from('report_videos') as any).insert({
    report_id: draftReportId,
    user_id: userId,
    storage_bucket: 'report_videos',
    storage_path: storagePath,
    mime_type: mime,
    size_bytes: raw.length,
    duration_sec: clientDuration,
    width: clientWidth,
    height: clientHeight,
    // Phase B cron picks up 'transcribing' rows every 5 min.
    // If the Whisper key isn't set or we're running Phase A only,
    // the cron is a no-op and the admin can move rows to
    // 'ready_for_review' manually.
    status: process.env.OPENAI_API_KEY ? 'transcribing' : 'ready_for_review',
    uploaded_at: new Date().toISOString(),
  }).select('id, status').single()

  if (videoErr || !videoRow) {
    // Roll back storage + report row.
    await admin.storage.from('report_videos').remove([storagePath])
    await admin.from('reports').delete().eq('id', draftReportId)
    console.error('[video/upload] report_videos insert failed:', videoErr?.message)
    return res.status(500).json({ error: 'Could not register video. Try again.' })
  }

  return res.status(200).json({
    ok: true,
    report_id: draftReportId,
    video_id: (videoRow as any).id,
    storage_path: storagePath,
    review_url: '/submit/video-review/' + draftReportId,
    initial_status: (videoRow as any).status,
  })
}
