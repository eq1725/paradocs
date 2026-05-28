/**
 * API: POST /api/citd/signup
 *
 * Captures email signups from the /citd landing page (Contact in the
 * Desert event, V11.17.39 — May 28, 2026).
 *
 * The app is not production-ready; QR-code visitors land on /citd
 * (gated as the only publicly-accessible route) and can join the
 * waitlist. We'll batch-invite from this list once the BETA_PROTECTION
 * gate is lifted.
 *
 * Request shape:
 *   { email: string, name?: string, referrer?: string }
 *
 * Response:
 *   200 { ok: true }     — new or existing signup recorded
 *   400 { error: ... }   — bad input
 *   500 { error: ... }   — internal
 *
 * The table is intentionally simple — id, email (unique), name,
 * referrer, ip_address, user_agent, created_at. We accept duplicate
 * emails idempotently (upsert) so spamming the form doesn't error.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const body = req.body || {}
    const email = String(body.email || '').trim().toLowerCase()
    const name = body.name ? String(body.name).trim() : null
    const referrer = body.referrer ? String(body.referrer).trim().substring(0, 200) : null

    if (!email || !EMAIL_RE.test(email) || email.length > 254) {
      return res.status(400).json({ error: 'invalid_email' })
    }
    if (name && name.length > 120) {
      return res.status(400).json({ error: 'name_too_long' })
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Pull request metadata for light deduplication / analytics.
    const xff = (req.headers['x-forwarded-for'] || '').toString()
    const ipAddress = xff ? xff.split(',')[0].trim() : (req.socket?.remoteAddress || null)
    const userAgent = (req.headers['user-agent'] || '').toString().substring(0, 500) || null

    // Upsert on email (the table should have a unique constraint on it).
    // First attempt: insert. If conflict, update name/referrer if non-null.
    const insertRow: any = {
      email,
      name,
      referrer,
      ip_address: ipAddress,
      user_agent: userAgent,
    }

    const { error: insertErr } = await (supabase.from('citd_signups') as any)
      .upsert(insertRow, { onConflict: 'email' })

    if (insertErr) {
      console.error('[api/citd/signup] insert failed:', insertErr.message)
      return res.status(500).json({ error: 'internal' })
    }

    return res.status(200).json({ ok: true })
  } catch (e: any) {
    console.error('[api/citd/signup] error:', e?.message || e)
    return res.status(500).json({ error: 'internal' })
  }
}
