/**
 * Mux video pipeline service (V11.17.39).
 *
 * Thin wrapper around the @mux/mux-node SDK. Three concerns live here:
 *
 *   1. createMuxAssetFromUrl — kick off Asset.Create after a user upload
 *      lands in Supabase. We pass Mux a signed Supabase URL; Mux ingests
 *      asynchronously and webhook fires when ready.
 *
 *   2. verifyMuxWebhookSignature — HMAC verify the incoming webhook body
 *      against MUX_WEBHOOK_SECRET. Without this, anyone with the webhook
 *      URL could mark videos as ready / errored.
 *
 *   3. getMuxHlsUrl — given a playback_id, return the streaming URL.
 *      Pure function; no SDK call required because Mux publishes the
 *      URL pattern publicly.
 *
 * Why a wrapper: we want a single point of mock-ability for tests +
 * one place to add cost-tracking later. The SDK itself is small.
 *
 * Env vars (set in Vercel + .env.local):
 *   MUX_TOKEN_ID       — public access token id ("paradocs-server")
 *   MUX_TOKEN_SECRET   — private secret (treat as a password)
 *   MUX_WEBHOOK_SECRET — set up in step 7 after the webhook handler ships
 */

import crypto from 'crypto'
import Mux from '@mux/mux-node'

const MUX_TOKEN_ID = process.env.MUX_TOKEN_ID || ''
const MUX_TOKEN_SECRET = process.env.MUX_TOKEN_SECRET || ''
const MUX_WEBHOOK_SECRET = process.env.MUX_WEBHOOK_SECRET || ''

// Lazy singleton so we don't construct an SDK instance per request.
let _client: Mux | null = null

function getClient(): Mux {
  if (!_client) {
    if (!MUX_TOKEN_ID || !MUX_TOKEN_SECRET) {
      throw new Error('Mux credentials missing (MUX_TOKEN_ID, MUX_TOKEN_SECRET)')
    }
    _client = new Mux({ tokenId: MUX_TOKEN_ID, tokenSecret: MUX_TOKEN_SECRET })
  }
  return _client
}

export function muxConfigured(): boolean {
  return !!(MUX_TOKEN_ID && MUX_TOKEN_SECRET)
}

export interface MuxAssetCreated {
  asset_id: string
  // The first playback_id is set immediately by Asset.Create; the
  // actual ready state lands via webhook later.
  playback_id: string
}

/**
 * Create a Mux asset by URL ingestion. The URL must be reachable from
 * Mux's infra (signed Supabase URLs work fine — Mux fetches the bytes
 * over the public internet).
 *
 * Returns the asset_id + playback_id immediately. Encoding happens
 * asynchronously on Mux's side; we get a video.asset.ready webhook
 * when it's ready to stream.
 */
export async function createMuxAssetFromUrl(
  signedUrl: string,
  meta?: { passthrough?: string }
): Promise<MuxAssetCreated> {
  const client = getClient()
  // V11.17.39 — Mux SDK >= 8 uses `inputs` (plural), `playback_policies`
  // (plural), and `video_quality` (replaces older `encoding_tier`).
  // The 'basic' tier covers our needs at lowest cost; 'plus' adds
  // higher-end ladders for premium VOD.
  const asset = await client.video.assets.create({
    inputs: [{ url: signedUrl }],
    playback_policies: ['public'],
    video_quality: 'basic',
    // Stash our internal report_videos row id so webhook can lookup
    // without a Mux→Paradocs lookup table.
    passthrough: meta?.passthrough,
    // mp4_support 'standard' gives us a direct MP4 fallback URL Mux
    // exposes once encoding completes (used if a browser can't do HLS).
    mp4_support: 'standard',
  })

  const playback = (asset.playback_ids && asset.playback_ids[0]) || null
  if (!playback?.id) {
    throw new Error('Mux Asset.Create returned no playback_id')
  }
  return { asset_id: asset.id, playback_id: playback.id }
}

/** Get the HLS streaming URL for a playback id. Pure function. */
export function getMuxHlsUrl(playbackId: string): string {
  return 'https://stream.mux.com/' + playbackId + '.m3u8'
}

/** Get the thumbnail/poster URL for a playback id. */
export function getMuxPosterUrl(playbackId: string, options?: { time?: number; width?: number }): string {
  const time = typeof options?.time === 'number' ? options.time : 1
  const width = typeof options?.width === 'number' ? options.width : 720
  return 'https://image.mux.com/' + playbackId + '/thumbnail.jpg?time=' + time + '&width=' + width
}

/** Get a static MP4 download URL (mp4_support='standard' enables this). */
export function getMuxMp4Url(playbackId: string): string {
  return 'https://stream.mux.com/' + playbackId + '/medium.mp4'
}

/**
 * Verify a Mux webhook delivery. Mux signs each request with
 * HMAC-SHA256 over `<timestamp>.<body>`, sent in the `mux-signature`
 * header as `t=<unix>,v1=<hex>`. We recompute and compare.
 *
 * Returns true if the signature is valid AND the timestamp is within
 * a 5-minute tolerance (replay-attack protection).
 */
export function verifyMuxWebhookSignature(rawBody: string, signatureHeader: string | undefined): boolean {
  if (!MUX_WEBHOOK_SECRET) {
    console.warn('[mux] MUX_WEBHOOK_SECRET not set — refusing webhook')
    return false
  }
  if (!signatureHeader) return false

  // Parse "t=<unix>,v1=<hex>"
  let timestamp: string | null = null
  let signature: string | null = null
  const parts = signatureHeader.split(',')
  for (const p of parts) {
    const [k, v] = p.split('=')
    if (k === 't') timestamp = v
    else if (k === 'v1') signature = v
  }
  if (!timestamp || !signature) return false

  // Replay protection: 5-minute tolerance window.
  const now = Math.floor(Date.now() / 1000)
  const ts = parseInt(timestamp, 10)
  if (Number.isNaN(ts) || Math.abs(now - ts) > 300) return false

  const payload = timestamp + '.' + rawBody
  const expected = crypto
    .createHmac('sha256', MUX_WEBHOOK_SECRET)
    .update(payload)
    .digest('hex')

  // Constant-time compare.
  if (expected.length !== signature.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'))
  } catch (_e) {
    return false
  }
}
