import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
          return res.status(405).json({ error: 'Method not allowed' })
    }

  const { id } = req.query
    const supabase = createServerClient()

  // Check for cached insight
  const { data: cached } = await supabase
      .from('pattern_insights')
      .select('*')
      .eq('pattern_id', id)
      .eq('is_valid', true)
      .single()

  if (cached) {
        return res.status(200).json({ insight: cached, cached: true })
  }

  // Get pattern data
  const { data: pattern } = await supabase
      .from('detected_patterns')
      .select('*')
      .eq('id', id)
      .single()

  if (!pattern) {
        return res.status(404).json({ error: 'Pattern not found' })
  }

  // Generate new insight with Claude
  const prompt = `Analyze this paranormal pattern:
  Type: ${pattern.pattern_type}
  Reports: ${pattern.report_count}
  Location: ${pattern.metadata?.location || 'Various'}
  Time span: ${pattern.first_report_date} to ${pattern.last_report_date}

  Provide a brief, objective analysis of what this pattern might indicate.`

  const message = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }]
  })

  const content = message.content[0]
    const text = content.type === 'text' ? content.text : ''

  // Cache the insight
  const { data: insight } = await supabase
      .from('pattern_insights')
      .insert({
              pattern_id: id,
              title: pattern.ai_title || 'Pattern Analysis',
              content: text,
              summary: text.slice(0, 200),
              model_used: 'claude-sonnet-4-20250514'
      })
      .select()
      .single()

  return res.status(200).json({ insight, cached: false })
}
