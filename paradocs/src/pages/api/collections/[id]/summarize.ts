/**
 * Collection Summarizer API
 * POST /api/collections/[id]/summarize - Generate AI summary of a collection
 */

import { NextApiRequest, NextApiResponse } from 'next'
import { createServerClient } from '@/lib/supabase'
import OpenAI from 'openai'

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

interface CollectionSummary {
  overview: string
  key_findings: {
    total_reports: number
    date_range: { earliest: string; latest: string }
    primary_category: string
    geographic_focus: string
    common_patterns: string[]
    notable_reports: Array<{ id: string; title: string; reason: string }>
  }
  patterns_analysis: string
  recommendations: string[]
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: `Method ${req.method} not allowed` })
  }

  const { id } = req.query
  const { summary_type = 'overview' } = req.body

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Collection ID is required' })
  }

  const supabase = createServerClient()

  // Verify authentication
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    // Get the collection and verify ownership
    const { data: collection, error: collectionError } = await supabase
      .from('collections')
      .select('*, collection_reports(report_id)')
      .eq('id', id)
      .single()

    if (collectionError || !collection) {
      return res.status(404).json({ error: 'Collection not found' })
    }

    if (collection.user_id !== user.id && !collection.is_public) {
      return res.status(403).json({ error: 'Access denied' })
    }

    // Check for cached summary (valid for 24 hours)
    const { data: cachedSummary } = await supabase
      .from('collection_summaries')
      .select('*')
      .eq('collection_id', id)
      .eq('summary_type', summary_type)
      .gt('expires_at', new Date().toISOString())
      .single()

    if (cachedSummary) {
      return res.status(200).json({
        summary: cachedSummary.summary_text,
        key_findings: cachedSummary.key_findings,
        cached: true,
        generated_at: cachedSummary.generated_at,
      })
    }

    // Get all reports in the collection
    const reportIds = collection.collection_reports?.map((cr: any) => cr.report_id) || []

    if (reportIds.length === 0) {
      return res.status(400).json({ error: 'Collection has no reports to summarize' })
    }

    const { data: reports, error: reportsError } = await supabase
      .from('reports')
      .select('*')
      .in('id', reportIds)

    if (reportsError || !reports || reports.length === 0) {
      return res.status(400).json({ error: 'Could not fetch collection reports' })
    }

    // Prepare report data for AI analysis
    const reportSummaries = reports.map(r => ({
      id: r.id,
      title: r.title,
      category: r.category,
      location: `${r.location}, ${r.country}`,
      date: r.date_of_encounter,
      description: r.description?.slice(0, 500), // Truncate for token limits
      credibility: r.credibility,
      has_media: r.has_photo_video,
    }))

    // Calculate basic statistics
    const categories = reports.map(r => r.category)
    const categoryCount: Record<string, number> = {}
    categories.forEach(c => { categoryCount[c] = (categoryCount[c] || 0) + 1 })
    const primaryCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0]?.[0]

    const countries = reports.map(r => r.country).filter(Boolean)
    const countryCount: Record<string, number> = {}
    countries.forEach(c => { countryCount[c] = (countryCount[c] || 0) + 1 })
    const primaryCountry = Object.entries(countryCount).sort((a, b) => b[1] - a[1])[0]?.[0]

    const dates = reports.map(r => r.date_of_encounter).filter(Boolean).sort()

    // Generate AI summary
    const systemPrompt = `You are an expert paranormal researcher analyzing a collection of reports.
Provide insightful analysis that would help a serious researcher understand patterns and significance.
Be objective and analytical. Note any interesting correlations or patterns.
Focus on factual observations from the data provided.`

    const userPrompt = `Analyze this collection of ${reports.length} paranormal reports titled "${collection.name}".

Collection Description: ${collection.description || 'No description provided'}

Report Data:
${JSON.stringify(reportSummaries, null, 2)}

Statistics:
- Total Reports: ${reports.length}
- Categories: ${JSON.stringify(categoryCount)}
- Countries: ${JSON.stringify(countryCount)}
- Date Range: ${dates[0] || 'Unknown'} to ${dates[dates.length - 1] || 'Unknown'}
- Reports with Media: ${reports.filter(r => r.has_photo_video).length}

Provide a comprehensive analysis including:
1. A 2-3 paragraph overview of the collection
2. Key patterns or correlations you observe
3. Notable or significant reports and why they stand out
4. Recommendations for further research

Format your response as JSON with these fields:
- overview: string (2-3 paragraphs)
- patterns_analysis: string (analysis of patterns)
- common_patterns: array of strings (bullet points)
- notable_reports: array of {id, title, reason}
- recommendations: array of strings`

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' }
    })

    const aiResponse = JSON.parse(completion.choices[0].message.content || '{}')

    // Compile the full summary
    const summary: CollectionSummary = {
      overview: aiResponse.overview || 'Summary generation failed',
      key_findings: {
        total_reports: reports.length,
        date_range: {
          earliest: dates[0] || 'Unknown',
          latest: dates[dates.length - 1] || 'Unknown',
        },
        primary_category: primaryCategory || 'Mixed',
        geographic_focus: primaryCountry || 'Various',
        common_patterns: aiResponse.common_patterns || [],
        notable_reports: aiResponse.notable_reports || [],
      },
      patterns_analysis: aiResponse.patterns_analysis || '',
      recommendations: aiResponse.recommendations || [],
    }

    // Cache the summary
    const expiresAt = new Date()
    expiresAt.setHours(expiresAt.getHours() + 24) // 24 hour cache

    await supabase.from('collection_summaries').upsert({
      collection_id: id,
      summary_type: summary_type,
      summary_text: summary.overview,
      key_findings: summary.key_findings,
      report_count: reports.length,
      tokens_used: completion.usage?.total_tokens || 0,
      model_used: 'gpt-4o-mini',
      generated_at: new Date().toISOString(),
      expires_at: expiresAt.toISOString(),
    })

    // Track AI usage
    await supabase.from('ai_query_history').insert({
      user_id: user.id,
      query_type: 'collection_summary',
      query_input: { collection_id: id, report_count: reports.length },
      query_output: { summary_length: summary.overview.length },
      tokens_used: completion.usage?.total_tokens || 0,
    })

    return res.status(200).json({
      summary: summary.overview,
      key_findings: summary.key_findings,
      patterns_analysis: summary.patterns_analysis,
      recommendations: summary.recommendations,
      cached: false,
      generated_at: new Date().toISOString(),
    })

  } catch (error) {
    console.error('Collection summarization error:', error)
    return res.status(500).json({ error: 'Failed to generate summary' })
  }
}
