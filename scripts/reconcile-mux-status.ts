#!/usr/bin/env tsx
/**
 * Reconcile report_videos.mux_status with the actual Mux side.
 *
 * V11.17.39 — webhook deliveries can fail (signature mismatch, env-var
 * drift, network glitch). When they do, our DB stays at mux_status
 * 'pending' forever even though Mux finished encoding. This script
 * pulls the canonical state from Mux for every row with a mux_asset_id
 * and updates ours to match.
 *
 * Safe to run as a recurring cron — pure UPDATE, no destructive ops.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/reconcile-mux-status.ts             # all
 *   npx tsx scripts/reconcile-mux-status.ts --pending   # only pending
 *   npx tsx scripts/reconcile-mux-status.ts --dry-run
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import Mux from '@mux/mux-node'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID || ''
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET || ''

function parseArgs() {
  const a = process.argv.slice(2)
  return {
    dryRun: a.includes('--dry-run'),
    onlyPending: a.includes('--pending'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Reconcile Mux status — V11.17.39')
  console.log('args:', JSON.stringify(args))

  if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
    console.error('MUX_TOKEN_ID/MUX_TOKEN_SECRET not set'); process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const mux = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET })

  let q = supabase.from('report_videos')
    .select('id, mux_asset_id, mux_status, mux_playback_id')
    .not('mux_asset_id', 'is', null)
  if (args.onlyPending) q = q.eq('mux_status', 'pending') as any

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No rows to reconcile.'); return }

  console.log('Reconciling ' + rows.length + ' video(s)\n')

  let synced = 0
  let unchanged = 0
  let stillEncoding = 0
  let errored = 0

  for (const v of rows as any[]) {
    try {
      const asset: any = await mux.video.assets.retrieve(v.mux_asset_id)
      // Mux's asset.status values: 'preparing' | 'ready' | 'errored'
      const muxStatus: string = asset.status
      const playbackId: string | null = (asset.playback_ids && asset.playback_ids[0]?.id) || v.mux_playback_id
      const duration: number | null = typeof asset.duration === 'number' ? asset.duration : null
      const errors: string[] = (asset.errors?.messages || []) as string[]

      let ourStatus: string
      const update: any = {}
      if (muxStatus === 'ready') {
        ourStatus = 'ready'
        update.mux_status = 'ready'
        update.mux_playback_id = playbackId
        if (duration) update.mux_duration_sec = duration
        if (!v.mux_ready_at) update.mux_ready_at = new Date().toISOString()
        update.mux_error = null
      } else if (muxStatus === 'errored') {
        ourStatus = 'errored'
        update.mux_status = 'errored'
        update.mux_error = (errors.join(' | ') || 'unknown').substring(0, 1000)
      } else {
        ourStatus = 'pending'
        stillEncoding++
        console.log('  ' + v.id.substring(0, 8) + ' → still encoding (' + muxStatus + ')')
        continue
      }

      if (v.mux_status === ourStatus && (ourStatus !== 'ready' || v.mux_playback_id === playbackId)) {
        unchanged++
        console.log('  ' + v.id.substring(0, 8) + ' → already ' + ourStatus + ' (no-op)')
        continue
      }

      if (args.dryRun) {
        console.log('  ' + v.id.substring(0, 8) + ' → [DRY] would set ' + ourStatus)
        continue
      }
      const { error: upErr } = await supabase.from('report_videos').update(update).eq('id', v.id)
      if (upErr) { errored++; console.error('  ' + v.id.substring(0, 8) + ' → DB update failed:', upErr.message); continue }
      synced++
      console.log('  ' + v.id.substring(0, 8) + ' → synced to ' + ourStatus + (ourStatus === 'ready' ? ' (playback ' + (playbackId || '').substring(0, 12) + '…)' : ''))
    } catch (e: any) {
      errored++
      console.error('  ' + v.id.substring(0, 8) + ' → FAILED:', e?.message || e)
    }
  }

  console.log('\n========== SUMMARY ==========')
  console.log('Synced:        ', synced)
  console.log('Unchanged:     ', unchanged)
  console.log('Still encoding:', stillEncoding)
  console.log('Errored:       ', errored)
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
