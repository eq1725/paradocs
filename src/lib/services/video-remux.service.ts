/**
 * video-remux.service.ts — .mov → MP4 faststart remux for instant playback
 *
 * iPhone .mov files store the moov atom (the file's index of where each
 * sample lives in the byte stream) at the END of the file by default.
 * Browsers need the moov to start playback, so they download the whole
 * file before the first frame appears. That's the 1-3s 'black square'
 * gap visitors see on the Today feed even after we ship a poster image.
 *
 * The fix: re-MUX the same H.264 + AAC streams into an MP4 container
 * with `-movflags +faststart`, which moves the moov atom to the very
 * start of the file. The browser then starts decoding the first segment
 * as soon as the first few KB arrive — TikTok-grade instant feel.
 *
 * Stream-copy only (-c:v copy -c:a copy): no re-encoding, no quality
 * loss, ~1-2s wall-clock for typical short videos (under 60s). Output
 * file is roughly the same size as the input.
 *
 * Runs inside /finalize after the blob is downloaded for Whisper,
 * BEFORE the Whisper call (so Whisper also sees a clean MP4). On
 * success the .mp4 is uploaded to a sibling Storage path and the
 * report_videos row's storage_path is updated.
 *
 * If ffmpeg is unavailable or the remux fails, we surface the error
 * to the caller and let it fall back to keeping the original .mov.
 * The user-facing flow still works; playback is just slower.
 *
 * SWC: var + function() form.
 */

import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'

// Imported lazily because the @ffmpeg-installer module is platform-
// specific binaries that can fail to install in some sandboxes.
// Resolve at call time so a missing install doesn't break unrelated
// code paths.
function resolveFfmpegPath(): string | null {
  try {
    // require() instead of `import` so the binary package is resolved
    // at call time, not at build time. Lets us handle the "installer
    // not present" path gracefully in environments where the package
    // didn't install (e.g. some dev sandboxes).
    var installer = require('@ffmpeg-installer/ffmpeg')
    if (installer && installer.path && typeof installer.path === 'string') {
      return installer.path
    }
  } catch (_) {
    /* installer missing — return null */
  }
  // Fallback: try a system-installed ffmpeg.
  return 'ffmpeg'
}

export interface RemuxResult {
  ok: boolean
  /** Remuxed file as a Blob (MP4 container with faststart). */
  blob?: Blob
  /** Output extension — always 'mp4' on success. */
  ext?: 'mp4'
  /** ffmpeg wall-clock in milliseconds. */
  durationMs?: number
  /** Output size in bytes. */
  sizeBytes?: number
  error?: string
}

/**
 * Run an ffmpeg stream-copy remux from .mov input to .mp4 output
 * with faststart. Works on any input that has H.264 video + AAC
 * audio (the iPhone default since iOS 9). For exotic codecs the
 * stream-copy will fail and we surface the error.
 */
export async function remuxMovToMp4Faststart(
  inputBlob: Blob,
  inputFilename: string
): Promise<RemuxResult> {
  var ffmpegPath = resolveFfmpegPath()
  if (!ffmpegPath) {
    return { ok: false, error: 'ffmpeg not available' }
  }

  // Stage input + output to a temp directory.
  var tmpDir = path.join(os.tmpdir(), 'paradocs-remux-' + crypto.randomUUID())
  await fs.mkdir(tmpDir, { recursive: true })
  var inExt = (inputFilename.split('.').pop() || 'mov').toLowerCase()
  var inPath = path.join(tmpDir, 'in.' + inExt)
  var outPath = path.join(tmpDir, 'out.mp4')

  try {
    // Write input blob to disk.
    var inBuf = Buffer.from(await inputBlob.arrayBuffer())
    await fs.writeFile(inPath, inBuf)

    var startedAt = Date.now()

    // Stream-copy remux. Flags explained:
    //   -y                  overwrite output without prompting
    //   -i <in>             input
    //   -c:v copy           copy video stream as-is (no re-encode)
    //   -c:a copy           copy audio stream as-is
    //   -movflags +faststart   write moov atom at start of file
    //   -map_metadata 0     keep input metadata (creation_time etc.)
    //   -f mp4              force mp4 container
    //
    // The whole operation is essentially a byte-level repack with
    // header rewrite. Typical 30s iPhone clip: <2s wall-clock.
    var args = [
      '-y',
      '-i', inPath,
      '-c:v', 'copy',
      '-c:a', 'copy',
      '-movflags', '+faststart',
      '-map_metadata', '0',
      '-f', 'mp4',
      outPath,
    ]

    var exitCode: number = await new Promise(function (resolve) {
      var proc = spawn(ffmpegPath as string, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      var stderrChunks: Buffer[] = []
      proc.stderr.on('data', function (d: Buffer) { stderrChunks.push(d) })
      proc.on('error', function (e: any) {
        console.warn('[video-remux] ffmpeg spawn error:', e?.message || e)
        resolve(1)
      })
      proc.on('close', function (code: number | null) {
        if (code !== 0 && stderrChunks.length > 0) {
          // Trim to last ~4KB so logs aren't massive.
          var stderr = Buffer.concat(stderrChunks).toString('utf8')
          var tail = stderr.length > 4000 ? stderr.slice(-4000) : stderr
          console.warn('[video-remux] ffmpeg exit ' + code + ' stderr tail:', tail)
        }
        resolve(typeof code === 'number' ? code : 1)
      })
    })

    if (exitCode !== 0) {
      return { ok: false, error: 'ffmpeg exit ' + exitCode }
    }

    var outBuf = await fs.readFile(outPath)
    var durationMs = Date.now() - startedAt
    console.log(
      '[video-remux] OK input=' + inputFilename +
      ' in_bytes=' + inBuf.length +
      ' out_bytes=' + outBuf.length +
      ' ms=' + durationMs
    )

    return {
      ok: true,
      blob: new Blob([new Uint8Array(outBuf)], { type: 'video/mp4' }),
      ext: 'mp4',
      durationMs: durationMs,
      sizeBytes: outBuf.length,
    }
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) }
  } finally {
    // Best-effort cleanup. Vercel /tmp gets reclaimed between invocations
    // anyway but being tidy keeps long-running dev servers clean.
    try { await fs.rm(tmpDir, { recursive: true, force: true }) } catch (_) { /* ignore */ }
  }
}

/**
 * Should this video be remuxed? Yes for anything that looks like a
 * QuickTime/.mov container. We don't bother for .mp4 inputs that
 * already have a faststart-friendly layout from the source.
 * (Some MP4s also have moov at the end — we'd remux those too with
 * a stricter check; for now we trust browser-recorded MP4 / WebM.)
 */
export function shouldRemux(filename: string, mime: string | null | undefined): boolean {
  var ext = (filename.split('.').pop() || '').toLowerCase()
  if (ext === 'mov' || ext === 'qt') return true
  var m = (mime || '').toLowerCase()
  if (m.indexOf('quicktime') !== -1) return true
  return false
}
