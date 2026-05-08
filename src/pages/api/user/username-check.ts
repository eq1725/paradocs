/**
 * GET /api/user/username-check?u=<username>
 *
 * V9.9 P2 — debounced availability check. Client calls this on
 * input change so users see ✓ / ✗ feedback before clicking Save,
 * instead of hitting a generic 'Failed to save' on the Postgres
 * unique-violation.
 *
 * Auth: requires a session so we can let users 'check' their OWN
 * existing username without being told it's taken (i.e. no false
 * negative when they're editing their profile and haven't changed
 * their username).
 *
 * Response shape:
 *   { ok: true, status: 'available' | 'taken' | 'invalid' | 'self', reason?: string }
 *
 * Validation rules (must match settings.tsx input filter):
 *   - 3-30 characters
 *   - Lowercase letters, digits, underscore only
 *   - Reserved words rejected (admin, paradocs, settings, etc.)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var RESERVED = new Set([
  'admin', 'administrator', 'paradocs', 'support', 'help', 'system',
  'root', 'mod', 'moderator', 'official', 'staff', 'team',
  'profile', 'settings', 'account', 'subscription', 'login', 'logout',
  'signup', 'signin', 'register', 'auth', 'api', 'about', 'privacy',
  'terms', 'discover', 'today', 'lab', 'phenomena', 'explore',
  'researcher', 'research', 'admin-cases', 'anchor-cases',
  'avatar', 'avatars', 'media',
])

function classifyUsername(u: string): { status: 'available' | 'invalid' | 'taken' | 'self'; reason?: string } {
  if (!u || u.length < 3) return { status: 'invalid', reason: 'Must be at least 3 characters.' }
  if (u.length > 30) return { status: 'invalid', reason: 'Must be 30 characters or fewer.' }
  if (!/^[a-z0-9_]+$/.test(u)) return { status: 'invalid', reason: 'Only lowercase letters, digits, and underscore.' }
  if (RESERVED.has(u)) return { status: 'invalid', reason: 'That username is reserved.' }
  return { status: 'available' }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' })
  }

  var raw = (req.query.u as string) || ''
  var u = raw.toLowerCase().trim()

  var precheck = classifyUsername(u)
  if (precheck.status !== 'available') {
    return res.status(200).json({ ok: true, status: precheck.status, reason: precheck.reason })
  }

  // Bearer auth — accept the user's own current username as 'self'
  // rather than 'taken' so the input doesn't flash red when the user
  // hasn't changed it.
  var authHeader = req.headers.authorization || ''
  var accessToken = authHeader.indexOf('Bearer ') === 0 ? authHeader.slice(7) : ''

  var admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  var ownerId: string | null = null
  if (accessToken) {
    try {
      var { data: userData } = await admin.auth.getUser(accessToken)
      if (userData?.user) ownerId = userData.user.id
    } catch { /* unauthenticated — still useful for signup-time checks */ }
  }

  var { data, error } = await (admin
    .from('profiles') as any)
    .select('id')
    .eq('username', u)
    .maybeSingle()

  if (error) {
    console.error('[UsernameCheck] error:', error.message)
    return res.status(500).json({ ok: false, error: 'Lookup failed' })
  }

  if (!data) {
    return res.status(200).json({ ok: true, status: 'available' })
  }

  if (ownerId && (data as any).id === ownerId) {
    return res.status(200).json({ ok: true, status: 'self' })
  }

  return res.status(200).json({ ok: true, status: 'taken', reason: 'That username is already in use.' })
}
