/**
 * video-transcribe.service — Whisper transcription + Haiku metadata
 *
 * Panel-feedback (May 2026 — 3rd round). Shared between:
 *   - /api/reports/video/[id]/finalize (synchronous inline call so
 *     transcript is ready by the time the user lands on review)
 *   - /api/cron/transcribe-videos (backup retry every 5 min for any
 *     row that timed out or failed during finalize)
 *
 * Cost: Whisper $0.006/min audio + Haiku ~$0.0005/call ≈ $0.013/video
 * at 2-min avg. Trivial against any plausible revenue.
 *
 * SWC: var + function() form (consistent with the rest of the codebase).
 */

import Anthropic from '@anthropic-ai/sdk'

var anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

export interface WhisperResult {
  text: string
  language?: string
  segments?: Array<{
    start: number
    end: number
    text: string
  }>
}

export interface ExtractedMeta {
  proposed_title?: string
  proposed_description?: string
  location_hints?: string[]
  date_hints?: string[]
  category_hints?: string[]
}

/**
 * Patch an iPhone .mov file's ftyp box from QuickTime brand ('qt  ')
 * to MP4 brand ('mp42'). The first 24 bytes of an MP4/MOV file are:
 *
 *   [0..3]   uint32 BE box_size      (typically 32 for ftyp)
 *   [4..7]   'ftyp'                  (box type)
 *   [8..11]  major_brand             ('qt  ' = QuickTime, 'isom'/'mp42' = MP4)
 *   [12..15] minor_version
 *   [16..N]  compatible_brands       (each 4 bytes)
 *
 * iPhone QuickTime files use 'qt  ' as major_brand. Whisper does
 * byte-level sniffing and rejects this even after we rename the
 * filename and Content-Type. Patching the brand to 'mp42' tells
 * Whisper to parse as MP4 — which works because the underlying
 * H.264/HEVC + AAC streams are MP4-compatible.
 *
 * Also patches compatible_brands occurrences of 'qt  ' so Whisper
 * doesn't see the QuickTime hint in the secondary list.
 *
 * Returns the original bytes if no patching is needed.
 */
function patchMovFtypToMp4(buf: ArrayBuffer): ArrayBuffer {
  var u8 = new Uint8Array(buf)
  if (u8.length < 24) return buf
  // Confirm ftyp box at offset 4-7.
  if (u8[4] !== 0x66 || u8[5] !== 0x74 || u8[6] !== 0x79 || u8[7] !== 0x70) {
    return buf
  }
  // Read box size from bytes 0-3 (big-endian uint32). Constrain to
  // a sane range so we don't walk off the end on a corrupt header.
  var boxSize = (u8[0] << 24) | (u8[1] << 16) | (u8[2] << 8) | u8[3]
  if (boxSize < 16 || boxSize > Math.min(u8.length, 256)) {
    // Default to a conservative scan size if box_size looks wrong.
    boxSize = Math.min(64, u8.length)
  }
  var patched = false
  // Major brand at 8-11.
  if (u8[8] === 0x71 && u8[9] === 0x74 && u8[10] === 0x20 && u8[11] === 0x20) {
    u8[8] = 0x6d  // 'm'
    u8[9] = 0x70  // 'p'
    u8[10] = 0x34 // '4'
    u8[11] = 0x32 // '2'
    patched = true
  }
  // Compatible brands run from offset 16 to boxSize. Each is 4 bytes.
  for (var i = 16; i + 4 <= boxSize; i += 4) {
    if (u8[i] === 0x71 && u8[i + 1] === 0x74 && u8[i + 2] === 0x20 && u8[i + 3] === 0x20) {
      u8[i] = 0x6d
      u8[i + 1] = 0x70
      u8[i + 2] = 0x34
      u8[i + 3] = 0x32
      patched = true
    }
  }
  if (patched) {
    console.log('[video-transcribe] patched ftyp box (qt   → mp42)')
  }
  return buf
}

/**
 * Send a video Blob to OpenAI Whisper. Returns the transcription
 * plus word-level segments for caption generation.
 *
 * Panel-feedback (May 2026 — 5th round, 3rd fix):
 *   First fix: rename filename to .mp4. Insufficient.
 *   Second fix: also wrap Blob with type='video/mp4'. Insufficient.
 *   Third fix: also patch the ftyp box major_brand from 'qt  ' to
 *     'mp42' in-place. Whisper does byte-level sniffing of the MP4
 *     container header and rejects 'qt  ' brand specifically. Patching
 *     the brand metadata is safe because iPhone .mov audio/video
 *     streams are MP4-compatible (H.264/HEVC + AAC inside MPEG-4 Part
 *     14 container).
 *
 * Also adds aggressive logging so failures are debuggable.
 *
 * Throws on Whisper API failure — callers should retry with backoff
 * or fall back to manual review.
 */
export async function runWhisper(blob: Blob, filename: string): Promise<WhisperResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured')
  }
  var lcName = (filename || '').toLowerCase()
  var lcType = (blob.type || '').toLowerCase()
  var whisperFilename = filename || 'video.mp4'
  var targetMime = 'video/mp4'
  var needsFtypPatch = false

  if (lcType.indexOf('webm') !== -1 || lcName.endsWith('.webm')) {
    targetMime = 'video/webm'
    if (!lcName.endsWith('.webm')) whisperFilename = whisperFilename + '.webm'
  } else if (lcName.endsWith('.mov') || lcName.endsWith('.m4v') || lcType.indexOf('quicktime') !== -1) {
    whisperFilename = whisperFilename.replace(/\.(mov|m4v)$/i, '') + '.mp4'
    targetMime = 'video/mp4'
    needsFtypPatch = true
  } else if (!/\.(flac|m4a|mp3|mp4|mpeg|mpga|oga|ogg|wav|webm)$/i.test(lcName)) {
    whisperFilename = whisperFilename + '.mp4'
    targetMime = 'video/mp4'
    // Could be QuickTime with no extension hint — patch defensively.
    needsFtypPatch = true
  }

  console.log('[video-transcribe] runWhisper',
    'in_filename=' + filename,
    'in_blob_type=' + lcType,
    'out_filename=' + whisperFilename,
    'out_mime=' + targetMime,
    'needs_ftyp_patch=' + needsFtypPatch,
    'bytes=' + blob.size)

  // Read the bytes ONCE for inspection + (optional) ftyp patch.
  var ab = await blob.arrayBuffer()
  if (needsFtypPatch) ab = patchMovFtypToMp4(ab)

  // Log the first 16 bytes (hex) so we can see what Whisper sees.
  // Useful if the patch path isn't matching what we expect.
  try {
    var head = new Uint8Array(ab).slice(0, 16)
    var hex = Array.from(head).map(function (b: number) {
      return b.toString(16).padStart(2, '0')
    }).join(' ')
    console.log('[video-transcribe] first 16 bytes hex:', hex)
  } catch {}

  var whisperBlob = new Blob([ab], { type: targetMime })

  var form = new FormData()
  form.append('file', whisperBlob, whisperFilename)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'segment')

  var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY },
    body: form,
  })
  if (!resp.ok) {
    var text = await resp.text()
    console.error('[video-transcribe] Whisper rejected', resp.status, text.slice(0, 300))
    throw new Error('Whisper API ' + resp.status + ': ' + text.slice(0, 200))
  }
  console.log('[video-transcribe] Whisper accepted')
  return await resp.json()
}

var HAIKU_EXTRACT_SYSTEM = [
  'You analyze short first-person video transcripts about paranormal, UFO, or unexplained experiences and produce structured metadata.',
  '',
  'Return a JSON object with these keys (no preamble, no markdown, no code fences):',
  '{',
  '  "proposed_title": string,           // 4-10 words, sentence case, no quotes/emoji',
  '  "proposed_description": string,     // a 2-4 sentence FIRST-PERSON summary',
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
  '',
  'CRITICAL — proposed_description voice rules:',
  '- Write in FIRST PERSON throughout: use "I", "me", "my", "we", "us", "our".',
  '- NEVER use "the author", "the witness", "the speaker", "the narrator", "they", "the person", or any other third-person framing for the storyteller.',
  '- If the transcript says "I was 10 and my mom and I were driving", write "I was 10 and my mom and I were driving" — preserve the storyteller\'s direct voice.',
  '- Title can be third-person headline style ("Triangular UFO Over Bridge") — only the description must be first-person.',
].join('\n')

/**
 * Run Haiku over a transcript to extract structured metadata for
 * prefilling the review form. Never throws — returns null on any
 * failure so the caller can fall through to a manual flow.
 */
export async function runHaikuExtract(transcript: string): Promise<ExtractedMeta | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  if (!transcript || transcript.trim().length < 20) return null
  try {
    var resp = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      temperature: 0.2,
      system: HAIKU_EXTRACT_SYSTEM,
      messages: [{ role: 'user', content: 'Transcript:\n\n' + transcript.slice(0, 4000) }],
    })
    var block: any = resp.content.find(function (b: any) { return b.type === 'text' })
    var raw = block && block.type === 'text' ? String(block.text || '') : ''
    var cleaned = raw.trim().replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim()
    return JSON.parse(cleaned) as ExtractedMeta
  } catch (e: any) {
    console.warn('[video-transcribe] haiku extract failed:', e?.message)
    return null
  }
}
