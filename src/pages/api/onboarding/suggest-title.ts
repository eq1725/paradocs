/**
 * POST /api/onboarding/suggest-title
 *
 * Panel-feedback (May 2026). Thin wrapper around the shared
 * onboarding-title service. The /start client calls this once the
 * user has typed ≥120 chars of body without filling in a title; the
 * UI shows the suggestion with a one-click "Use this" button.
 *
 * Auth: none (the user may not have an account yet at this point
 *       in the funnel — T1.8 flipped onboarding so the experience
 *       is collected before the magic-link email).
 *
 * Anti-abuse: the shared util enforces a 50-char floor; this
 *             endpoint adds a stricter 120-char floor matching the
 *             client UX threshold and silently truncates beyond
 *             2500 chars.
 *
 * SWC: var + function() form.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { suggestOnboardingTitle } from '@/lib/services/onboarding-title.service'

var MIN_DESCRIPTION_CHARS = 120

interface TitleRequest {
  description?: string
  category?: string | null
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  var body = (req.body || {}) as TitleRequest
  var description = (body.description || '').toString().trim()
  var category = (body.category || '').toString().trim() || null

  if (description.length < MIN_DESCRIPTION_CHARS) {
    return res.status(400).json({ error: 'Description too short to suggest a title yet.' })
  }

  var result = await suggestOnboardingTitle(description, category)
  if (!result.title) {
    return res.status(500).json({ error: 'Couldn\'t draft a title — try writing your own.' })
  }
  return res.status(200).json({ title: result.title })
}
