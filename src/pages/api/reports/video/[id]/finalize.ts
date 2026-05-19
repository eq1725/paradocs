/**
 * POST /api/reports/video/[id]/finalize
 *
 * Panel-feedback (May 2026 — 3rd round). After the client PUTs the
 * video bytes to the signed upload URL, this endpoint:
 *
 *   1. Verifies the upload landed in Storage.
 *   2. Downloads the blob server-side.
 *   3. Calls Whisper synchronously to transcribe (~5-60s).
 *   4. Calls Haiku synchronously to extract title/description/
 *      location/category hints from the transcript.
 *   5. Updates the report_videos row with everything attached and
 *      flips status to 'ready_for_review'.
 *   6. Returns success so the client can navigate to /submit/video-
 *      review with everything prefilled.
 *
 * Why synchronous: users won't wait. The prior cron-based async
 * pattern meant the review page showed a "Waiting for transcript…"
 * banner for up to 5 minutes. Now the wait is shifted to the upload
 * step where the user already expects a progress bar.
 *
 * Latency budget: Vercel maxDuration: 300s. Whisper for a 5-minute
 * clip is typically ~30-60s. Haiku is ~3-5s. Total budget ~75s
 * worst case, well within 300s.
 *
 * Fallback: if Whisper times out or errors, we set status to
 * 'transcribing' (instead of 'ready_for_review') and the cron
 * /api/cron/transcribe-videos retries on its 5-min cadence.
 *
 * Cost: ~$0.013/video at 2-min avg. Trivial.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { runWhisper, runHaikuExtract } from '@/lib/services/video-transcribe.service'

export const config = {
  api: { responseLimit: false },
  maxDuration: 300,
}

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

  // Verify the object landed in Storage.
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

  // Persist the client-supplied + Storage-confirmed metadata first
  // so the row is at minimum in a sane state if Whisper later fails.
  var baseUpdates: any = {}
  if (actualSize) baseUpdates.size_bytes = actualSize
  else if (body.size_bytes) baseUpdates.size_bytes = body.size_bytes
  if (body.duration_sec) baseUpdates.duration_sec = body.duration_sec
  if (body.width) baseUpdates.width = body.width
  if (body.height) baseUpdates.height = body.height

  // If OpenAI key isn't configured, skip transcription entirely and
  // go straight to ready_for_review (Phase A behavior, manual fill).
  if (!process.env.OPENAI_API_KEY) {
    baseUpdates.status = 'ready_for_review'
    await admin.from('report_videos').update(baseUpdates).eq('id', (video as any).id)
    return res.status(200).json({
      ok: true,
      report_id: reportId,
      video_id: (video as any).id,
      status: 'ready_for_review',
      transcript_ready: false,
      size_bytes: baseUpdates.size_bytes || null,
      review_url: '/submit/video-review/' + reportId,
    })
  }

  // Mark the row as 'transcribing' before we start the long-running
  // calls. If our process dies mid-flight, the cron will retry.
  await admin
    .from('report_videos')
    .update({ ...baseUpdates, status: 'transcribing', transcribe_attempts: 1 })
    .eq('id', (video as any).id)

  // ── Whisper + Haiku (synchronous, the user is waiting) ────────
  try {
    // Download the blob from Storage server-side. Service-role
    // client has unrestricted access.
    var { data: blob, error: downloadErr } = await admin.storage
      .from((video as any).storage_bucket || 'report_videos')
      .download((video as any).storage_path)

    if (downloadErr || !blob) {
      throw new Error('Download failed: ' + (downloadErr?.message || 'no blob'))
    }

    var whisper = await runWhisper(blob as Blob, filename)
    var extracted = whisper.text && whisper.text.length > 30
      ? await runHaikuExtract(whisper.text)
      : null

    var finalUpdates: any = {
      transcript: whisper.text || '',
      transcript_segments: whisper.segments || [],
      transcript_provider: 'whisper-1',
      transcript_lang: whisper.language || null,
      transcribed_at: new Date().toISOString(),
      transcribe_error: null,
      status: 'ready_for_review',
      extracted_meta: extracted || null,
      extracted_at: extracted ? new Date().toISOString() : null,
    }

    await admin.from('report_videos').update(finalUpdates).eq('id', (video as any).id)

    return res.status(200).json({
      ok: true,
      report_id: reportId,
      video_id: (video as any).id,
      status: 'ready_for_review',
      transcript_ready: true,
      size_bytes: baseUpdates.size_bytes || null,
      review_url: '/submit/video-review/' + reportId,
    })
  } catch (e: any) {
    console.error('[video/finalize] transcribe failed (cron backup will retry):', e?.message)
    // Leave row in 'transcribing' status so cron retries. Client can
    // still proceed to the review page — the form will show the
    // "Transcribing in the background" inline hint and let them
    // publish without it. Cron updates the row later.
    await admin
      .from('report_videos')
      .update({ transcribe_error: (e?.message || String(e)).slice(0, 500) })
      .eq('id', (video as any).id)

    // Best-effort: also kick the cron immediately so it doesn't wait
    // 5 minutes for the next tick.
    if (process.env.CRON_SECRET) {
      try {
        var proto = (req.headers['x-forwarded-proto'] as string) || 'https'
        var host = (req.headers['x-forwarded-host'] as string) || req.headers.host
        if (host) {
          fetch(proto + '://' + host + '/api/cron/transcribe-videos', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + process.env.CRON_SECRET },
          }).catch(function () { /* silent */ })
        }
      } catch {}
    }

    return res.status(200).json({
      ok: true,
      report_id: reportId,
      video_id: (video as any).id,
      status: 'transcribing',
      transcript_ready: false,
      size_bytes: baseUpdates.size_bytes || null,
      review_url: '/submit/video-review/' + reportId,
    })
  }
}
