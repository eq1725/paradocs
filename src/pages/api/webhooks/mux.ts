/**
 * POST /api/webhooks/mux
 *
 * V11.17.39 — receives Mux video lifecycle events.
 *
 * Events we care about:
 *   - video.asset.ready    → Mux finished encoding; update mux_status='ready'
 *                            + write mux_playback_id back to report_videos
 *   - video.asset.errored  → set mux_status='errored', stash error message;
 *                            the feed will fall back to Supabase signed URL
 *
 * Other events (video.asset.created, .updated, .live_stream.*) are
 * acknowledged with 200 OK but ignored.
 *
 * Auth: HMAC-SHA256 signature in `mux-signature` header verified against
 * MUX_WEBHOOK_SECRET. Without this, anyone with the URL could fake
 * "ready" events.
 *
 * Idempotency: same event may fire multiple times. We match on
 * mux_asset_id and only update fields that change; UPDATE with
 * eq(asset_id) is safe to re-run.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import { verifyMuxWebhookSignature } from '@/lib/services/mux.service'

// Disable the default body parser so we can read the raw body for HMAC
// signature verification. Mux signs the exact bytes that were sent;
// JSON-parsing first then re-stringifying loses key order and breaks
// the hash.
export const config = {
  api: { bodyParser: false },
}

async function readRawBody(req: NextApiRequest): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  const rawBody = await readRawBody(req)
  const sig = (req.headers['mux-signature'] as string) || ''

  if (!verifyMuxWebhookSignature(rawBody, sig)) {
    console.warn('[mux-webhook] signature verification failed')
    return res.status(401).json({ error: 'invalid_signature' })
  }

  let event: any
  try {
    event = JSON.parse(rawBody)
  } catch (_e) {
    return res.status(400).json({ error: 'invalid_json' })
  }

  const type: string = event?.type || ''
  const data: any = event?.data || {}
  const assetId: string = data?.id || ''

  // Always log so we have a paper trail in Vercel function logs.
  console.log('[mux-webhook] type=' + type + ' asset_id=' + assetId)

  if (!assetId) return res.status(200).json({ ok: true, ignored: 'no_asset_id' })

  // Only act on the two events we care about.
  if (type !== 'video.asset.ready' && type !== 'video.asset.errored') {
    return res.status(200).json({ ok: true, ignored: type })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  if (type === 'video.asset.ready') {
    // Mux includes the first playback_id in data.playback_ids[]. If
    // somehow it's missing, fall back to the one we stashed at
    // Asset.Create time (already in our DB).
    const playbackId: string | null = (data?.playback_ids && data.playback_ids[0]?.id) || null
    const durationSec: number | null = typeof data?.duration === 'number' ? data.duration : null

    const update: any = {
      mux_status: 'ready',
      mux_ready_at: new Date().toISOString(),
      mux_error: null,
    }
    if (playbackId) update.mux_playback_id = playbackId
    if (durationSec) update.mux_duration_sec = durationSec

    const { error } = await supabase
      .from('report_videos')
      .update(update)
      .eq('mux_asset_id', assetId)

    if (error) {
      console.error('[mux-webhook] update failed:', error.message)
      return res.status(500).json({ error: 'db_update_failed' })
    }
    return res.status(200).json({ ok: true, type, asset_id: assetId, playback_id: playbackId })
  }

  // video.asset.errored
  const errorMessages: string[] = (data?.errors?.messages || []) as string[]
  const errorText = errorMessages.length > 0 ? errorMessages.join(' | ') : 'unknown'
  console.error('[mux-webhook] asset errored:', assetId, errorText)

  const { error } = await supabase
    .from('report_videos')
    .update({
      mux_status: 'errored',
      mux_error: errorText.substring(0, 1000),
    })
    .eq('mux_asset_id', assetId)
  if (error) {
    console.error('[mux-webhook] errored-update failed:', error.message)
    return res.status(500).json({ error: 'db_update_failed' })
  }
  return res.status(200).json({ ok: true, type, asset_id: assetId, error: errorText })
}
