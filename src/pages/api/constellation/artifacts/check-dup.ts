/**
 * POST /api/constellation/artifacts/check-dup
 *
 * Given a URL, returns whether the authenticated user has already saved it.
 * Called from the PasteUrlButton as the user types / after extract, so we
 * can warn them and offer a jump-to-existing action before they re-save.
 *
 * Normalization mirrors the save endpoint: strip tracking params, lowercase
 * host, SHA256 the result. If a row exists with the same hash + user, we
 * return the existing artifact's id and title.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Same normalization the save endpoint uses — keep these in sync so the
// hashes match across create and check.
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
      ) drop.push(key)
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return res.status(401).json({ error: 'Unauthorized' })

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
  if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

  const { url } = (req.body || {}) as { url?: string }
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'url is required' })
  }

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return res.status(400).json({ error: 'Invalid URL' })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(200).json({ exists: false })
  }

  const hash = sha256(normalizeUrl(url))
  const { data } = await supabase
    .from('constellation_artifacts')
    .select('id, title, created_at')
    .eq('user_id', user.id)
    .eq('external_url_hash', hash)
    .maybeSingle()

  if (data) {
    return res.status(200).json({
      exists: true,
      artifact: {
        id: data.id,
        title: data.title,
        createdAt: data.created_at,
      },
    })
  }

  return res.status(200).json({ exists: false })
}
