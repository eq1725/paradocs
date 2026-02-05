/**
 * API endpoint to regenerate AI insights for all patterns
 * This forces new AI-generated titles, summaries, and narratives using the updated prompts
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import { generatePatternInsight } from '@/lib/services/ai-insights.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const supabase = createServerClient()

  try {
    // Get all patterns
    const { data: patterns, error: fetchError } = await (supabase
      .from('detected_patterns' as any) as any)
      .select('*')
      .order('significance_score', { ascending: false })

    if (fetchError) {
      throw fetchError
    }

    if (!patterns || patterns.length === 0) {
      return res.status(200).json({ message: 'No patterns found', regenerated: 0 })
    }

    const results: { id: string; title: string; status: string }[] = []
    let successCount = 0
    let errorCount = 0

    // Process patterns one at a time to avoid rate limits
    for (const pattern of patterns) {
      try {
        console.log(`Regenerating insight for pattern: ${pattern.id}`)

        // Generate new insight using the updated AI prompts
        const insight = await generatePatternInsight(pattern)

        // Update the pattern with new AI content
        const { error: updateError } = await (supabase
          .from('detected_patterns' as any) as any)
          .update({
            ai_title: insight.title,
            ai_summary: insight.summary,
            ai_narrative: insight.narrative,
            ai_narrative_generated_at: new Date().toISOString()
          })
          .eq('id', pattern.id)

        if (updateError) {
          throw updateError
        }

        // Also invalidate any cached insights
        await (supabase
          .from('pattern_insights' as any) as any)
          .update({ is_stale: true })
          .eq('pattern_id', pattern.id)

        results.push({
          id: pattern.id,
          title: insight.title,
          status: 'success'
        })
        successCount++

        // Small delay to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500))

      } catch (patternError) {
        console.error(`Error regenerating pattern ${pattern.id}:`, patternError)
        results.push({
          id: pattern.id,
          title: pattern.ai_title || 'Unknown',
          status: 'error'
        })
        errorCount++
      }
    }

    return res.status(200).json({
      success: true,
      message: `Regenerated ${successCount} pattern insights, ${errorCount} errors`,
      total: patterns.length,
      successCount,
      errorCount,
      results: results.slice(0, 10) // Return first 10 for preview
    })

  } catch (error) {
    console.error('Error in regenerate-all-insights:', error)
    return res.status(500).json({
      success: false,
      error: 'Failed to regenerate insights',
      details: error instanceof Error ? error.message : 'Unknown error'
    })
  }
}
