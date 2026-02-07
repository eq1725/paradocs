/**
 * Survey Submission API Endpoint
 *
 * Handles survey responses from the early access survey page.
 * Stores responses in Supabase survey_responses table.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

// Initialize Supabase client with service role for admin operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface SurveySubmitRequest {
  topics: string[]
  researcher_type: string
  open_response: string | null
  email: string | null
}

const VALID_TOPICS = [
  'ufos', 'ndes', 'consciousness', 'cryptids',
  'ghosts', 'psychic', 'reincarnation', 'occult'
]

const VALID_RESEARCHER_TYPES = [
  'casual', 'enthusiast', 'academic', 'creator'
]

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { topics, researcher_type, open_response, email } = req.body as SurveySubmitRequest

    // Validate topics
    if (!topics || !Array.isArray(topics) || topics.length === 0) {
      return res.status(400).json({ error: 'At least one topic is required' })
    }

    const validTopics = topics.filter(t => VALID_TOPICS.includes(t))
    if (validTopics.length === 0) {
      return res.status(400).json({ error: 'Invalid topic selection' })
    }

    // Validate researcher type
    if (!researcher_type || !VALID_RESEARCHER_TYPES.includes(researcher_type)) {
      return res.status(400).json({ error: 'Valid researcher type is required' })
    }

    // Validate email if provided
    if (email && !email.includes('@')) {
      return res.status(400).json({ error: 'Invalid email address' })
    }

    // Sanitize open response
    const sanitizedResponse = open_response
      ? open_response.slice(0, 500).trim()
      : null

    // Store in Supabase
    const { error: dbError } = await supabase
      .from('survey_responses')
      .insert({
        topics: validTopics,
        researcher_type,
        open_response: sanitizedResponse,
        email: email ? email.toLowerCase().trim() : null,
        source: 'alpha-update-email',
        submitted_at: new Date().toISOString()
      })

    if (dbError) {
      console.error('Survey database error:', dbError)
      throw new Error('Failed to save survey response')
    }

    return res.status(200).json({
      success: true,
      message: 'Survey response submitted successfully'
    })

  } catch (error) {
    console.error('Survey submission error:', error)
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Internal server error'
    })
  }
}
