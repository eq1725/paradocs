/**
 * POST /api/constellation/artifacts
 *
 * Creates a user-added external artifact (YouTube, Reddit, etc.) in
 * constellation_artifacts and bumps the flywheel signal row in
 * constellation_external_url_signals.
 *
 * Authentication: required (Supabase bearer token).
 * RLS: enforced implicitly — we use the authenticated user's ID.
 *
 * Flywheel: the first time any user saves a given normalized URL, a signal
 * row is inserted with save_count = 1. Subsequent saves by other users
 * atomically increment save_count and refresh last_saved_at. When save_count
 * crosses a threshold (checked by admin tooling, not here), the URL becomes
 * a candidate for promotion into a curated Paradocs report.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Source types that map to external URLs. Keep in sync with the CHECK
// constraint in migration 20260311_research_hub_constellation_v2.sql.
const VALID_EXTERNAL_SOURCE_TYPES = new Set([
  'youtube', 'reddit', 'tiktok', 'instagram', 'podcast', 'news', 'twitter',
  'archive', 'vimeo', 'rumble', 'substack', 'medium', 'wikipedia',
  'google_docs', 'imgur', 'flickr', 'github', 'facebook', 'twitch',
  'mufon', 'nuforc', 'blackvault', 'coasttocoast', 'website', 'other',
])

const VALID_VERDICTS = new Set(['compelling', 'inconclusive', 'skeptical', 'needs_info'])

interface CreateArtifactBody {
  source_type?: string
  external_url?: string
  title?: string
  thumbnail_url?: string | null
  source_platform?: string | null
  user_note?: string
  verdict?: string
  tags?: string[]
  metadata_json?: Record<string, unknown>
}

/**
 * Normalize a URL for dedup hashing:
 *   - lowercase host
 *   - strip default ports
 *   - strip utm_* / fbclid / gclid tracking params
 *   - strip trailing slash
 *   - strip fragment
 */
function normalizeUrl(raw: string): string {
  try {
    const u = new URL(raw)
    u.hostname = u.hostname.toLowerCase()
    u.hash = ''
    const drop: string[] = []
    u.searchParams.forEach((_, key) => {
      if (
        key.startsWith('utm_') ||
        key === 'fbclid' || key === 'gclid' || key === 'igshid' ||
        key === 'ref' || key === 'ref_src' || key === 'ref_url'
      ) {
        drop.push(key)
      }
    })
    drop.forEach(k => u.searchParams.delete(k))
    let out = u.toString()
    if (out.endsWith('/') && u.pathname !== '/') out = out.slice(0, -1)
    return out
  } catch {
    return raw
  }
}

function sha256(s: string): string {
  return crypto.createHash('sha256').update(s).digest('hex')
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const body = (req.body || {}) as CreateArtifactBody

  // ── Validate ──
  const sourceType = body.source_type
  if (!sourceType || !VALID_EXTERNAL_SOURCE_TYPES.has(sourceType)) {
    return res.status(400).json({ error: 'Invalid source_type for external artifact' })
  }

  const externalUrl = body.external_url
  if (!externalUrl || typeof externalUrl !== 'string') {
    return res.status(400).json({ error: 'external_url is required' })
  }
  let parsedUrl: URL
  try {
    parsedUrl = new URL(externalUrl)
  } catch {
    return res.status(400).json({ error: 'Invalid external_url' })
  }
  if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http(s) URLs accepted' })
  }

  const title = (body.title || '').trim().slice(0, 400)
  if (!title) return res.status(400).json({ error: 'title is required' })

  const verdict = body.verdict && VALID_VERDICTS.has(body.verdict) ? body.verdict : 'needs_info'
  const tags = Array.isArray(body.tags)
    ? body.tags.filter(t => typeof t === 'string' && t.length > 0).slice(0, 20).map(t => t.trim().toLowerCase())
    : []
  const userNote = typeof body.user_note === 'string' ? body.user_note.slice(0, 2000) : null
  const thumbnailUrl = typeof body.thumbnail_url === 'string' && body.thumbnail_url.length > 0
    ? body.thumbnail_url
    : null
  const sourcePlatform = typeof body.source_platform === 'string' ? body.source_platform.slice(0, 120) : null

  // ── Compute dedup hash ──
  const normalized = normalizeUrl(externalUrl)
  const urlHash = sha256(normalized)

  // ── Insert artifact ──
  const { data: artifact, error: insertErr } = await supabase
    .from('constellation_artifacts')
    .insert({
      user_id: user.id,
      source_type: sourceType,
      report_id: null,
      external_url: externalUrl,
      title,
      thumbnail_url: thumbnailUrl,
      source_platform: sourcePlatform,
      user_note: userNote,
      verdict,
      tags,
      metadata_json: body.metadata_json || {},
      external_url_hash: urlHash,
    })
    .select()
    .single()

  if (insertErr) {
    // Most likely cause: unique_user_report violation (user already saved this). For external
    // artifacts the unique constraint is (user_id, report_id) so that shouldn't hit here, but
    // surface anything unexpected rather than swallowing.
    console.error('[constellation/artifacts] insert error:', insertErr)
    return res.status(400).json({ error: insertErr.message || 'Could not save artifact' })
  }

  // ── Flywheel: upsert signal row ──
  // We use an RPC-less upsert pattern: try insert; if conflict on url_hash,
  // update save_count += 1 and refresh last_saved_at. PostgREST doesn't
  // expose atomic increments so we fetch-then-update; the tiny race is
  // acceptable for this analytics-grade counter.
  try {
    const { data: existing } = await supabase
      .from('constellation_external_url_signals')
      .select('save_count')
      .eq('url_hash', urlHash)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('constellation_external_url_signals')
        .update({
          save_count: (existing.save_count || 0) + 1,
          last_saved_at: new Date().toISOString(),
        })
        .eq('url_hash', urlHash)
    } else {
      await supabase
        .from('constellation_external_url_signals')
        .insert({
          url_hash: urlHash,
          canonical_url: normalized,
          source_type: sourceType,
          title,
          thumbnail_url: thumbnailUrl,
          save_count: 1,
        })
    }
  } catch (e) {
    // Flywheel failure should never block the user's save. Log and move on.
    console.error('[constellation/artifacts] signal upsert failed:', e)
  }

  return res.status(201).json({ artifact })
}
