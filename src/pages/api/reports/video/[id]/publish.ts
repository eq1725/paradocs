/**
 * POST /api/reports/video/[id]/publish
 *
 * Panel-feedback (May 2026), video pipeline Phase A + B publish step.
 *
 * Finalize a draft video report. Takes the user-confirmed metadata
 * (title, description, location, date, category, visibility) and:
 *   1. Updates the parent reports row with the metadata.
 *   2. (Phase B) Runs OpenAI moderation on the transcript. Green →
 *      report_videos.status='ready' + reports.status='approved'.
 *      Flagged → report_videos.status='pending_review' + report
 *      stays 'pending'.
 *   3. (Phase A only / no Whisper) Flips report_videos.status to
 *      'pending_review' so the admin queue catches it before going
 *      live.
 *
 * Auth: Bearer JWT, must match report_videos.user_id.
 *
 * Body shape:
 *   {
 *     title: string,
 *     description: string,
 *     category: string,
 *     event_date: string,           // YYYY-MM-DD or YYYY
 *     event_date_precision: 'exact' | 'month' | 'year' | 'decade',
 *     city?: string, state_province?: string, country?: string,
 *     latitude?: string, longitude?: string,
 *     location_precision: 'exact' | 'city' | 'region' | 'country',
 *     visibility: 'public' | 'radar_only' | 'private',
 *     share_anonymously?: boolean,
 *   }
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

interface PublishBody {
  title?: string
  description?: string
  category?: string
  event_date?: string
  event_date_precision?: 'exact' | 'month' | 'year' | 'decade'
  city?: string
  state_province?: string
  country?: string
  latitude?: string
  longitude?: string
  location_precision?: 'exact' | 'city' | 'region' | 'country'
  visibility?: 'public' | 'radar_only' | 'private'
  share_anonymously?: boolean
}

async function runModeration(transcript: string | null): Promise<{ flagged: boolean; result: any }> {
  // Phase B moderation. If OPENAI_API_KEY isn't configured, we treat
  // the row as "needs admin review" instead of auto-approving.
  if (!process.env.OPENAI_API_KEY) {
    return { flagged: true, result: { skipped: true, reason: 'no_openai_key' } }
  }
  if (!transcript || transcript.trim().length === 0) {
    // No transcript → conservative: admin review.
    return { flagged: true, result: { skipped: true, reason: 'no_transcript' } }
  }
  try {
    var resp = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + process.env.OPENAI_API_KEY,
      },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: transcript.slice(0, 8000) }),
    })
    var data = await resp.json()
    var first = data && data.results && data.results[0]
    var flagged = !!(first && first.flagged)
    return { flagged: flagged, result: data }
  } catch (e: any) {
    console.error('[video/publish] moderation call failed:', e?.message)
    return { flagged: true, result: { error: e?.message || String(e) } }
  }
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

  // Fetch the video + report rows. The video must belong to the
  // user and still be in a publish-eligible state.
  var { data: video, error: videoErr } = await admin
    .from('report_videos')
    .select('id, report_id, user_id, status, transcript, transcript_segments')
    .eq('report_id', reportId)
    .order('uploaded_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (videoErr || !video) {
    return res.status(404).json({ error: 'Video not found' })
  }
  if ((video as any).user_id !== userId) {
    return res.status(403).json({ error: 'Not authorized to publish this video' })
  }
  var publishable = ['ready_for_review', 'transcribing', 'pending_review']
  if (publishable.indexOf((video as any).status) === -1) {
    return res.status(400).json({ error: 'Video is not in a publishable state', current_status: (video as any).status })
  }

  var p = (req.body || {}) as PublishBody

  // Required: description, category, event_date, at least one location field.
  var description = (p.description || '').toString().trim()
  if (description.length < 30) {
    return res.status(400).json({ error: 'Description must be at least 30 characters.' })
  }
  var hasLocation = !!(p.latitude && p.longitude) || !!p.city || !!p.state_province || !!p.country
  if (!hasLocation) {
    return res.status(400).json({ error: 'Please add where this happened — even just a country helps.' })
  }
  if (!p.event_date) {
    return res.status(400).json({ error: 'Please pick at least a year for when this happened.' })
  }

  // Derive location_precision if not supplied.
  var derivedPrecision: 'exact' | 'city' | 'region' | 'country' = 'exact'
  if (p.latitude && p.longitude) derivedPrecision = 'exact'
  else if (p.city) derivedPrecision = 'city'
  else if (p.state_province) derivedPrecision = 'region'
  else if (p.country) derivedPrecision = 'country'

  // Run moderation on the transcript. Phase A (no transcript) →
  // always queue for admin review.
  var transcript = (video as any).transcript || null
  var modOutcome = await runModeration(transcript)

  // Build the reports update payload.
  var reportUpdate: any = {
    title: (p.title || '').toString().trim() || 'Video report',
    description: description,
    summary: description.slice(0, 200) + (description.length > 200 ? '…' : ''),
    category: p.category || 'combination',
    visibility: p.visibility || 'public',
    anonymous_submission: !!p.share_anonymously,
    location_precision: p.location_precision || derivedPrecision,
    updated_at: new Date().toISOString(),
  }

  // Date.
  var precision = p.event_date_precision || 'exact'
  if (precision === 'exact') {
    reportUpdate.event_date = p.event_date
    reportUpdate.event_date_precision = 'exact'
    reportUpdate.event_date_approximate = false
  } else {
    reportUpdate.event_date_raw = p.event_date
    reportUpdate.event_date_precision = precision
    reportUpdate.event_date_approximate = true
  }

  // Location fields — pass through whichever were supplied.
  if (p.city) reportUpdate.city = p.city
  if (p.state_province) reportUpdate.state_province = p.state_province
  if (p.country) reportUpdate.country = p.country
  if (p.latitude) reportUpdate.latitude = parseFloat(p.latitude)
  if (p.longitude) reportUpdate.longitude = parseFloat(p.longitude)

  // Moderation outcome drives the report status. Flagged → keep
  // pending, admin reviews. Clean → approved + ready.
  if (modOutcome.flagged) {
    reportUpdate.status = 'pending'
  } else {
    reportUpdate.status = 'approved'
  }

  var { error: reportUpdateErr } = await (admin.from('reports') as any)
    .update(reportUpdate)
    .eq('id', (video as any).report_id)
  if (reportUpdateErr) {
    console.error('[video/publish] report update failed:', reportUpdateErr.message)
    return res.status(500).json({ error: 'Could not save report metadata' })
  }

  var videoUpdate: any = {
    status: modOutcome.flagged ? 'pending_review' : 'ready',
    moderation_result: modOutcome.result,
    moderation_passed: !modOutcome.flagged,
    moderation_at: new Date().toISOString(),
    published_at: !modOutcome.flagged ? new Date().toISOString() : null,
  }

  var { error: videoUpdateErr } = await (admin.from('report_videos') as any)
    .update(videoUpdate)
    .eq('id', (video as any).id)
  if (videoUpdateErr) {
    console.error('[video/publish] video update failed:', videoUpdateErr.message)
    return res.status(500).json({ error: 'Could not finalize video status' })
  }

  return res.status(200).json({
    ok: true,
    report_id: (video as any).report_id,
    video_status: videoUpdate.status,
    report_status: reportUpdate.status,
    needs_admin_review: !!modOutcome.flagged,
  })
}
