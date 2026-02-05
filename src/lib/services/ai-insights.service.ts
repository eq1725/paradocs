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

const MODEL = 'claude-sonnet-4-5-20250929'
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
 * Updated for journalistic, engaging titles while maintaining academic rigor
 */
const SYSTEM_PROMPT = `You are an expert researcher analyzing paranormal report archives.
Your role is to find interesting patterns in the CONTENT of historical reports.

CRITICAL CONTEXT - READ THIS FIRST:
- ParaDocs is in ALPHA - we are actively bulk-importing historical data from archives
- Data sources: NUFORC (UFOs), BFRO (Bigfoot), Reddit paranormal communities, Wikipedia
- BULK IMPORTS ARE ONGOING through the end of the month
- Any "spikes" or "surges" in report VOLUME are artifacts of our data import process, NOT real activity patterns
- DO NOT speculate about why certain months/periods have more reports - it's because of how we imported the data
- DO NOT treat volume patterns as meaningful during alpha - they reflect ingestion timing, not phenomena

WHAT TO ANALYZE INSTEAD:
- The CONTENT of reports: What phenomena are witnesses describing? What details recur?
- Geographic patterns: Where are these events historically concentrated? Why might certain locations appear more?
- Phenomenon characteristics: Common descriptions, times of day events occurred, witness experiences
- Historical context: What was happening in that era that might be relevant?
- Cross-source patterns: Do NUFORC, BFRO, and Reddit reports show similar themes?

FOR TEMPORAL PATTERNS SPECIFICALLY:
- Focus on WHAT was reported during that period, not HOW MANY reports exist
- Describe the phenomena content, not the volume statistics
- If a month has many reports, discuss the interesting cases IN that month, don't analyze why there are "so many"
- Frame as "exploring historical reports from [time period]" not "investigating a spike"

TITLE GUIDELINES:
- Focus on the CONTENT/PHENOMENA, not report counts
- "What Witnesses Described in July 2024's UFO Reports" ✓
- "The Strange Lights of Summer 2024: A Pattern Emerges" ✓
- "Why July 2024 Had So Many Reports" ✗ (we know why - bulk import)
- "Investigating the July Spike" ✗ (don't treat volume as meaningful)

NARRATIVE GUIDELINES:
- Lead with interesting CONTENT from the reports
- Describe what witnesses actually experienced
- Note geographic or thematic patterns in the phenomena described
- Do NOT speculate about report volume - it's an import artifact
- End with questions about the phenomena themselves, not the data patterns

You are exploring a historical archive, not analyzing real-time trends.`

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
  const { data: cachedInsight } = await (supabase
    .from('pattern_insights' as any) as any)
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
  const { data: pattern } = await (supabase
    .from('detected_patterns' as any) as any)
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

  // Store insight - using 'any' assertion for untyped table
  const { data: newInsight, error } = await (supabase
    .from('pattern_insights' as any) as any)
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
  await (supabase
    .from('detected_patterns' as any) as any)
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
  const { data: patterns } = await (supabase
    .from('detected_patterns' as any) as any)
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

    await (supabase.from('pattern_insights' as any) as any).insert({
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

  await (supabase
    .from('pattern_insights' as any) as any)
    .update({ is_stale: true })
    .eq('pattern_id', patternId)
}

// Helper functions

function buildPatternPrompt(pattern: DetectedPattern): string {
  const typeContexts: Record<PatternType, { description: string; questions: string[] }> = {
    geographic_cluster: {
      description: 'geographic hotspot where reports are clustering',
      questions: [
        'What makes this location unusual?',
        'Is there something about the terrain, history, or demographics?',
        'What types of phenomena are most common here?'
      ]
    },
    temporal_anomaly: {
      description: 'collection of historical reports from a specific time period',
      questions: [
        'What phenomena were witnesses describing during this period?',
        'Are there common themes or characteristics in these reports?',
        'What interesting cases stand out from this time period?'
      ]
    },
    flap_wave: {
      description: 'wave of reports spreading across a region over time',
      questions: [
        'How is the wave propagating?',
        'What started it?',
        'Where might it spread next?'
      ]
    },
    characteristic_correlation: {
      description: 'interesting correlation between report characteristics',
      questions: [
        'What features are linked?',
        'Is this correlation causal or coincidental?',
        'What mechanism could explain this?'
      ]
    },
    regional_concentration: {
      description: 'unusual concentration of reports in a specific region',
      questions: [
        'Why this region specifically?',
        'What distinguishes it from neighboring areas?',
        'Is this a new development or ongoing?'
      ]
    },
    seasonal_pattern: {
      description: 'recurring seasonal pattern in report frequency',
      questions: [
        'What happens in this season that might explain the pattern?',
        'Do different phenomena show different seasonal peaks?',
        'How consistent is this across years?'
      ]
    },
    time_of_day_pattern: {
      description: 'pattern related to specific times of day',
      questions: [
        'Why this time specifically?',
        'Does it relate to human activity patterns?',
        'Are certain phenomena more time-specific than others?'
      ]
    },
    date_correlation: {
      description: 'pattern linked to specific dates or anniversaries',
      questions: [
        'What significance do these dates have?',
        'Is this cultural, astronomical, or something else?',
        'How strong is the date correlation?'
      ]
    }
  }

  const context = typeContexts[pattern.pattern_type]
  const metadata = pattern.metadata as Record<string, unknown>

  // Extract useful context from metadata
  const zScore = metadata.z_score as number | undefined
  const isSpike = metadata.is_spike as boolean | undefined
  const seasonalIndex = metadata.seasonal_index as number | undefined
  const monthName = metadata.month_name as string | undefined
  const density = metadata.density as number | undefined

  let prompt = `Analyze this ${context.description}:\n\n`

  // Important context about data source
  prompt += `## CRITICAL CONTEXT - READ FIRST\n`
  prompt += `- ParaDocs is in ALPHA - we are bulk-importing historical archives\n`
  prompt += `- The report COUNT/VOLUME is meaningless - it reflects our import schedule, NOT actual activity\n`
  prompt += `- DO NOT analyze or speculate about WHY there are many reports - we imported them in bulk\n`
  prompt += `- INSTEAD: Focus on the CONTENT - what phenomena did witnesses describe? What's interesting about THESE reports?\n`
  prompt += `- Your job: Explore what's IN the reports, not why there are "so many"\n\n`

  // Core stats
  prompt += `## Key Data\n`
  prompt += `- Report Count: ${pattern.report_count ?? 0}\n`
  prompt += `- Pattern Status: ${pattern.status} (${pattern.status === 'emerging' ? 'recently detected in data' : pattern.status === 'active' ? 'statistically significant' : 'historical reference'})\n`

  // Add date range if available
  if ((pattern as any).pattern_start_date) {
    const startDate = new Date((pattern as any).pattern_start_date)
    const endDate = (pattern as any).pattern_end_date ? new Date((pattern as any).pattern_end_date) : null
    prompt += `- Event Period: ${startDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}${endDate ? ` to ${endDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}\n`
  }

  // Pattern-specific metrics
  if (zScore !== undefined) {
    prompt += `- Z-Score: ${zScore.toFixed(2)} (${Math.abs(zScore) > 3 ? 'extremely unusual' : Math.abs(zScore) > 2.5 ? 'highly unusual' : 'notable'})\n`
    prompt += `- Direction: ${isSpike ? 'SPIKE (increase)' : 'DROP (decrease)'}\n`
  }

  if (seasonalIndex !== undefined) {
    prompt += `- Seasonal Index: ${seasonalIndex.toFixed(2)}× (${seasonalIndex > 1.5 ? 'peak season' : seasonalIndex < 0.5 ? 'low season' : 'near average'})\n`
    if (monthName) prompt += `- Peak Month: ${monthName}\n`
  }

  if (density !== undefined) {
    prompt += `- Spatial Density: ${density.toFixed(2)} reports/km²\n`
  }

  if (pattern.center_point) {
    const cp = pattern.center_point as any
    const lat = cp.lat ?? cp.coordinates?.[1]
    const lng = cp.lng ?? cp.coordinates?.[0]
    if (typeof lat === 'number' && typeof lng === 'number') {
      prompt += `- Approximate Location: ${lat.toFixed(2)}°, ${lng.toFixed(2)}°\n`
    }
  }

  if (pattern.radius_km) {
    prompt += `- Geographic Spread: ~${pattern.radius_km} km radius\n`
  }

  if (pattern.categories.length > 0) {
    prompt += `- Phenomena Types: ${pattern.categories.join(', ')}\n`
  }

  prompt += `\n## Context Questions to Consider\n`
  context.questions.forEach(q => {
    prompt += `- ${q}\n`
  })

  // Special instruction for temporal patterns
  if (pattern.pattern_type === 'temporal_anomaly') {
    prompt += `\n## IMPORTANT FOR THIS TEMPORAL PATTERN\n`
    prompt += `The high report count (${pattern.report_count}) is due to BULK DATA IMPORT, not a real "spike" or "surge".\n`
    prompt += `DO NOT write about "why this month had so many reports" or "what caused this surge".\n`
    prompt += `INSTEAD, explore: What interesting phenomena were reported during this historical period?\n`
    prompt += `Treat this as: "Let's explore the paranormal reports from [time period]" not "Let's investigate this anomaly"\n`
  }

  prompt += `\n## Your Task\n`
  prompt += `Create an engaging, journalistic analysis of this pattern.\n\n`

  prompt += `1. TITLE (max 80 chars): Write a compelling headline that would make someone want to read more. Use active voice. Ask a question if appropriate. AVOID formulaic patterns like "X Reports in Y Region" or "Pattern Detected".\n\n`

  prompt += `2. SUMMARY (max 180 chars): One punchy sentence capturing the key finding.\n\n`

  prompt += `3. NARRATIVE (2-3 paragraphs):\n`
  prompt += `   - Lead with the most INTERESTING CONTENT from these reports\n`
  prompt += `   - Describe what witnesses reported seeing/experiencing\n`
  prompt += `   - Note any thematic patterns (similar descriptions, locations, times of day)\n`
  prompt += `   - DO NOT discuss report volume/counts as meaningful - focus on the phenomena\n`
  prompt += `   - End with interesting questions about the phenomena described\n\n`

  prompt += `Format your response EXACTLY as:\n`
  prompt += `TITLE: [your headline]\n`
  prompt += `SUMMARY: [your summary]\n`
  prompt += `NARRATIVE: [your detailed analysis]`

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
  // Extract sections from the response (using [\s\S] instead of /s flag for ES5 compatibility)
  const titleMatch = response.match(/TITLE:\s*([\s\S]+?)(?:\n|SUMMARY:)/)
  const summaryMatch = response.match(/SUMMARY:\s*([\s\S]+?)(?:\n|NARRATIVE:)/)
  const narrativeMatch = response.match(/NARRATIVE:\s*([\s\S]+)/)

  const title = titleMatch?.[1]?.trim() || generateDefaultTitle(pattern)
  const summary = summaryMatch?.[1]?.trim() || generateDefaultSummary(pattern)
  const narrative = narrativeMatch?.[1]?.trim() || response

  return { title, summary, narrative }
}

function generateFallbackInsight(pattern: DetectedPattern): InsightGenerationResult {
  const significance = typeof pattern.significance_score === 'number' ? pattern.significance_score : 0
  return {
    title: generateDefaultTitle(pattern),
    summary: generateDefaultSummary(pattern),
    narrative: `This ${pattern.pattern_type.replace(/_/g, ' ')} encompasses ${pattern.report_count ?? 0} reports with a significance score of ${(significance * 100).toFixed(1)}%. Further analysis is pending.`
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
