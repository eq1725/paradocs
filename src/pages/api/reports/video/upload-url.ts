/**
 * POST /api/reports/video/upload-url
 *
 * Panel-feedback (May 2026), video pipeline Phase A — refactored to
 * direct-to-Storage uploads via signed URLs.
 *
 * Background: the original raw-body upload endpoint pushed video
 * bytes through a Vercel serverless function, which caps request
 * bodies at ~50 MB on Pro plans. That's not enough for 5-minute
 * iPhone HEVC recordings (~250–300 MB). This endpoint instead
 * creates the draft rows server-side and hands the client a
 * single-use signed upload URL pointing directly at the Storage
 * bucket. The client PUTs to that URL, then calls /finalize to
 * flip status. Vercel function payload limits no longer apply.
 *
 * Pipeline:
 *   1. Bearer auth → user id.
 *   2. Validate mime (one of mp4 / webm / quicktime).
 *   3. Create a DRAFT reports row + a report_videos row with
 *      status='uploading'. We need the IDs up-front to namespace
 *      the storage path.
 *   4. Generate a signed upload URL for that storage path (2h TTL,
 *      Supabase default).
 *   5. Return { report_id, video_id, storage_path, signed_url,
 *      upload_token, review_url }.
 *   6. Client PUTs the video blob to signed_url.
 *   7. Client calls POST /api/reports/video/[report_id]/finalize.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

interface RequestBody {
  mime_type?: string
  size_bytes?: number
  duration_sec?: number
  width?: number
  height?: number
}

var ALLOWED_MIME: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

var BUCKET = 'report_videos'

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

  // ── 2. Validate request ──────────────────────────────────────
  var body = (req.body || {}) as RequestBody
  var rawMime = (body.mime_type || '').toString().toLowerCase()
  // Strip codecs= suffix that browsers add, e.g. "video/webm; codecs=vp9".
  var mime = rawMime.split(';')[0].trim()
  var ext = ALLOWED_MIME[mime]
  if (!ext) {
    return res.status(415).json({
      error: 'Unsupported video type',
      mime: mime,
      supported: Object.keys(ALLOWED_MIME),
    })
  }

  // ── 3. Create draft rows ─────────────────────────────────────
  // We need the report id up-front so the storage path is
  // namespaced under it. Client never sees these IDs change after
  // this point.
  var draftReportId = crypto.randomUUID()
  var placeholderTitle = 'Video report — pending review'
  var placeholderSlug = 'video-' + draftReportId.slice(0, 8)
  var placeholderDescription = '(Video uploading; transcript and details pending.)'

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
    has_video: false,
    onboarding_first_report: false,
  })
  if (reportErr) {
    console.error('[video/upload-url] reports insert failed:', reportErr.message)
    return res.status(500).json({ error: 'Could not create draft report' })
  }

  var fileId = crypto.randomUUID()
  var storagePath = userId + '/' + draftReportId + '/' + fileId + '.' + ext

  // ── 4. Create the report_videos row ─────────────────────────
  var { data: videoRow, error: videoErr } = await (admin.from('report_videos') as any).insert({
    report_id: draftReportId,
    user_id: userId,
    storage_bucket: BUCKET,
    storage_path: storagePath,
    mime_type: mime,
    size_bytes: body.size_bytes || null,
    duration_sec: body.duration_sec || null,
    width: body.width || null,
    height: body.height || null,
    status: 'uploading',
    uploaded_at: new Date().toISOString(),
  }).select('id').single()

  if (videoErr || !videoRow) {
    await admin.from('reports').delete().eq('id', draftReportId)
    console.error('[video/upload-url] report_videos insert failed:', videoErr?.message)
    return res.status(500).json({ error: 'Could not register video' })
  }

  // ── 5. Generate signed upload URL ────────────────────────────
  // Supabase signed upload URLs are single-use, 2-hour TTL. The
  // returned URL is what the client PUTs to (or uploadToSignedUrl
  // via the supabase-js client).
  var { data: signed, error: signedErr } = await admin.storage
    .from(BUCKET)
    .createSignedUploadUrl(storagePath)

  if (signedErr || !signed) {
    // Roll back the draft rows.
    await admin.from('report_videos').delete().eq('id', (videoRow as any).id)
    await admin.from('reports').delete().eq('id', draftReportId)
    console.error('[video/upload-url] createSignedUploadUrl failed:', signedErr?.message)
    return res.status(500).json({ error: 'Could not generate upload URL' })
  }

  return res.status(200).json({
    ok: true,
    report_id: draftReportId,
    video_id: (videoRow as any).id,
    storage_path: storagePath,
    signed_url: signed.signedUrl,
    upload_token: signed.token,
    review_url: '/submit/video-review/' + draftReportId,
  })
}
