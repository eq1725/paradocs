/**
 * Beta Signup API Endpoint
 *
 * Handles beta access signups:
 * 1. Validates input
 * 2. Stores in Supabase beta_signups table
 * 3. Optionally forwards to Mailchimp (when configured)
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Mailchimp configuration (optional)
const MAILCHIMP_API_KEY = process.env.MAILCHIMP_API_KEY
const MAILCHIMP_LIST_ID = process.env.MAILCHIMP_LIST_ID
const MAILCHIMP_SERVER = process.env.MAILCHIMP_SERVER // e.g., 'us21'

interface BetaSignupRequest {
  email: string
  interests: string[]
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { email, interests } = req.body as BetaSignupRequest

    // Validate input
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email is required' })
    }

    if (!interests || !Array.isArray(interests) || interests.length === 0) {
      return res.status(400).json({ error: 'At least one interest is required' })
    }

    // Store in Supabase
    const { error: dbError } = await supabase
      .from('beta_signups')
      .upsert({
        email: email.toLowerCase().trim(),
        interests,
        source: 'beta-access-page',
        signed_up_at: new Date().toISOString()
      }, {
        onConflict: 'email'
      })

    if (dbError) {
      console.error('Database error:', dbError)
      // Don't fail if just a duplicate - that's OK
      if (!dbError.message.includes('duplicate')) {
        throw new Error('Failed to save signup')
      }
    }

    // Forward to Mailchimp if configured
    if (MAILCHIMP_API_KEY && MAILCHIMP_LIST_ID && MAILCHIMP_SERVER) {
      try {
        const mailchimpResponse = await fetch(
          `https://${MAILCHIMP_SERVER}.api.mailchimp.com/3.0/lists/${MAILCHIMP_LIST_ID}/members`,
          {
            method: 'POST',
            headers: {
              'Authorization': `apikey ${MAILCHIMP_API_KEY}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              email_address: email.toLowerCase().trim(),
              status: 'subscribed',
              merge_fields: {
                INTERESTS: interests.join(', ')
              },
              tags: ['beta-access', ...interests]
            })
          }
        )

        if (!mailchimpResponse.ok) {
          const mcError = await mailchimpResponse.json()
          // Log but don't fail - we still have the Supabase record
          console.error('Mailchimp error:', mcError)
        }
      } catch (mcErr) {
        console.error('Mailchimp integration error:', mcErr)
        // Don't fail the request - we still saved to Supabase
      }
    }

    return res.status(200).json({
      success: true,
      message: 'Successfully signed up for beta access'
    })

  } catch (error) {
    console.error('Beta signup error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}
