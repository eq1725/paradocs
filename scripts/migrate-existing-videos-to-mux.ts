#!/usr/bin/env tsx
/**
 * One-shot: push existing user-submitted videos to Mux.
 *
 * V11.17.39 — the publish endpoint pushes new videos to Mux at moderation-
 * pass time, but the 3 videos already approved before this migration
 * never got pushed. This script handles them: signs a Supabase URL,
 * calls Mux Asset.Create, stores the asset_id + playback_id back to
 * report_videos. The webhook will fire when encoding finishes and
 * flip mux_status to 'ready'.
 *
 * Idempotent: skips rows that already have a mux_asset_id.
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/migrate-existing-videos-to-mux.ts            # all
 *   npx tsx scripts/migrate-existing-videos-to-mux.ts --dry-run  # log only
 *   npx tsx scripts/migrate-existing-videos-to-mux.ts --only <video_id>
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { muxConfigured, createMuxAssetFromUrl } from '../src/lib/services/mux.service'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  return {
    dryRun: a.includes('--dry-run'),
    only: (function () {
      const i = a.indexOf('--only')
      return i >= 0 ? a[i + 1] : null
    })(),
  }
}

async function main() {
  const args = parseArgs()
  console.log('Migrate existing videos → Mux (V11.17.39)')
  console.log('args:', JSON.stringify(args))

  if (!muxConfigured()) {
    console.error('ERROR: MUX_TOKEN_ID + MUX_TOKEN_SECRET must be set in .env.local')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

  let q = supabase
    .from('report_videos')
    .select('id, report_id, storage_bucket, storage_path, mime_type, duration_sec, status, mux_asset_id')
    .eq('status', 'ready')
  if (args.only) q = q.eq('id', args.only) as any

  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No ready videos found.'); return }

  console.log('Found ' + rows.length + ' ready video(s)\n')

  let pushed = 0
  let skipped = 0
  let failed = 0

  for (const v of rows as any[]) {
    console.log('=== Video ' + v.id + ' ===')
    console.log('  report_id:', v.report_id)
    console.log('  path:     ', v.storage_path)

    if (v.mux_asset_id) {
      console.log('  → already has mux_asset_id (' + v.mux_asset_id + ') — skip')
      skipped++
      continue
    }

    if (args.dryRun) {
      console.log('  [DRY-RUN] would push to Mux')
      continue
    }

    try {
      const bucket = v.storage_bucket || 'report_videos'
      const signed = await (supabase.storage as any)
        .from(bucket)
        .createSignedUrl(v.storage_path, 24 * 60 * 60)
      if (!signed?.data?.signedUrl) {
        console.error('  ✗ could not sign Supabase URL')
        failed++
        continue
      }
      console.log('  → signed Supabase URL OK')

      const asset = await createMuxAssetFromUrl(signed.data.signedUrl, { passthrough: v.id })
      console.log('  → Mux Asset.Create OK', 'asset_id=' + asset.asset_id, 'playback_id=' + asset.playback_id)

      const { error: updateErr } = await supabase.from('report_videos').update({
        mux_asset_id: asset.asset_id,
        mux_playback_id: asset.playback_id,
        mux_status: 'pending',
        mux_uploaded_at: new Date().toISOString(),
      }).eq('id', v.id)

      if (updateErr) {
        console.error('  ✗ DB update failed:', updateErr.message)
        failed++
        continue
      }
      console.log('  ✓ DB updated; webhook will flip mux_status to ready when encoding finishes')
      pushed++
    } catch (e: any) {
      console.error('  ✗ FAILED:', e?.message || e)
      failed++
    }
    console.log()
  }

  console.log('========== SUMMARY ==========')
  console.log('Pushed:    ', pushed)
  console.log('Skipped:   ', skipped, '(already migrated)')
  console.log('Failed:    ', failed)
  console.log()
  console.log('Mux is encoding the pushed videos asynchronously (30-120s typical).')
  console.log('Check mux_status in 2 min:')
  console.log("  SELECT id, mux_status, mux_playback_id FROM report_videos WHERE mux_asset_id IS NOT NULL;")
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
