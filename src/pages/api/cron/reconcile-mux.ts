/**
 * GET /api/cron/reconcile-mux
 *
 * V11.17.39 — Vercel cron that reconciles report_videos.mux_status with
 * the canonical Mux side. Backstop for webhook drift: if a webhook
 * delivery fails (signature mismatch, transient 5xx, env-var rotation,
 * Mux UI not surfacing delivery logs to debug), this cron catches
 * any video stuck in `mux_status='pending'` whose Mux asset is actually
 * ready.
 *
 * Cadence: every 5 minutes (configured in vercel.json).
 * Idempotent — pure UPDATE based on Mux's authoritative state.
 *
 * Auth: Vercel cron uses Authorization: Bearer <CRON_SECRET>. We also
 * gate on a presence check for MUX credentials so this no-ops cleanly
 * in environments without Mux configured.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import Mux from '@mux/mux-node'

const MAX_RECONCILE_PER_RUN = 50

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Vercel cron pings reach us as GET with the Authorization bearer.
  // The CRON_SECRET header check matches the convention used by other
  // /api/cron/* endpoints in this codebase.
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const auth = req.headers.authorization || ''
    if (auth !== 'Bearer ' + cronSecret) {
      return res.status(401).json({ error: 'unauthorized' })
    }
  }

  const muxTokenId = process.env.MUX_TOKEN_ID || ''
  const muxTokenSecret = process.env.MUX_TOKEN_SECRET || ''
  if (!muxTokenId || !muxTokenSecret) {
    return res.status(200).json({ ok: true, skipped: 'mux_not_configured' })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const mux = new Mux({ tokenId: muxTokenId, tokenSecret: muxTokenSecret })

  // Pull rows that are 'pending' on our side. We don't reconcile
  // already-'ready' rows because Mux is the source of truth for those
  // and there's no benefit to re-checking, and we don't poke 'errored'
  // rows because the operator should investigate manually.
  const { data: rows, error } = await supabase
    .from('report_videos')
    .select('id, mux_asset_id, mux_status, mux_playback_id, mux_ready_at')
    .eq('mux_status', 'pending')
    .not('mux_asset_id', 'is', null)
    .limit(MAX_RECONCILE_PER_RUN)

  if (error) {
    return res.status(500).json({ error: 'db_fetch_failed', message: error.message })
  }
  if (!rows || rows.length === 0) {
    return res.status(200).json({ ok: true, checked: 0 })
  }

  let synced = 0
  let stillEncoding = 0
  let errored = 0

  for (const v of rows as any[]) {
    try {
      const asset: any = await mux.video.assets.retrieve(v.mux_asset_id)
      const muxStatus: string = asset.status
      if (muxStatus === 'ready') {
        const playbackId: string | null =
          (asset.playback_ids && asset.playback_ids[0]?.id) || v.mux_playback_id
        const duration: number | null =
          typeof asset.duration === 'number' ? asset.duration : null
        const update: any = {
          mux_status: 'ready',
          mux_error: null,
        }
        if (playbackId) update.mux_playback_id = playbackId
        if (duration) update.mux_duration_sec = duration
        if (!v.mux_ready_at) update.mux_ready_at = new Date().toISOString()
        const { error: upErr } = await supabase
          .from('report_videos')
          .update(update)
          .eq('id', v.id)
        if (upErr) {
          errored++
          console.warn('[cron/reconcile-mux] update failed', v.id, upErr.message)
        } else {
          synced++
        }
      } else if (muxStatus === 'errored') {
        const errors: string[] = (asset.errors?.messages || []) as string[]
        await supabase
          .from('report_videos')
          .update({
            mux_status: 'errored',
            mux_error: (errors.join(' | ') || 'unknown').substring(0, 1000),
          })
          .eq('id', v.id)
        errored++
      } else {
        stillEncoding++
      }
    } catch (e: any) {
      errored++
      console.warn('[cron/reconcile-mux] asset retrieve failed', v.id, e?.message)
    }
  }

  return res.status(200).json({
    ok: true,
    checked: rows.length,
    synced,
    stillEncoding,
    errored,
  })
}
