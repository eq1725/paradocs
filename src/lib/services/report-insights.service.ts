/**
 * Report Insights Service
 *
 * Generates AI-powered insights for individual reports using Claude API.
 * Provides contextual analysis, credibility assessment, and identifies similar cases.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '../supabase'
import { Report } from '../database.types'
import crypto from 'crypto'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const MODEL = 'claude-sonnet-4-5-20250929'
const MAX_TOKENS = 1500
const CACHE_VALIDITY_HOURS = 24

// Types
export interface ReportInsight {
  id: string
  report_id: string
  insight_type: string
  title: string
  summary: string
  content: string
  credibility_analysis: CredibilityAnalysis | null
  similar_cases: SimilarCase[] | null
  mundane_explanations: MundaneExplanation[] | null
  content_type_assessment: ContentTypeAssessment | null
  model_used: string
  generated_at: string
  valid_until: string
}

export interface CredibilityAnalysis {
  score: number  // 0-100
  reasoning: string
  factors: CredibilityFactor[]
}

export interface CredibilityFactor {
  name: string
  impact: 'positive' | 'negative' | 'neutral'
  description: string
}

export interface SimilarCase {
  title: string
  similarity_reason: string
  year?: number
  location?: string
}

export interface MundaneExplanation {
  explanation: string
  likelihood: 'high' | 'medium' | 'low'
  reasoning: string
}

// Content type detection for flagging non-experiencer content
export interface ContentTypeAssessment {
  suggested_type: 'experiencer_report' | 'historical_case' | 'news_discussion' | 'research_analysis'
  confidence: 'high' | 'medium' | 'low'
  reasoning: string
  is_first_hand_account: boolean
  contains_first_hand_accounts?: boolean
}

interface InsightGenerationResult {
  title: string
  summary: string
  narrative: string
  credibility_analysis: CredibilityAnalysis
  similar_cases: SimilarCase[]
  mundane_explanations: MundaneExplanation[]
  content_type_assessment: ContentTypeAssessment
}

/**
 * System prompt for report analysis
 */
const SYSTEM_PROMPT = `You are an expert analyst specializing in paranormal phenomena research and investigation.
Your role is to analyze individual eyewitness reports and provide objective, research-focused insights.

Guidelines:
- Be analytical and objective, avoiding sensationalism
- Consider the report details carefully and note specific observations
- Always consider mundane explanations (aircraft, satellites, drones, weather phenomena, etc.)
- Assess credibility factors objectively without being dismissive
- Reference similar historical cases when relevant
- Help researchers understand what makes this report interesting or notable
- Maintain scientific rigor while remaining accessible and respectful to witnesses

SOURCE-AWARE ANALYSIS:
Many reports come from Reddit and other community platforms. When analyzing these:
- The FULL ACCOUNT/DESCRIPTION is the primary source of truth — weight it far more heavily than the title
- Reddit titles are often vague, clickbait, or tangential (e.g., a title about "video quality" on a post that describes a genuine cryptid encounter)
- Informal writing style, casual language, and unpolished grammar reflect authentic first-person testimony, NOT low credibility
- Posts tagged "comment-experience" are brief testimonies extracted from Reddit comment threads — they are raw but often genuine
- Technical mentions (video editing, camera settings, etc.) usually mean the witness is describing their evidence capture process, not that the report is about technology
- Do NOT let the title mislead your analysis — always read the full account before forming conclusions

CREDIBILITY FACTORS FOR COMMUNITY-SOURCED REPORTS:
- Vivid, specific descriptive details → Positive (authentic eyewitness recall)
- Multiple witnesses mentioned → Positive (corroboration)
- Specific locations and times → Positive (verifiable details)
- Informal language or casual tone → Neutral (platform-appropriate, not an indicator of credibility)
- Raw, unpolished narrative → Neutral to Positive (authentic voice, less likely fabricated)
- Very short accounts → Neutral (may be brief but genuine; assess content quality over length)

CRITICAL: Distinguish between actual EXPERIENCER REPORTS (first-hand witness accounts) and other content types:
- experiencer_report: First-hand witness account describing what they personally saw/experienced
- historical_case: A documented historical case being discussed — may be a compilation that synthesizes multiple first-hand witness accounts, sworn testimony, or official documents. These are valuable archival records even though the submitter is not the original witness.
- news_discussion: News articles, discussions about paranormal topics, commentary, or meta-discussions
- research_analysis: Academic research or investigative analysis

Flag content that is NOT a first-hand experiencer report - this is important for database quality.

IMPORTANT NUANCE for historical_case: If the report contains or references specific first-hand witness testimony (named witnesses, direct quotes, sworn affidavits, military personnel accounts, etc.), set "Contains First-Hand Accounts: yes" in your assessment. Historical compilations that preserve first-hand testimony are highly valuable even though the report itself is not a single first-hand account. Only flag "Not a First-Hand Account" warnings for news_discussion and research_analysis content — NOT for historical_case content that contains documented witness testimony.

Your analysis should help both researchers and the general public understand the context and significance of reports.`

/**
 * Generate insight for a specific report
 */
export async function generateReportInsight(
  report: Report & { phenomenon_type?: { name: string } | null }
): Promise<InsightGenerationResult> {
  const prompt = buildReportPrompt(report)

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
    return parseInsightResponse(responseText, report)
  } catch (error) {
    console.error('Error generating report insight:', error)
    // Return a fallback insight
    return generateFallbackInsight(report)
  }
}

/**
 * Get or generate insight for a report (with caching)
 */
export async function getReportInsight(reportId: string): Promise<ReportInsight | null> {
  const supabase = createServerClient()

  // Check for cached, valid insight
  const { data: cachedInsight } = await (supabase
    .from('report_insights' as any) as any)
    .select('*')
    .eq('report_id', reportId)
    .eq('insight_type', 'analysis')
    .eq('is_stale', false)
    .gt('valid_until', new Date().toISOString())
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (cachedInsight) {
    return cachedInsight as ReportInsight
  }

  // Fetch the report
  const { data: report, error: reportError } = await supabase
    .from('reports')
    .select(`
      *,
      phenomenon_type:phenomenon_types(name)
    `)
    .eq('id', reportId)
    .single()

  if (reportError || !report) {
    console.error('Error fetching report for insight:', reportError)
    return null
  }

  // Generate new insight
  const result = await generateReportInsight(report)

  // Calculate validity period
  const validUntil = new Date()
  validUntil.setHours(validUntil.getHours() + CACHE_VALIDITY_HOURS)

  // Store the insight
  const { data: newInsight, error: insertError } = await (supabase
    .from('report_insights' as any) as any)
    .upsert({
      report_id: reportId,
      insight_type: 'analysis',
      title: result.title,
      summary: result.summary,
      content: result.narrative,
      credibility_analysis: result.credibility_analysis,
      similar_cases: result.similar_cases,
      mundane_explanations: result.mundane_explanations,
      content_type_assessment: result.content_type_assessment,
      model_used: MODEL,
      generated_at: new Date().toISOString(),
      valid_until: validUntil.toISOString(),
      is_stale: false,
      source_data_hash: computeReportHash(report)
    }, {
      onConflict: 'report_id,insight_type'
    })
    .select()
    .single()

  if (insertError) {
    console.error('Error storing report insight:', insertError)
  }

  return newInsight as ReportInsight || {
    id: 'temp',
    report_id: reportId,
    insight_type: 'analysis',
    title: result.title,
    summary: result.summary,
    content: result.narrative,
    credibility_analysis: result.credibility_analysis,
    similar_cases: result.similar_cases,
    mundane_explanations: result.mundane_explanations,
    content_type_assessment: result.content_type_assessment,
    model_used: MODEL,
    generated_at: new Date().toISOString(),
    valid_until: validUntil.toISOString()
  }
}

/**
 * Invalidate cached insight for a report
 */
export async function invalidateReportInsight(reportId: string): Promise<void> {
  const supabase = createServerClient()

  await (supabase
    .from('report_insights' as any) as any)
    .update({ is_stale: true })
    .eq('report_id', reportId)
}

// ============================================
// Helper Functions
// ============================================

function buildReportPrompt(report: Report & { phenomenon_type?: { name: string } | null }): string {
  const categoryLabels: Record<string, string> = {
    ufo: 'UFO/UAP Sighting',
    cryptid: 'Cryptid Encounter',
    ghost: 'Ghost/Apparition',
    psychic: 'Psychic Phenomenon',
    nde: 'Near-Death Experience',
    abduction: 'Abduction Experience',
    poltergeist: 'Poltergeist Activity',
    time_anomaly: 'Time Anomaly',
    men_in_black: 'Men in Black Encounter',
    portal: 'Portal/Dimensional Anomaly',
    combination: 'Multiple Phenomena'
  }

  let prompt = `Analyze this paranormal report submission:\n\n`

  prompt += `**Category:** ${categoryLabels[report.category] || report.category}\n`
  if (report.phenomenon_type?.name) {
    prompt += `**Phenomenon Type:** ${report.phenomenon_type.name}\n`
  }
  prompt += `**Title:** ${report.title}\n`

  if (report.event_date) {
    prompt += `**Date of Event:** ${report.event_date}\n`
  }
  if (report.event_time) {
    prompt += `**Time of Event:** ${report.event_time}\n`
  }
  if (report.location_name) {
    prompt += `**Location:** ${report.location_name}`
    if (report.state_province) prompt += `, ${report.state_province}`
    if (report.country) prompt += `, ${report.country}`
    prompt += `\n`
  }

  if (report.witness_count && report.witness_count > 1) {
    prompt += `**Number of Witnesses:** ${report.witness_count}\n`
  }

  prompt += `\n**Full Account:**\n${report.description}\n`

  // Evidence indicators
  const evidenceIndicators: string[] = []
  if (report.has_photo_video) evidenceIndicators.push('Photos/Video reported')
  if (report.has_physical_evidence) evidenceIndicators.push('Physical evidence claimed')
  if (report.has_official_report) evidenceIndicators.push('Official report filed')

  if (evidenceIndicators.length > 0) {
    prompt += `\n**Evidence Indicators:** ${evidenceIndicators.join(', ')}\n`
  }

  if (report.evidence_summary) {
    prompt += `**Evidence Details:** ${report.evidence_summary}\n`
  }

  prompt += `\n**Current Credibility Rating:** ${report.credibility}\n`
  prompt += `**Source:** ${report.source_type}\n`

  // Add source-specific context for Reddit reports
  if (report.source_type === 'reddit' || report.source_type === 'reddit-comments') {
    prompt += `\n**Source Context:** This report was sourced from Reddit`
    if ((report as any).source_label) {
      prompt += ` (${(report as any).source_label})`
    }
    prompt += `. The title is the original Reddit post title and may not accurately describe the paranormal experience. Please base your analysis primarily on the Full Account above, not the title.\n`
    if (report.tags && report.tags.includes('comment-experience')) {
      prompt += `**Note:** This is a comment-experience — a first-person testimony extracted from a Reddit comment thread. It may be brief but represents a direct witness account.\n`
    }
  }

  if (report.tags && report.tags.length > 0) {
    prompt += `**Tags:** ${report.tags.join(', ')}\n`
  }

  prompt += `\n---\n\n`

  prompt += `Please provide your analysis in the following format:

TITLE: [A concise, engaging title for your analysis - max 80 characters]

SUMMARY: [A 1-2 sentence summary of your key findings - max 200 characters]

ANALYSIS:
[2-3 paragraphs providing:
- Key observations from the report
- What makes this report notable or interesting
- Context within the broader field of similar reports]

MUNDANE_EXPLANATIONS:
[List 2-3 possible conventional explanations, formatted as:]
- [Explanation]: [Likelihood: high/medium/low] - [Brief reasoning]

CREDIBILITY_ASSESSMENT:
Score: [0-100]
Reasoning: [1-2 sentences explaining the overall assessment]
Factors:
- [Factor name]: [positive/negative/neutral] - [Description]
- [Factor name]: [positive/negative/neutral] - [Description]
- [Factor name]: [positive/negative/neutral] - [Description]

SIMILAR_CASES:
[List 1-3 similar historical cases if applicable, formatted as:]
- [Case name/title] ([Year if known], [Location if known]): [Why it's similar]

CONTENT_TYPE_ASSESSMENT:
Type: [experiencer_report / historical_case / news_discussion / research_analysis]
Is First-Hand Account: [yes / no]
Contains First-Hand Accounts: [yes / no — only relevant for historical_case type; yes if the report includes named witness testimony, direct quotes, sworn statements, or documented first-hand accounts from identified individuals]
Confidence: [high / medium / low]
Reasoning: [1 sentence explaining why you classified it this way]`

  return prompt
}

function parseInsightResponse(
  response: string,
  report: Report
): InsightGenerationResult {
  // Extract sections using regex
  const titleMatch = response.match(/TITLE:\s*([\s\S]+?)(?:\n\n|SUMMARY:)/i)
  const summaryMatch = response.match(/SUMMARY:\s*([\s\S]+?)(?:\n\n|ANALYSIS:)/i)
  const analysisMatch = response.match(/ANALYSIS:\s*([\s\S]+?)(?:\n\n|MUNDANE_EXPLANATIONS:)/i)
  const mundaneMatch = response.match(/MUNDANE_EXPLANATIONS:\s*([\s\S]+?)(?:\n\n|CREDIBILITY_ASSESSMENT:)/i)
  const credibilityMatch = response.match(/CREDIBILITY_ASSESSMENT:\s*([\s\S]+?)(?:\n\n|SIMILAR_CASES:)/i)
  const similarMatch = response.match(/SIMILAR_CASES:\s*([\s\S]+?)(?:\n\n|CONTENT_TYPE_ASSESSMENT:)/i)
  const contentTypeMatch = response.match(/CONTENT_TYPE_ASSESSMENT:\s*([\s\S]+?)$/i)

  const title = titleMatch?.[1]?.trim() || `Analysis: ${report.title}`
  const summary = summaryMatch?.[1]?.trim() || 'AI-generated analysis of this report.'
  const narrative = analysisMatch?.[1]?.trim() || response

  // Parse mundane explanations
  const mundane_explanations: MundaneExplanation[] = []
  if (mundaneMatch?.[1]) {
    const explanationLines = mundaneMatch[1].split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of explanationLines) {
      const match = line.match(/-\s*([^:]+):\s*\[?Likelihood:\s*(high|medium|low)\]?\s*-?\s*(.+)/i)
      if (match) {
        mundane_explanations.push({
          explanation: match[1].trim(),
          likelihood: match[2].toLowerCase() as 'high' | 'medium' | 'low',
          reasoning: match[3].trim()
        })
      }
    }
  }

  // Parse credibility analysis
  let credibility_analysis: CredibilityAnalysis = {
    score: 50,
    reasoning: 'Standard credibility assessment.',
    factors: []
  }

  if (credibilityMatch?.[1]) {
    const credText = credibilityMatch[1]
    const scoreMatch = credText.match(/Score:\s*(\d+)/i)
    const reasoningMatch = credText.match(/Reasoning:\s*([^\n]+)/i)

    if (scoreMatch) credibility_analysis.score = parseInt(scoreMatch[1])
    if (reasoningMatch) credibility_analysis.reasoning = reasoningMatch[1].trim()

    // Parse factors
    const factorLines = credText.split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of factorLines) {
      const match = line.match(/-\s*([^:]+):\s*(positive|negative|neutral)\s*-\s*(.+)/i)
      if (match) {
        credibility_analysis.factors.push({
          name: match[1].trim(),
          impact: match[2].toLowerCase() as 'positive' | 'negative' | 'neutral',
          description: match[3].trim()
        })
      }
    }
  }

  // Parse similar cases
  const similar_cases: SimilarCase[] = []
  if (similarMatch?.[1]) {
    const caseLines = similarMatch[1].split('\n').filter(l => l.trim().startsWith('-'))
    for (const line of caseLines) {
      const match = line.match(/-\s*([^(]+)(?:\(([^)]+)\))?:\s*(.+)/i)
      if (match) {
        const metaMatch = match[2]?.match(/(\d{4})?[,\s]*(.+)?/)
        similar_cases.push({
          title: match[1].trim(),
          year: metaMatch?.[1] ? parseInt(metaMatch[1]) : undefined,
          location: metaMatch?.[2]?.trim(),
          similarity_reason: match[3].trim()
        })
      }
    }
  }

  // Parse content type assessment
  let content_type_assessment: ContentTypeAssessment = {
    suggested_type: 'experiencer_report',
    confidence: 'medium',
    reasoning: 'Default classification as experiencer report.',
    is_first_hand_account: true
  }

  if (contentTypeMatch?.[1]) {
    const contentText = contentTypeMatch[1]
    const typeMatch = contentText.match(/Type:\s*(experiencer_report|historical_case|news_discussion|research_analysis)/i)
    const firstHandMatch = contentText.match(/Is First-Hand Account:\s*(yes|no)/i)
    const containsFirstHandMatch = contentText.match(/Contains First-Hand Accounts:\s*(yes|no)/i)
    const confidenceMatch = contentText.match(/Confidence:\s*(high|medium|low)/i)
    const reasoningMatch = contentText.match(/Reasoning:\s*([^\n]+)/i)

    if (typeMatch) {
      content_type_assessment.suggested_type = typeMatch[1].toLowerCase() as ContentTypeAssessment['suggested_type']
    }
    if (firstHandMatch) {
      content_type_assessment.is_first_hand_account = firstHandMatch[1].toLowerCase() === 'yes'
    }
    if (containsFirstHandMatch) {
      content_type_assessment.contains_first_hand_accounts = containsFirstHandMatch[1].toLowerCase() === 'yes'
    }
    if (confidenceMatch) {
      content_type_assessment.confidence = confidenceMatch[1].toLowerCase() as 'high' | 'medium' | 'low'
    }
    if (reasoningMatch) {
      content_type_assessment.reasoning = reasoningMatch[1].trim()
    }
  }

  return {
    title,
    summary,
    narrative,
    credibility_analysis,
    similar_cases,
    mundane_explanations,
    content_type_assessment
  }
}

function generateFallbackInsight(report: Report): InsightGenerationResult {
  const categoryLabels: Record<string, string> = {
    ufo: 'UFO/UAP',
    cryptid: 'cryptid',
    ghost: 'paranormal',
    psychic: 'psychic',
    nde: 'near-death experience',
    abduction: 'abduction',
    poltergeist: 'poltergeist',
    time_anomaly: 'temporal anomaly',
    men_in_black: 'Men in Black',
    portal: 'dimensional',
    combination: 'multi-phenomenon'
  }

  const categoryType = categoryLabels[report.category] || 'paranormal'

  return {
    title: `${categoryType.charAt(0).toUpperCase() + categoryType.slice(1)} Report Analysis`,
    summary: `Analysis of this ${categoryType} report from ${report.location_name || 'an undisclosed location'}.`,
    narrative: `This ${categoryType} report describes an experience that occurred${report.event_date ? ` on ${report.event_date}` : ''}${report.location_name ? ` in ${report.location_name}` : ''}. The witness account provides ${report.description.length > 500 ? 'detailed' : 'brief'} information about the encounter.\n\nFurther analysis is pending. The report has been assigned a ${report.credibility} credibility rating based on available information.`,
    credibility_analysis: {
      score: report.credibility === 'high' ? 75 : report.credibility === 'medium' ? 50 : 25,
      reasoning: 'Automated assessment based on report metadata.',
      factors: [
        {
          name: 'Detail Level',
          impact: report.description.length > 300 ? 'positive' : 'neutral',
          description: report.description.length > 300 ? 'Report contains substantial detail' : 'Report provides basic information'
        }
      ]
    },
    similar_cases: [],
    mundane_explanations: [],
    content_type_assessment: {
      suggested_type: report.submitter_was_witness ? 'experiencer_report' : 'historical_case',
      confidence: 'low',
      reasoning: 'Fallback classification based on report metadata.',
      is_first_hand_account: report.submitter_was_witness
    }
  }
}

function computeReportHash(report: Report): string {
  const relevantData = {
    title: report.title,
    description: report.description,
    category: report.category,
    credibility: report.credibility,
    updated_at: report.updated_at
  }
  return crypto
    .createHash('sha256')
    .update(JSON.stringify(relevantData))
    .digest('hex')
    .substring(0, 16)
}
