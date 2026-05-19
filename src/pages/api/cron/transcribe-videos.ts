/**
 * Cron: /api/cron/transcribe-videos
 *
 * Panel-feedback (May 2026), video pipeline Phase B.
 *
 * Picks up report_videos rows where status='transcribing' and runs
 * OpenAI Whisper. On success, stores the transcript + word-level
 * segments, then invokes the Haiku extraction service to propose
 * title / description / location / date / category hints. Flips
 * status to 'ready_for_review' so the user can finalize on
 * /submit/video-review/[id].
 *
 * Retry policy: on Whisper failure, increment transcribe_attempts.
 * After 3 attempts, flip to status='pending_review' so the admin
 * queue picks it up and we don't burn endless retries on a
 * malformed file.
 *
 * Auth: Bearer CRON_SECRET (Vercel cron) or x-admin-key header.
 *
 * Cadence: every 5 minutes. Configured in vercel.json.
 *
 * Each run processes up to MAX_PER_RUN videos to stay under the
 * 300s function limit. With ~30s of Whisper + ~5s of Haiku per
 * row, 6 rows per run is a safe ceiling.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { runWhisper, runHaikuExtract, type ExtractedMeta } from '@/lib/services/video-transcribe.service'

export const config = {
  api: { responseLimit: false },
  maxDuration: 300,
}

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''

var MAX_PER_RUN = 6
var MAX_ATTEMPTS = 3

async function isAuthorized(req: NextApiRequest): Promise<boolean> {
  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) return true
  var adminKey = req.headers['x-admin-key']
  if (typeof adminKey === 'string' && adminKey === process.env.ADMIN_API_KEY) return true
  return false
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!(await isAuthorized(req))) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    return res.status(500).json({ error: 'Supabase not configured' })
  }
  if (!OPENAI_API_KEY) {
    return res.status(200).json({ ok: true, processed: 0, skipped_reason: 'no_openai_key' })
  }

  var svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  var { data: due, error: fetchErr } = await svc
    .from('report_videos')
    .select('id, report_id, user_id, storage_bucket, storage_path, mime_type, transcribe_attempts')
    .eq('status', 'transcribing')
    .order('uploaded_at', { ascending: true })
    .limit(MAX_PER_RUN)

  if (fetchErr) {
    console.error('[transcribe-videos] fetch failed:', fetchErr.message)
    return res.status(500).json({ error: 'Failed to fetch queue' })
  }

  var queue: any[] = (due as any[]) || []
  if (queue.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, reason: 'no_due_videos' })
  }

  var processed = 0
  var failed = 0
  var details: any[] = []

  for (var i = 0; i < queue.length; i++) {
    var row = queue[i]
    var attempts = (row.transcribe_attempts || 0) + 1

    try {
      // Download the video from Storage as a Blob.
      var { data: blob, error: downloadErr } = await svc.storage
        .from(row.storage_bucket || 'report_videos')
        .download(row.storage_path)

      if (downloadErr || !blob) {
        throw new Error('Download failed: ' + (downloadErr?.message || 'no blob'))
      }

      var filename = (row.storage_path.split('/').pop() || 'video.webm')
      var whisper = await runWhisper(blob as Blob, filename)
      var extracted: ExtractedMeta | null = null
      if (whisper.text && whisper.text.length > 30) {
        extracted = await runHaikuExtract(whisper.text)
      }

      var updates: any = {
        transcript: whisper.text || '',
        transcript_segments: whisper.segments || [],
        transcript_provider: 'whisper-1',
        transcript_lang: whisper.language || null,
        transcribed_at: new Date().toISOString(),
        transcribe_attempts: attempts,
        transcribe_error: null,
        status: 'ready_for_review',
        extracted_meta: extracted || null,
        extracted_at: extracted ? new Date().toISOString() : null,
      }

      await svc.from('report_videos').update(updates).eq('id', row.id)
      processed++
      details.push({ video_id: row.id, status: 'transcribed', lang: whisper.language })
    } catch (e: any) {
      console.error('[transcribe-videos] failed for', row.id, e?.message)
      var nextStatus = attempts >= MAX_ATTEMPTS ? 'pending_review' : 'transcribing'
      await svc.from('report_videos').update({
        transcribe_attempts: attempts,
        transcribe_error: (e?.message || String(e)).slice(0, 500),
        status: nextStatus,
      }).eq('id', row.id)
      failed++
      details.push({ video_id: row.id, status: 'failed', attempts: attempts, next_status: nextStatus })
    }
  }

  return res.status(200).json({
    ok: true,
    processed: processed,
    failed: failed,
    queue_size: queue.length,
    details: details,
  })
}
