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
import Anthropic from '@anthropic-ai/sdk'

export const config = {
  api: { responseLimit: false },
  maxDuration: 300,
}

var SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
var SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
var OPENAI_API_KEY = process.env.OPENAI_API_KEY || ''
var ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || ''

var MAX_PER_RUN = 6
var MAX_ATTEMPTS = 3

var anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY })

async function isAuthorized(req: NextApiRequest): Promise<boolean> {
  var cronSecret = process.env.CRON_SECRET
  var authHeader = req.headers.authorization || ''
  if (cronSecret && authHeader === 'Bearer ' + cronSecret) return true
  var adminKey = req.headers['x-admin-key']
  if (typeof adminKey === 'string' && adminKey === process.env.ADMIN_API_KEY) return true
  return false
}

interface WhisperResponse {
  text: string
  language?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
  words?: Array<{ start: number; end: number; word: string }>
}

async function runWhisper(blob: Blob, filename: string): Promise<WhisperResponse> {
  var form = new FormData()
  form.append('file', blob, filename)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + OPENAI_API_KEY },
    body: form,
  })
  if (!resp.ok) {
    var text = await resp.text()
    throw new Error('Whisper API ' + resp.status + ': ' + text.slice(0, 200))
  }
  return await resp.json()
}

interface ExtractedMeta {
  proposed_title?: string
  proposed_description?: string
  location_hints?: string[]
  date_hints?: string[]
  category_hints?: string[]
}

var EXTRACT_SYSTEM = [
  'You analyze short first-person video transcripts about paranormal, UFO, or unexplained experiences and produce structured metadata.',
  '',
  'Return a JSON object with these keys (no preamble, no markdown, no code fences):',
  '{',
  '  "proposed_title": string,           // 4-10 words, sentence case, no quotes/emoji',
  '  "proposed_description": string,     // a clean 2-4 sentence summary in the author\'s voice',
  '  "location_hints": string[],         // any place names mentioned (cities, states, countries)',
  '  "date_hints": string[],             // any dates / years / time references',
  '  "category_hints": string[]          // canonical category slugs from this list:',
  '                                       //   ghosts_hauntings, ufos_aliens, cryptids,',
  '                                       //   psychic_phenomena, consciousness_practices,',
  '                                       //   psychological_experiences, combination',
  '}',
  '',
  'Rules:',
  '- Never invent specifics that aren\'t in the transcript.',
  '- For arrays, use [] if there\'s nothing valid to put in them.',
  '- For category_hints, pick AT MOST 2 from the list above; do not invent new categories.',
].join('\n')

async function runHaikuExtract(transcript: string): Promise<ExtractedMeta | null> {
  if (!ANTHROPIC_API_KEY) return null
  try {
    var resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0.2,
      system: EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: 'Transcript:\n\n' + transcript.slice(0, 4000) }],
    })
    var block: any = resp.content.find(function (b: any) { return b.type === 'text' })
    var raw = block && block.type === 'text' ? String(block.text || '') : ''
    var cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned) as ExtractedMeta
  } catch (e: any) {
    console.warn('[transcribe-videos] haiku extract failed:', e?.message)
    return null
  }
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
