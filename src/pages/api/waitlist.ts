/**
 * Waitlist API Endpoint
 *
 * Captures email for pro-tier waitlist notifications.
 * Reuses beta_signups table with source='constellation_paywall' or 'constellation_notify'.
 *
 * SWC: Uses var + function(){} for compatibility.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

var supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    var body = req.body || {}
    var email = (body.email || '').toLowerCase().trim()
    var source = body.source || 'constellation_notify'
    var metadata = body.metadata || {}

    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required.' })
    }

    // Upsert into beta_signups — same table, different source tag
    var { error: dbError } = await supabase
      .from('beta_signups')
      .upsert({
        email: email,
        interests: ['pro-waitlist'],
        source: source,
        signed_up_at: new Date().toISOString(),
      }, {
        onConflict: 'email',
      })

    if (dbError) {
      console.error('Waitlist DB error:', dbError)
      // Duplicate is fine
      if (!dbError.message.includes('duplicate')) {
        return res.status(500).json({ error: 'Failed to save. Please try again.' })
      }
    }

    return res.status(200).json({
      success: true,
      message: 'You are on the waitlist.',
    })
  } catch (err) {
    console.error('Waitlist error:', err)
    return res.status(500).json({
      error: 'Internal server error',
    })
  }
}
