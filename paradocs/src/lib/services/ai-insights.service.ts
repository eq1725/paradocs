/**
 * AI Insights Service
 *
 * Generates narrative insights for detected patterns using Claude API.
 * Caches insights and manages validity periods.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '../supabase'
import { DetectedPattern, PatternType } from './pattern-analysis.service'
import crypto from 'crypto'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const MODEL = 'claude-3-5-sonnet-20241022'
const MAX_TOKENS = 1024
const CACHE_VALIDITY_HOURS = 24

interface PatternInsight {
  id: string
  pattern_id: string | null
  insight_type: string
  title: string
  content: string
  summary: string
  model_used: string
  generated_at: string
  valid_until: string
}

interface InsightGenerationResult {
  title: string
  summary: string
  narrative: string
}

/**
 * System prompt for pattern analysis
 */
const SYSTEM_PROMPT = `You are an expert analyst specializing in anomalous phenomena research.
Your role is to analyze patterns in paranormal report data and provide objective, research-focused insights.

Guidelines:
- Be analytical and objective, avoiding sensationalism
- Present findings as observations, not conclusions
- Acknowledge uncertainty and alternative explanations
- Use precise language and cite specific data points
- Consider mundane explanations alongside anomalous ones
- Maintain scientific rigor while remaining accessible

Your analysis should help researchers and enthusiasts understand trends in reported phenomena.`

/**
 * Generate insight for a specific pattern
 */
export async function generatePatternInsight(
  pattern: DetectedPattern
): Promise<InsightGenerationResult> {
  const prompt = buildPatternPrompt(pattern)

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    // Extract text response
    const textBlock = message.content.find(block => block.type === 'text')
    const responseText = textBlock?.type === 'text' ? textBlock.text : ''

    // Parse the structured response
    return parseInsightResponse(responseText, pattern)
  } catch (error) {
    console.error('Error generating pattern insight:', error)
    // Return a fallback insight
    return generateFallbackInsight(pattern)
  }
}

/**
 * Get or generate insight for a pattern (with caching)
 */
export async function getPatternInsight(patternId: string): Promise<PatternInsight | null> {
  const supabase = createServerClient()

  // Check for cached, valid insight
  const { data: cachedInsight } = await supabase
    .from('pattern_insights')
    .select('*')
    .eq('pattern_id', patternId)
    .eq('insight_type', 'pattern_narrative')
    .eq('is_stale', false)
    .gt('valid_until', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (cachedInsight) {
    return cachedInsight
  }

  // Fetch pattern data
  const { data: pattern } = await supabase
    .from('detected_patterns')
    .select('*')
    .eq('id', patternId)
    .single()

  if (!pattern) {
    return null
  }

  // Generate new insight
  const insight = await generatePatternInsight(pattern as unknown as DetectedPattern)

  // Calculate validity period
  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + CACHE_VALIDITY_HOURS)

  // Store insight
  const { data: newInsight, error } = await supabase
    .from('pattern_insights')
    .insert({
      pattern_id: patternId,
      insight_type: 'pattern_narrative',
      title: insight.title,
      content: insight.narrative,
      summary: insight.summary,
      model_used: MODEL,
      valid_until: validUntil.toISOString(),
      source_data_hash: computePatternHash(pattern)
    })
    .select()
    .single()

  if (error) {
    console.error('Error storing insight:', error)
    return null
  }

  // Update pattern with AI content
  await supabase
    .from('detected_patterns')
    .update({
      ai_title: insight.title,
      ai_summary: insight.summary,
      ai_narrative: insight.narrative,
      ai_narrative_generated_at: new Date().toISOString()
    })
    .eq('id', patternId)

  return newInsight
}

/**
 * Generate weekly digest of all active patterns
 */
export async function generateWeeklyDigest(): Promise<string> {
  const supabase = createServerClient()

  // Fetch active patterns
  const { data: patterns } = await supabase
    .from('detected_patterns')
    .select('*')
    .in('status', ['active', 'emerging'])
    .order('significance_score', { ascending: false })
    .limit(10)

  if (!patterns || patterns.length === 0) {
    return 'No significant patterns detected this week.'
  }

  const prompt = buildDigestPrompt(patterns as unknown as DetectedPattern[])

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    })

    const textBlock = message.content.find(block => block.type === 'text')
    const digest = textBlock?.type === 'text' ? textBlock.text : ''

    // Store the digest
    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 7)

    await supabase.from('pattern_insights').insert({
      insight_type: 'weekly_digest',
      title: `Weekly Pattern Digest - ${new Date().toLocaleDateString()}`,
      content: digest,
      summary: digest.substring(0, 500),
      model_used: MODEL,
      valid_until: validUntil.toISOString()
    })

    return digest
  } catch (error) {
    console.error('Error generating weekly digest:', error)
    return 'Unable to generate weekly digest at this time.'
  }
}

/**
 * Invalidate stale insights when pattern data changes significantly
 */
export async function invalidateStaleInsights(patternId: string): Promise<void> {
  const supabase = createServerClient()

  await supabase
    .from('pattern_insights')
    .update({ is_stale: true })
    .eq('pattern_id', patternId)
}

// Helper functions

function buildPatternPrompt(pattern: DetectedPattern): string {
  const typeDescriptions: Record<PatternType, string> = {
    geographic_cluster: 'geographic cluster of reports',
    temporal_anomaly: 'temporal spike in report activity',
    flap_wave: 'wave of reports spreading across a region',
    characteristic_correlation: 'correlation between report characteristics',
    regional_concentration: 'unusual concentration of reports in a region',
    seasonal_pattern: 'seasonal pattern in report frequency',
    time_of_day_pattern: 'pattern related to time of day',
    date_correlation: 'pattern related to specific dates'
  }

  const metadata = pattern.metadata as Record<string, unknown>

  let prompt = `Analyze this ${typeDescriptions[pattern.pattern_type]}:\n\n`
  prompt += `Pattern Type: ${pattern.pattern_type}\n`
  prompt += `Status: ${pattern.status}\n`
  prompt += `Report Count: ${pattern.report_count}\n`
  prompt += `Confidence Score: ${(pattern.confidence_score * 100).toFixed(1)}%\n`
  prompt += `Significance Score: ${(pattern.significance_score * 100).toFixed(1)}%\n` 

  // center_point may be a PostGIS hex string or an object
  if (pattern.center_point && typeof pattern.center_point === 'object' && 'lat' in pattern.center_point) {
    const cp = pattern.center_point as { lat: number; lng: number }
    prompt += `Location: ${cp.lat.toFixed(4)}, ${cp.lng.toFixed(4)}\n`
  }

  if (pattern.radius_km) {
    prompt += `Radius: ${pattern.radius_km} km\n`
  }

  if (pattern.categories.length > 0) {
    prompt += `Categories: ${pattern.categories.join(', ')}\n`
  }

  prompt += `\nMetadata:\n${JSON.stringify(metadata, null, 2)}\n\n`

  prompt += `Please provide:
1. A concise, engaging title (max 100 characters)
2. A brief summary (max 200 characters)
3. A detailed narrative analysis (2-3 paragraphs) covering:
   - What this pattern indicates
   - Potential explanations (both mundane and anomalous)
   - Historical context if relevant
   - Recommendations for researchers

Format your response as:
TITLE: [your title]
SUMMARY: [your summary]
NARRATIVE: [your detailed analysis]`

  return prompt
}

function buildDigestPrompt(patterns: DetectedPattern[]): string {
  let prompt = `Generate a weekly digest summarizing these ${patterns.length} active patterns:\n\n`

  patterns.forEach((pattern, index) => {
    prompt += `Pattern ${index + 1}:\n`
    prompt += `- Type: ${pattern.pattern_type}\n`
    prompt += `- Reports: ${pattern.report_count}\n`
    prompt += `- Significance: ${(pattern.significance_score * 100).toFixed(1)}%\n`
    if (pattern.ai_title) {
      prompt += `- Title: ${pattern.ai_title}\n`
    }
    prompt += '\n'
  })

  prompt += `Please write a cohesive weekly digest (3-4 paragraphs) that:
1. Opens with the most significant findings
2. Identifies overarching themes or connections
3. Notes any emerging trends
4. Concludes with what researchers should watch for

Write in an engaging but analytical tone suitable for paranormal research enthusiasts.`

  return prompt
}

function parseInsightResponse(response: string, pattern: DetectedPattern): InsightGenerationResult {
  // Extract sections from the response
  const titleMatch = response.match(/TITLE:\s*(.+?)(?:\n|SUMMARY:)/s)
  const summaryMatch = response.match(/SUMMARY:\s*(.+?)(?:\n|NARRATIVE:)/s)
  const narrativeMatch = response.match(/NARRATIVE:\s*(.+)/s)

  const title = titleMatch?.[1]?.trim() || generateDefaultTitle(pattern)
  const summary = summaryMatch?.[1]?.trim() || generateDefaultSummary(pattern)
  const narrative = narrativeMatch?.[1]?.trim() || response

  return { title, summary, narrative }
}

function generateFallbackInsight(pattern: DetectedPattern): InsightGenerationResult {
  return {
    title: generateDefaultTitle(pattern),
    summary: generateDefaultSummary(pattern),
    narrative: `This ${pattern.pattern_type.replace(/_/g, ' ')} encompasses ${pattern.report_count} reports with a significance score of ${(pattern.significance_score * 100).toFixed(1)}%. Further analysis is pending.`
  }
}

function generateDefaultTitle(pattern: DetectedPattern): string {
  const typeNames: Record<PatternType, string> = {
    geographic_cluster: 'Geographic Cluster',
    temporal_anomaly: 'Temporal Anomaly',
    flap_wave: 'Wave Event',
    characteristic_correlation: 'Characteristic Correlation',
    regional_concentration: 'Regional Hotspot',
    seasonal_pattern: 'Seasonal Pattern',
    time_of_day_pattern: 'Time Pattern',
    date_correlation: 'Date Correlation'
  }

  return `${typeNames[pattern.pattern_type]} - ${pattern.report_count} Reports`
}

function generateDefaultSummary(pattern: DetectedPattern): string {
  return `A ${pattern.status} ${pattern.pattern_type.replace(/_/g, ' ')} with ${pattern.report_count} associated reports.`
}

function computePatternHash(pattern: Record<string, unknown>): string {
  const relevantData = {
    report_count: pattern.report_count,
    confidence_score: pattern.confidence_score,
    significance_score: pattern.significance_score,
    metadata: pattern.metadata
  }
  return crypto.createHash('sha256').update(JSON.stringify(relevantData)).digest('hex')
}
