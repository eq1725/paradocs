#!/usr/bin/env tsx
/**
 * One-off backfill: extract poster JPEGs from existing report_videos
 * rows that don't have a sibling .jpg in Storage.
 *
 * Use when:
 *   - Adding the V10.7.E.15 server-side poster pipeline retroactively
 *     to rows that were uploaded before it existed
 *   - Recovering from a Storage incident that wiped poster files
 *   - Resyncing posters after a video gets re-uploaded
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/backfill-video-posters.ts            # all rows
 *   REPORT_ID=<uuid> npx tsx scripts/backfill-video-posters.ts
 *   DRY_RUN=1 npx tsx scripts/backfill-video-posters.ts  # list, don't extract
 *   LIMIT=10 npx tsx scripts/backfill-video-posters.ts   # cap how many
 *
 * Reads SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY from env.
 *
 * SWC: var + function() form.
 */

import { createClient } from '@supabase/supabase-js'
import { extractPosterFrame } from '../src/lib/services/video-remux.service'

async function main() {
  var supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  var supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!supabaseUrl || !supabaseKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  var supabase = createClient(supabaseUrl, supabaseKey)
  var dryRun = process.env.DRY_RUN === '1'
  var reportId = process.env.REPORT_ID || null
  var limit = parseInt(process.env.LIMIT || '50', 10) || 50

  console.log('=== Poster backfill ===')
  console.log('dry_run: ' + dryRun)
  console.log('report_id: ' + (reportId || '(all)'))
  console.log('limit: ' + limit)

  var query = supabase
    .from('report_videos')
    .select('id, report_id, storage_bucket, storage_path, status, mime_type')
    .order('uploaded_at', { ascending: false })
    .limit(limit)
  if (reportId) query = query.eq('report_id', reportId)

  var { data: rows, error } = await query
  if (error) {
    console.error('Query failed:', error.message)
    process.exit(1)
  }
  if (!rows || rows.length === 0) {
    console.log('No report_videos rows to process.')
    return
  }

  console.log('Found ' + rows.length + ' video rows. Checking which need posters…\n')

  var ok = 0
  var skipped = 0
  var failed = 0

  for (var i = 0; i < rows.length; i++) {
    var row: any = rows[i]
    var bucket: string = row.storage_bucket || 'report_videos'
    var dot = (row.storage_path as string).lastIndexOf('.')
    var posterPath = dot > 0 ? (row.storage_path.substring(0, dot) + '.jpg') : (row.storage_path + '.jpg')

    var label = '[' + (i + 1) + '/' + rows.length + '] ' + row.id + ' (status=' + row.status + ')'

    // Does a poster already exist?
    var dirParts = posterPath.split('/')
    var posterName = dirParts.pop() || ''
    var dirPath = dirParts.join('/')
    var listRes = await supabase.storage.from(bucket).list(dirPath, { search: posterName, limit: 5 })
    var hasPoster = !!(listRes.data || []).find(function (e: any) { return e.name === posterName })

    if (hasPoster) {
      console.log(label + ' ✓ already has poster, skipping')
      skipped++
      continue
    }

    console.log(label + ' generating poster…')
    if (dryRun) {
      console.log('  DRY_RUN — would extract from ' + row.storage_path + ' → ' + posterPath)
      continue
    }

    try {
      // Download the video bytes.
      var dlRes = await supabase.storage.from(bucket).download(row.storage_path)
      if (dlRes.error || !dlRes.data) {
        console.warn('  ✗ download failed: ' + (dlRes.error?.message || 'no data'))
        failed++
        continue
      }
      var fname = (row.storage_path as string).split('/').pop() || 'in.mp4'
      var pRes = await extractPosterFrame(dlRes.data as Blob, fname)
      if (!pRes.ok || !pRes.blob) {
        console.warn('  ✗ extract failed: ' + pRes.error)
        failed++
        continue
      }
      var upRes = await supabase.storage.from(bucket).upload(posterPath, pRes.blob, {
        contentType: 'image/jpeg',
        upsert: true,
      })
      if (upRes.error) {
        console.warn('  ✗ upload failed: ' + upRes.error.message)
        failed++
        continue
      }
      console.log('  ✓ saved ' + (pRes.sizeBytes || 0) + ' bytes to ' + posterPath)
      ok++
    } catch (e: any) {
      console.warn('  ✗ threw: ' + (e?.message || e))
      failed++
    }
  }

  console.log('\n=== Done ===')
  console.log('  posters generated: ' + ok)
  console.log('  already had poster: ' + skipped)
  console.log('  failed: ' + failed)
}

main().catch(function (e: any) {
  console.error('Fatal:', e?.message || e)
  process.exit(1)
})
