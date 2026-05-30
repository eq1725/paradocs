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
import { remuxMovToMp4Faststart, shouldRemux, extractPosterFrame } from '@/lib/services/video-remux.service'

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

  // Panel-feedback (May 2026 — 5th round): explicit log so Vercel
  // function output makes it obvious which branch is firing. If
  // OPENAI_API_KEY isn't set in Production env, transcription
  // silently falls through to "manual fill" and the user sees an
  // empty review form. The log here lets you grep Vercel logs to
  // confirm presence.
  console.log('[video/finalize]',
    'report_id=' + reportId,
    'has_openai_key=' + (!!process.env.OPENAI_API_KEY),
    'video_status=' + (video as any).status)

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

    // V10.7.E.13 — .mov → MP4 faststart remux for instant playback.
    // iPhone .mov files put the moov atom at the end; browsers
    // can't start playback until the whole file downloads. Stream-
    // copy remux (no re-encode) into MP4 with -movflags +faststart
    // moves the index to the start, so the first frame appears as
    // soon as the first segment arrives — TikTok-grade instant
    // feel. Takes ~1-2s for short videos.
    //
    // Non-fatal: if ffmpeg isn't available (some dev sandboxes,
    // pre-deploy) or the remux fails, we keep the original .mov,
    // log it, and let Whisper proceed on the original blob. Browser
    // playback is just slower; everything else works.
    var workingBlob: Blob = blob as Blob
    var workingFilename: string = filename
    var workingBucket: string = (video as any).storage_bucket || 'report_videos'
    if (shouldRemux(filename, (video as any).mime_type)) {
      try {
        var remuxStart = Date.now()
        var remuxed = await remuxMovToMp4Faststart(blob as Blob, filename)
        if (remuxed.ok && remuxed.blob) {
          // Compose a sibling .mp4 storage path: same prefix, swap ext.
          var dotIdx = ((video as any).storage_path as string).lastIndexOf('.')
          var newPath = dotIdx > 0
            ? (((video as any).storage_path as string).substring(0, dotIdx) + '.mp4')
            : (((video as any).storage_path as string) + '.mp4')
          // Upload the remuxed MP4 to the sibling path. Using upsert
          // so a retry on the same row doesn't fail on existing object.
          var uploadResult = await admin.storage
            .from(workingBucket)
            .upload(newPath, remuxed.blob, {
              contentType: 'video/mp4',
              upsert: true,
            })
          if (uploadResult.error) {
            console.warn('[video/finalize] remux upload failed (non-fatal):', uploadResult.error.message)
          } else {
            // Point the row + downstream Whisper at the remuxed file.
            // Keep the .mov around in Storage in case we need to
            // reprocess; cleanup can come later as a separate cron.
            await admin.from('report_videos').update({
              storage_path: newPath,
              mime_type: 'video/mp4',
            }).eq('id', (video as any).id)
            workingBlob = remuxed.blob
            workingFilename = newPath.split('/').pop() || 'out.mp4'
            console.log(
              '[video/finalize] remux OK in_path=' + (video as any).storage_path +
              ' out_path=' + newPath +
              ' ms=' + (Date.now() - remuxStart) +
              ' out_bytes=' + (remuxed.sizeBytes || 0)
            )
          }
        } else {
          console.warn('[video/finalize] remux failed (non-fatal):', remuxed.error || 'unknown')
        }
      } catch (remuxErr: any) {
        console.warn('[video/finalize] remux threw (non-fatal):', remuxErr?.message || remuxErr)
      }
    }

    // V10.7.E.15 — server-side poster extraction. Even after we ship
    // client-side first-frame capture, some browsers (older Android
    // Chrome, certain codecs) silently produce a black image OR fail
    // entirely, leaving feed-v2 with no poster_url to sign. Run
    // ffmpeg here as the belt-and-braces: extract a 720px-wide JPEG
    // from t=0.5s, upload to the sibling .jpg path, and now every
    // approved video has a guaranteed poster for instant-paint on
    // Today + report-page surfaces. Non-fatal on failure (we just
    // fall through to whatever the client uploaded, if anything).
    try {
      var posterResult = await extractPosterFrame(workingBlob, workingFilename)
      if (posterResult.ok && posterResult.blob) {
        var posterDotIdx = ((video as any).storage_path as string).lastIndexOf('.')
        // Note: at this point storage_path may already have been swapped
        // to .mp4 above (workingBlob/workingFilename). Re-derive from
        // the row directly because we updated the row earlier on remux.
        var freshPath: string
        var freshRow = await admin
          .from('report_videos')
          .select('storage_path')
          .eq('id', (video as any).id)
          .single()
        freshPath = ((freshRow.data as any)?.storage_path) || (video as any).storage_path
        var fdot = freshPath.lastIndexOf('.')
        var posterPath = fdot > 0 ? (freshPath.substring(0, fdot) + '.jpg') : (freshPath + '.jpg')
        var posterUpload = await admin.storage
          .from(workingBucket)
          .upload(posterPath, posterResult.blob, {
            contentType: 'image/jpeg',
            upsert: true,
          })
        if (posterUpload.error) {
          console.warn('[video/finalize] poster upload non-OK:', posterUpload.error.message)
        } else {
          console.log('[video/finalize] poster OK path=' + posterPath + ' bytes=' + (posterResult.sizeBytes || 0))
        }
      } else {
        console.warn('[video/finalize] poster extract failed (non-fatal):', posterResult.error)
      }
    } catch (posterErr: any) {
      console.warn('[video/finalize] poster pipeline threw (non-fatal):', posterErr?.message || posterErr)
    }

    var whisper = await runWhisper(workingBlob, workingFilename)
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

    // Panel-feedback (May 2026 — 6th round, 2nd fix): also sync the
    // transcript + Haiku-suggested description into reports.description
    // so the Lab story card and any pre-publish surfaces show real
    // content instead of the "(Video uploading; transcript and details
    // pending.)" placeholder. Only overwrite when the description still
    // matches the placeholder — never trample user-typed content.
    try {
      var PLACEHOLDER_RE = /\(Video uploading[^)]*pending\.?\)/i
      var { data: reportNow } = await admin
        .from('reports')
        .select('description, title')
        .eq('id', (video as any).report_id)
        .maybeSingle()

      if (reportNow) {
        var reportUpdate: any = {}
        var currentDesc = String((reportNow as any).description || '')
        var currentTitle = String((reportNow as any).title || '')
        var proposedDesc = (extracted && extracted.proposed_description) || whisper.text || ''
        var proposedTitle = (extracted && extracted.proposed_title) || ''
        if (PLACEHOLDER_RE.test(currentDesc) && proposedDesc.trim().length > 0) {
          reportUpdate.description = proposedDesc.trim().slice(0, 4000)
          reportUpdate.summary = reportUpdate.description.slice(0, 200) + (reportUpdate.description.length > 200 ? '…' : '')
        }
        if (/^Video report/.test(currentTitle) && proposedTitle.trim().length > 0) {
          reportUpdate.title = proposedTitle.trim().slice(0, 140)
        }
        if (Object.keys(reportUpdate).length > 0) {
          reportUpdate.updated_at = new Date().toISOString()
          await (admin.from('reports') as any).update(reportUpdate).eq('id', (video as any).report_id)
        }

        // V11.17.52 — location safety net. The video flow inserts a
        // placeholder report at upload-url time with no real
        // title/description; this finalize step is the first moment
        // we have meaningful text. If the row still has no
        // location_name, try to extract one from the freshly-synced
        // title/description.
        try {
          var { data: locCheck } = await admin
            .from('reports')
            .select('location_name')
            .eq('id', (video as any).report_id)
            .maybeSingle()
          if (locCheck && !(locCheck as any).location_name) {
            var locSvc = await import('@/lib/services/location-extraction.service')
            var resolved = await locSvc.extractAndGeocodeLocation({
              title: reportUpdate.title || currentTitle || null,
              summary: reportUpdate.summary || null,
              description: reportUpdate.description || currentDesc || null,
            })
            if (resolved) {
              await (admin.from('reports') as any).update({
                location_name: resolved.location_name,
                city: resolved.city,
                state_province: resolved.state_province,
                country: resolved.country,
                latitude: resolved.latitude,
                longitude: resolved.longitude,
                location_precision: resolved.location_precision,
              }).eq('id', (video as any).report_id)
              console.log('[video/finalize] Backfilled location: "' + resolved.location_name + '" (' + resolved.confidence + ')')
            }
          }
        } catch (locErr: any) {
          console.warn('[video/finalize] location safety net failed:', locErr?.message || locErr)
        }
      }
    } catch (e: any) {
      console.warn('[video/finalize] report description sync failed (non-fatal):', e?.message)
    }

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
