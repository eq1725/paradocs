/**
 * API: POST /api/admin/invalidate-insights
 *
 * Marks all pattern insights as stale so they regenerate with updated AI prompts.
 * Admin only.
 */

import type { NextApiRequest, NextApiResponse } from 'next'
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
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
    // Mark all pattern insights as stale
    const { data, error } = await supabaseAdmin
      .from('pattern_insights')
      .update({ is_stale: true })
      .eq('insight_type', 'pattern_narrative')
      .select('id')

    if (error) {
      console.error('Error invalidating insights:', error)
      return res.status(500).json({ error: error.message })
    }

    // Also clear ai_narrative from detected_patterns so they regenerate
    const { error: patternError } = await supabaseAdmin
      .from('detected_patterns')
      .update({
        ai_narrative: null,
        ai_narrative_generated_at: null
      })
      .not('ai_narrative', 'is', null)

    if (patternError) {
      console.error('Error clearing pattern narratives:', patternError)
    }

    return res.status(200).json({
      success: true,
      insights_invalidated: data?.length || 0,
      message: 'All insights marked as stale. They will regenerate on next view.'
    })
  } catch (error) {
    console.error('Invalidate insights error:', error)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
