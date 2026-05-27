#!/usr/bin/env tsx
/**
 * Re-encode user-submitted videos for streaming-friendly playback.
 *
 * V11.17.38 — 1B-light. At current volume (3 user video reports) a full
 * cloud transcoding pipeline is over-engineering. This one-shot script
 * runs locally, pulls each .mov/.mp4 from Supabase, re-encodes with
 * ffmpeg, and writes back. Fixes the "video plays slowly after swipe"
 * UX without infrastructure overhead.
 *
 * What it does per video:
 *   1. Download original from Supabase Storage to a temp file
 *   2. Run ffmpeg with streaming-optimized flags:
 *        -c:v libx264 -profile:v baseline -level 3.1
 *        -movflags +faststart  (moov atom at start)
 *        -vf scale=-2:720      (cap at 720p, keep aspect)
 *        -crf 23               (sensible quality)
 *        -preset medium
 *        -c:a aac -b:a 128k
 *   3. Upload re-encoded .mp4 alongside original (different filename)
 *   4. Update report_videos row: new storage_path + mime_type=video/mp4
 *   5. Optionally delete the original .mov to save bucket space
 *
 * Prereqs:
 *   - ffmpeg installed locally (brew install ffmpeg)
 *   - .env.local with SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *
 * Usage:
 *   set -a; source .env.local; set +a
 *   npx tsx scripts/reencode-user-videos.ts                   # all 3 videos
 *   npx tsx scripts/reencode-user-videos.ts --dry-run         # log only
 *   npx tsx scripts/reencode-user-videos.ts --keep-original   # don't delete .mov
 *   npx tsx scripts/reencode-user-videos.ts --only <video_id> # single video
 */

import 'dotenv/config'
import { createClient } from '@supabase/supabase-js'
import { execSync, spawnSync } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

function parseArgs() {
  const a = process.argv.slice(2)
  return {
    dryRun: a.includes('--dry-run'),
    keepOriginal: a.includes('--keep-original'),
    only: (function () {
      const i = a.indexOf('--only')
      return i >= 0 ? a[i + 1] : null
    })(),
  }
}

function ensureFfmpeg(): void {
  try {
    execSync('ffmpeg -version', { stdio: 'pipe' })
  } catch (_e) {
    console.error('ERROR: ffmpeg not found on PATH.')
    console.error('Install with: brew install ffmpeg')
    process.exit(1)
  }
}

interface VideoRow {
  id: string
  report_id: string
  storage_bucket: string
  storage_path: string
  mime_type: string
  duration_sec: number | null
  status: string
}

async function downloadOriginal(supabase: any, v: VideoRow, destPath: string): Promise<void> {
  const { data, error } = await supabase.storage.from(v.storage_bucket).download(v.storage_path)
  if (error) throw new Error('download failed: ' + error.message)
  const buf = Buffer.from(await data.arrayBuffer())
  fs.writeFileSync(destPath, buf)
}

function transcode(inputPath: string, outputPath: string): { sizeBytes: number; sizeMb: string } {
  const args = [
    '-y',                            // overwrite output
    '-i', inputPath,
    '-c:v', 'libx264',
    '-profile:v', 'baseline',         // widest device compatibility
    '-level', '3.1',
    '-pix_fmt', 'yuv420p',            // QuickTime / older device support
    '-vf', 'scale=-2:720',            // cap at 720p tall, even pixels
    '-crf', '23',                      // visually transparent at 720p
    '-preset', 'medium',
    '-movflags', '+faststart',        // moov atom at start = instant play
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ar', '44100',
    outputPath,
  ]
  console.log('  ffmpeg ' + args.slice(0, 4).join(' ') + ' ... ' + outputPath)
  const res = spawnSync('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] })
  if (res.status !== 0) {
    const stderr = res.stderr ? res.stderr.toString() : ''
    throw new Error('ffmpeg failed (exit ' + res.status + '):\n' + stderr.split('\n').slice(-15).join('\n'))
  }
  const stat = fs.statSync(outputPath)
  return { sizeBytes: stat.size, sizeMb: (stat.size / (1024 * 1024)).toFixed(2) }
}

async function uploadEncoded(supabase: any, v: VideoRow, encodedPath: string): Promise<string> {
  // Derive new storage_path by swapping the extension to .mp4. We keep
  // the same directory structure so signed URLs continue to resolve.
  const dot = v.storage_path.lastIndexOf('.')
  const base = dot > 0 ? v.storage_path.substring(0, dot) : v.storage_path
  const newPath = base + '.mp4'
  if (newPath === v.storage_path) {
    // Already .mp4 — append a -reenc suffix so we don't overwrite
    // before the DB update lands.
    return uploadEncoded(supabase, { ...v, storage_path: base + '-reenc.mp4' }, encodedPath)
  }
  const buf = fs.readFileSync(encodedPath)
  const { error } = await supabase.storage
    .from(v.storage_bucket)
    .upload(newPath, buf, { contentType: 'video/mp4', upsert: true })
  if (error) throw new Error('upload failed: ' + error.message)
  return newPath
}

async function deleteOriginal(supabase: any, v: VideoRow): Promise<void> {
  if (v.storage_path.endsWith('.mp4')) return  // safety — never delete an .mp4
  const { error } = await supabase.storage.from(v.storage_bucket).remove([v.storage_path])
  if (error) console.warn('  ! delete original failed:', error.message)
}

async function updateRow(supabase: any, videoId: string, newPath: string): Promise<void> {
  const { error } = await supabase
    .from('report_videos')
    .update({ storage_path: newPath, mime_type: 'video/mp4' })
    .eq('id', videoId)
  if (error) throw new Error('row update failed: ' + error.message)
}

async function main() {
  const args = parseArgs()
  console.log('Re-encode user videos — V11.17.38')
  console.log('args:', JSON.stringify(args))
  ensureFfmpeg()

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const sel = supabase.from('report_videos').select('id, report_id, storage_bucket, storage_path, mime_type, duration_sec, status').eq('status', 'ready')
  const q = args.only ? sel.eq('id', args.only) : sel
  const { data: rows, error } = await q
  if (error) { console.error('fetch failed:', error.message); process.exit(1) }
  if (!rows || rows.length === 0) { console.log('No videos to process.'); return }
  console.log('Found ' + rows.length + ' video(s) to re-encode\n')

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'paradocs-reenc-'))
  console.log('temp dir:', tmpDir, '\n')

  let processed = 0
  let failed = 0
  let bytesIn = 0
  let bytesOut = 0

  for (const v of rows as VideoRow[]) {
    console.log('=== Video ' + v.id + ' ===')
    console.log('  report_id:', v.report_id)
    console.log('  path:     ', v.storage_path)
    console.log('  mime:     ', v.mime_type, '| duration:', v.duration_sec, 's')

    if (args.dryRun) { console.log('  [DRY-RUN] skip\n'); continue }

    const originalPath = path.join(tmpDir, v.id + path.extname(v.storage_path) || '.mov')
    const encodedPath = path.join(tmpDir, v.id + '.mp4')

    try {
      console.log('  → download...')
      await downloadOriginal(supabase, v, originalPath)
      const inStat = fs.statSync(originalPath)
      bytesIn += inStat.size
      console.log('  → original size:', (inStat.size / (1024 * 1024)).toFixed(2), 'MB')

      console.log('  → transcode...')
      const out = transcode(originalPath, encodedPath)
      bytesOut += out.sizeBytes
      console.log('  → encoded size: ', out.sizeMb, 'MB',
        '(', ((1 - out.sizeBytes / inStat.size) * 100).toFixed(1) + '% smaller', ')')

      console.log('  → upload...')
      const newPath = await uploadEncoded(supabase, v, encodedPath)
      console.log('  → uploaded to:  ', newPath)

      console.log('  → update DB row...')
      await updateRow(supabase, v.id, newPath)

      if (!args.keepOriginal && v.storage_path !== newPath) {
        console.log('  → delete original (.mov)...')
        await deleteOriginal(supabase, v)
      }

      // Clean up temp files
      try { fs.unlinkSync(originalPath) } catch (_) {}
      try { fs.unlinkSync(encodedPath) } catch (_) {}

      processed++
      console.log('  ✓ done\n')
    } catch (e: any) {
      failed++
      console.error('  ✗ FAILED:', e?.message || e, '\n')
    }
  }

  console.log('========== SUMMARY ==========')
  console.log('Processed:    ', processed)
  console.log('Failed:       ', failed)
  console.log('Total in:     ', (bytesIn / (1024 * 1024)).toFixed(2), 'MB')
  console.log('Total out:    ', (bytesOut / (1024 * 1024)).toFixed(2), 'MB')
  if (bytesIn > 0) {
    console.log('Reduction:    ', ((1 - bytesOut / bytesIn) * 100).toFixed(1) + '%')
  }
  console.log('temp dir:     ', tmpDir, '(safe to delete)')
}

main().catch(e => { console.error('Fatal:', e?.stack || e?.message || e); process.exit(1) })
