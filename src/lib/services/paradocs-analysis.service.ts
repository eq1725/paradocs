/**
 * Paradocs Analysis Generation Service
 *
 * Generates original contextual analysis + structured assessment for each report
 * using Claude Haiku. This is the transformative content layer that makes Paradocs
 * an index with attribution rather than a republisher.
 *
 * Produces two fields per report:
 * 1. paradocs_narrative — 1-4 paragraph original editorial analysis (NOT a summary)
 * 2. paradocs_assessment — structured JSON (credibility, mundane explanations, content type)
 *
 * Session 10 (Revised): Data Ingestion & Pipeline
 */

import { createServerClient } from '../supabase'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'
var ANTHROPIC_FALLBACK = 'claude-3-5-haiku-20241022'

// ============================================
// Types
// ============================================

interface ParadocsAssessment {
  credibility_score: number
  credibility_reasoning: string
  credibility_factors: Array<{
    name: string
    impact: 'positive' | 'negative' | 'neutral'
    description: string
  }>
  mundane_explanations: Array<{
    explanation: string
    likelihood: 'high' | 'medium' | 'low'
    reasoning: string
  }>
  content_type: {
    suggested_type: 'experiencer_report' | 'historical_case' | 'news_discussion' | 'research_analysis'
    is_first_hand_account: boolean
    confidence: 'high' | 'medium' | 'low'
  }
  similar_phenomena: string[]
  emotional_tone?: 'frightening' | 'awe_inspiring' | 'ambiguous' | 'clinical' | 'unsettling' | 'hopeful'
}

// ============================================
// System Prompts
// ============================================

var NARRATIVE_SYSTEM_PROMPT = 'You are an editorial analyst for Paradocs, a comprehensive paranormal phenomena database. '
  + 'Your job is to write original contextual analysis for individual reports. You are Paradocs\'s '
  + 'editorial voice — authoritative, balanced, deeply knowledgeable, and genuinely curious.\n\n'
  + 'Your analysis should:\n'
  + '- Place the report in broader context (historical parallels, geographic patterns, similar accounts)\n'
  + '- Note what makes this particular account notable or typical\n'
  + '- Reference relevant phenomena categories and known patterns\n'
  + '- Maintain intellectual rigor while taking the subject matter seriously\n'
  + '- NEVER reproduce or closely paraphrase the source text\n'
  + '- NEVER start with "This report..." or "The witness describes..."\n'
  + '- Write as if you\'re a documentary narrator, not a summarizer\n\n'
  + 'Length rules (STRICT — based on source content length):\n'
  + '- Source under 50 words: 1 paragraph (3-5 sentences)\n'
  + '- Source 50-200 words: 2 paragraphs\n'
  + '- Source 200-500 words: 3 paragraphs\n'
  + '- Source 500+ words: 3-4 paragraphs (maximum)\n'
  + '- NEVER exceed the length of the source material\n\n'
  + 'Category tone:\n'
  + '- UFOs/UAPs: Technical, measured. Reference flight characteristics, radar data, official responses.\n'
  + '- Cryptids: Natural history framing. Reference habitat, behavioral patterns, witness credibility indicators.\n'
  + '- Ghosts/Hauntings: Atmospheric, investigative. Reference property history, recurring patterns, environmental factors.\n'
  + '- NDEs/Consciousness: Clinical yet empathetic. Reference common NDE elements, neurological research, cross-cultural parallels.\n'
  + '- Psychic phenomena: Empirical framing. Reference experimental protocols, statistical anomalies, replication.\n\n'
  + 'Return ONLY the narrative text. No quotes, no labels, no explanation.\n'
  + 'NEVER use markdown headings (no # or ## or ###). NEVER start with the report title as a heading. Just write plain paragraphs.'

var ASSESSMENT_SYSTEM_PROMPT = 'Analyze this paranormal report and provide a structured assessment. '
  + 'Return valid JSON only, no markdown code fences, no commentary.\n\n'
  + 'JSON schema:\n'
  + '{\n'
  + '  "credibility_score": <0-100>,\n'
  + '  "credibility_reasoning": "<1-2 sentences>",\n'
  + '  "credibility_factors": [{"name": "...", "impact": "positive|negative|neutral", "description": "..."}],\n'
  + '  "mundane_explanations": [{"explanation": "...", "likelihood": "high|medium|low", "reasoning": "..."}],\n'
  + '  "content_type": {"suggested_type": "experiencer_report|historical_case|news_discussion|research_analysis", "is_first_hand_account": true|false, "confidence": "high|medium|low"},\n'
  + '  "similar_phenomena": ["phenomenon name 1", "phenomenon name 2"],\n'
  + '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful"\n'
  + '}\n\n'
  + 'Rules:\n'
  + '- credibility_score: 0 = clearly fabricated, 50 = insufficient info, 100 = multiple corroborated witnesses with evidence\n'
  + '- Provide 2-4 credibility_factors\n'
  + '- Provide 1-3 mundane_explanations (always consider at least one)\n'
  + '- similar_phenomena: name real paranormal phenomena categories (e.g. "shadow people", "orbs", "missing time")\n'
  + '- emotional_tone: pick the single best match for the overall tone of the report'

// ============================================
// Combined prompt approach (single API call for cost efficiency)
// ============================================

var COMBINED_SYSTEM_PROMPT = 'You are an editorial analyst for Paradocs, a comprehensive paranormal phenomena database. '
  + 'You will produce TWO outputs separated by the exact delimiter "---ASSESSMENT---".\n\n'
  + 'PART 1 (before delimiter): Original contextual analysis narrative.\n'
  + 'You are Paradocs\'s editorial voice — authoritative, balanced, deeply knowledgeable, and genuinely curious.\n\n'
  + 'Narrative rules:\n'
  + '- Place the report in broader context (historical parallels, geographic patterns, similar accounts)\n'
  + '- Note what makes this particular account notable or typical\n'
  + '- Reference relevant phenomena categories and known patterns\n'
  + '- Maintain intellectual rigor while taking the subject matter seriously\n'
  + '- NEVER reproduce or closely paraphrase the source text\n'
  + '- NEVER start with "This report..." or "The witness describes..."\n'
  + '- Write as if you\'re a documentary narrator, not a summarizer\n'
  + '- NEVER use markdown headings (no # or ## or ###). Just write plain paragraphs.\n'
  + '- NEVER start with the report title as a heading. Jump straight into the analysis.\n\n'
  + 'Length rules (STRICT — based on source content length):\n'
  + '- Source under 50 words: 1 paragraph (3-5 sentences)\n'
  + '- Source 50-200 words: 2 paragraphs\n'
  + '- Source 200-500 words: 3 paragraphs\n'
  + '- Source 500+ words: 3-4 paragraphs (maximum)\n'
  + '- NEVER exceed the length of the source material\n\n'
  + 'Category tone:\n'
  + '- UFOs/UAPs: Technical, measured. Reference flight characteristics, radar data, official responses.\n'
  + '- Cryptids: Natural history framing. Reference habitat, behavioral patterns, witness credibility indicators.\n'
  + '- Ghosts/Hauntings: Atmospheric, investigative. Reference property history, recurring patterns, environmental factors.\n'
  + '- NDEs/Consciousness: Clinical yet empathetic. Reference common NDE elements, neurological research, cross-cultural parallels.\n'
  + '- Psychic phenomena: Empirical framing. Reference experimental protocols, statistical anomalies, replication.\n\n'
  + 'PART 2 (after delimiter): Structured JSON assessment.\n'
  + 'Return valid JSON only (no markdown fences):\n'
  + '{\n'
  + '  "credibility_score": <0-100>,\n'
  + '  "credibility_reasoning": "<1-2 sentences>",\n'
  + '  "credibility_factors": [{"name": "...", "impact": "positive|negative|neutral", "description": "..."}],\n'
  + '  "mundane_explanations": [{"explanation": "...", "likelihood": "high|medium|low", "reasoning": "..."}],\n'
  + '  "content_type": {"suggested_type": "experiencer_report|historical_case|news_discussion|research_analysis", "is_first_hand_account": true|false, "confidence": "high|medium|low"},\n'
  + '  "similar_phenomena": ["phenomenon name 1", "phenomenon name 2"],\n'
  + '  "emotional_tone": "frightening|awe_inspiring|ambiguous|clinical|unsettling|hopeful"\n'
  + '}\n\n'
  + 'Format:\n'
  + '[narrative paragraphs here]\n'
  + '---ASSESSMENT---\n'
  + '{json here}'

// ============================================
// Prompt Builders
// ============================================

function buildUserPrompt(report: any): string {
  var parts: string[] = []

  if (report.title) parts.push('Title: ' + report.title)
  if (report.category) parts.push('Category: ' + report.category)
  if (report.location_name) parts.push('Location: ' + report.location_name)
  if (report.country) parts.push('Country: ' + report.country)
  if (report.state_province) parts.push('State/Province: ' + report.state_province)
  if (report.city) parts.push('City: ' + report.city)
  if (report.event_date) parts.push('Date: ' + report.event_date)
  if (report.credibility) parts.push('Credibility: ' + report.credibility)
  if (report.source_type) parts.push('Source: ' + report.source_type)
  if (report.source_label) parts.push('Source Label: ' + report.source_label)
  if (report.tags && report.tags.length > 0) parts.push('Tags: ' + report.tags.join(', '))
  if (report.summary) parts.push('Summary: ' + report.summary)

  // Include full description for AI processing — truncate at ~3000 chars for cost
  if (report.description) {
    var desc = report.description.length > 3000
      ? report.description.substring(0, 3000) + '...'
      : report.description
    parts.push('\nFull Report Text:\n' + desc)
  }

  // Include word count so the model can calibrate narrative length
  if (report.description) {
    var wordCount = report.description.split(/\s+/).length
    parts.push('\nSource word count: ' + wordCount)
  }

  return parts.join('\n')
}

// ============================================
// API Calling
// ============================================

async function callClaude(
  systemPrompt: string,
  userPrompt: string,
  maxTokens: number
): Promise<string | null> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    console.error('[ParadocsAnalysis] No ANTHROPIC_API_KEY found')
    return null
  }

  var models = [ANTHROPIC_MODEL, ANTHROPIC_FALLBACK]

  for (var m = 0; m < models.length; m++) {
    try {
      var resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: models[m],
          max_tokens: maxTokens,
          system: systemPrompt,
          messages: [{ role: 'user', content: userPrompt }]
        })
      })

      if (!resp.ok) {
        var errText = await resp.text()
        console.error('[ParadocsAnalysis] API error with ' + models[m] + ': ' + resp.status + ' ' + errText)
        continue
      }

      var data = await resp.json()
      if (data.content && data.content.length > 0 && data.content[0].text) {
        return data.content[0].text.trim()
      }
    } catch (err) {
      console.error('[ParadocsAnalysis] Error with model ' + models[m] + ':', err)
      continue
    }
  }

  return null
}

// ============================================
// Parsing
// ============================================

function parseAssessmentJson(text: string): ParadocsAssessment | null {
  try {
    // Strip markdown code fences if present
    var cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()

    // Try to find JSON object in text
    var jsonStart = cleaned.indexOf('{')
    var jsonEnd = cleaned.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) return null

    var jsonStr = cleaned.substring(jsonStart, jsonEnd + 1)
    var parsed = JSON.parse(jsonStr)

    // Validate required fields
    if (typeof parsed.credibility_score !== 'number') return null
    if (!parsed.credibility_reasoning) return null

    // Clamp credibility score
    parsed.credibility_score = Math.max(0, Math.min(100, Math.round(parsed.credibility_score)))

    // Ensure arrays exist
    if (!Array.isArray(parsed.credibility_factors)) parsed.credibility_factors = []
    if (!Array.isArray(parsed.mundane_explanations)) parsed.mundane_explanations = []
    if (!Array.isArray(parsed.similar_phenomena)) parsed.similar_phenomena = []

    // Validate content_type
    if (!parsed.content_type || !parsed.content_type.suggested_type) {
      parsed.content_type = {
        suggested_type: 'experiencer_report',
        is_first_hand_account: true,
        confidence: 'low'
      }
    }

    // Validate emotional_tone
    var validTones = ['frightening', 'awe_inspiring', 'ambiguous', 'clinical', 'unsettling', 'hopeful']
    if (parsed.emotional_tone && validTones.indexOf(parsed.emotional_tone) === -1) {
      delete parsed.emotional_tone
    }

    return parsed as ParadocsAssessment
  } catch (err) {
    console.error('[ParadocsAnalysis] Failed to parse assessment JSON:', err)
    return null
  }
}

/**
 * Clean up narrative text — strip markdown headings, leading titles, etc.
 */
function cleanNarrative(text: string): string {
  var cleaned = text
  // Remove markdown headings (# Title, ## Title, ### Title)
  cleaned = cleaned.replace(/^#{1,4}\s+.+$/gm, '')
  // Remove bold-only lines that look like titles (** Title **)
  cleaned = cleaned.replace(/^\*\*[^*]+\*\*\s*$/gm, '')
  // Collapse multiple blank lines into one
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n')
  return cleaned.trim()
}

function parseCombinedResponse(response: string): {
  narrative: string | null
  assessment: ParadocsAssessment | null
} {
  var delimiter = '---ASSESSMENT---'
  var delimiterIndex = response.indexOf(delimiter)

  if (delimiterIndex === -1) {
    // Try to detect if the whole thing is just a narrative (no JSON part)
    if (response.indexOf('{') === -1) {
      return { narrative: cleanNarrative(response), assessment: null }
    }
    // Try to detect if JSON is embedded without delimiter
    var lastBrace = response.lastIndexOf('}')
    var firstBrace = response.indexOf('{')
    if (firstBrace > 50) {
      // There's text before the JSON — assume narrative + json
      return {
        narrative: cleanNarrative(response.substring(0, firstBrace)),
        assessment: parseAssessmentJson(response.substring(firstBrace))
      }
    }
    return { narrative: null, assessment: null }
  }

  var narrativePart = response.substring(0, delimiterIndex).trim()
  var assessmentPart = response.substring(delimiterIndex + delimiter.length).trim()

  return {
    narrative: narrativePart.length > 30 ? cleanNarrative(narrativePart) : null,
    assessment: parseAssessmentJson(assessmentPart)
  }
}

// ============================================
// Core Generation Functions
// ============================================

/**
 * Generate Paradocs Analysis (narrative + assessment) for a single report.
 * Uses a combined single API call for cost efficiency.
 * Returns null if generation completely fails.
 */
export async function generateParadocsAnalysis(reportId: string): Promise<{
  narrative: string
  assessment: ParadocsAssessment
} | null> {
  var supabase = createServerClient()

  // Fetch report data
  var { data: report, error: fetchError } = await supabase
    .from('reports')
    .select('id, title, summary, description, category, location_name, country, state_province, city, event_date, credibility, source_type, source_label, tags')
    .eq('id', reportId)
    .single()

  if (fetchError || !report) {
    console.error('[ParadocsAnalysis] Report not found: ' + reportId)
    return null
  }

  var userPrompt = buildUserPrompt(report)

  // Try combined approach first (single call, lower cost)
  var combinedResponse = await callClaude(COMBINED_SYSTEM_PROMPT, userPrompt, 1500)

  if (combinedResponse) {
    var parsed = parseCombinedResponse(combinedResponse)

    if (parsed.narrative && parsed.assessment) {
      return {
        narrative: parsed.narrative,
        assessment: parsed.assessment
      }
    }

    // If combined failed to parse properly, try separate calls
    if (parsed.narrative && !parsed.assessment) {
      // We got a narrative, just need assessment
      var assessmentResponse = await callClaude(ASSESSMENT_SYSTEM_PROMPT, userPrompt, 800)
      if (assessmentResponse) {
        var assessment = parseAssessmentJson(assessmentResponse)
        if (assessment) {
          return { narrative: parsed.narrative, assessment: assessment }
        }
      }
    }
  }

  // Fallback: try separate calls
  console.log('[ParadocsAnalysis] Combined call failed, trying separate calls for ' + reportId)

  var narrativeResponse = await callClaude(NARRATIVE_SYSTEM_PROMPT, userPrompt, 800)
  var assessmentResponse2 = await callClaude(ASSESSMENT_SYSTEM_PROMPT, userPrompt, 800)

  var narrative = narrativeResponse && narrativeResponse.length > 30 ? narrativeResponse : null
  var assessment2 = assessmentResponse2 ? parseAssessmentJson(assessmentResponse2) : null

  if (narrative && assessment2) {
    return { narrative: narrative, assessment: assessment2 }
  }

  // If we got at least a narrative, return it with a minimal assessment
  if (narrative) {
    return {
      narrative: narrative,
      assessment: {
        credibility_score: 50,
        credibility_reasoning: 'Assessment generation failed; default score assigned.',
        credibility_factors: [],
        mundane_explanations: [],
        content_type: {
          suggested_type: 'experiencer_report',
          is_first_hand_account: true,
          confidence: 'low'
        },
        similar_phenomena: []
      }
    }
  }

  console.error('[ParadocsAnalysis] Complete generation failure for report: ' + reportId)
  return null
}

/**
 * Generate and save Paradocs Analysis for a single report.
 * Returns true if saved successfully, false otherwise.
 */
export async function generateAndSaveParadocsAnalysis(reportId: string): Promise<boolean> {
  var result = await generateParadocsAnalysis(reportId)

  if (!result) {
    console.warn('[ParadocsAnalysis] Failed to generate analysis for report: ' + reportId)
    return false
  }

  var supabase = createServerClient()

  // Determine which model was used (we track for auditing)
  var modelUsed = ANTHROPIC_MODEL

  var updateData: Record<string, any> = {
    paradocs_narrative: result.narrative,
    paradocs_assessment: result.assessment,
    paradocs_analysis_generated_at: new Date().toISOString(),
    paradocs_analysis_model: modelUsed
  }

  // If we got an emotional_tone, save it too (for future feed ranking)
  if (result.assessment.emotional_tone) {
    updateData.emotional_tone = result.assessment.emotional_tone
  }

  var { error: updateError } = await (supabase
    .from('reports') as any)
    .update(updateData)
    .eq('id', reportId)

  if (updateError) {
    console.error('[ParadocsAnalysis] Failed to save analysis for report ' + reportId + ':', updateError)
    return false
  }

  return true
}

/**
 * Generate analysis for a batch of report IDs.
 * Includes rate limiting to avoid API throttling.
 */
export async function generateAnalysisBatch(
  reportIds: string[],
  options?: { delayMs?: number; batchSize?: number; force?: boolean }
): Promise<{ generated: number; skipped: number; failed: number; errors: string[] }> {
  var supabase = createServerClient()
  var delayMs = options?.delayMs || 200
  var batchSize = options?.batchSize || 15
  var force = options?.force || false
  var stats = { generated: 0, skipped: 0, failed: 0, errors: [] as string[] }

  for (var i = 0; i < reportIds.length; i += batchSize) {
    var batch = reportIds.slice(i, i + batchSize)

    for (var j = 0; j < batch.length; j++) {
      var reportId = batch[j]

      // Check if already has analysis (unless force)
      if (!force) {
        var { data: existing } = await (supabase
          .from('reports') as any)
          .select('paradocs_narrative')
          .eq('id', reportId)
          .single()

        if (existing && existing.paradocs_narrative) {
          stats.skipped++
          continue
        }
      }

      try {
        var success = await generateAndSaveParadocsAnalysis(reportId)
        if (success) {
          stats.generated++
        } else {
          stats.failed++
          stats.errors.push('Report ' + reportId + ': generation returned null')
        }
      } catch (err: any) {
        stats.failed++
        stats.errors.push('Report ' + reportId + ': ' + (err.message || 'unknown error'))
      }

      // Rate limiting delay between individual calls
      if (j < batch.length - 1) {
        await new Promise(function(resolve) { setTimeout(resolve, delayMs) })
      }
    }

    // Longer delay between batches
    if (i + batchSize < reportIds.length) {
      await new Promise(function(resolve) { setTimeout(resolve, 2000) })
    }
  }

  return stats
}

/**
 * Get Paradocs Analysis generation statistics
 */
export async function getParadocsAnalysisStats(): Promise<{
  total_approved: number
  with_narrative: number
  with_assessment: number
  without_analysis: number
  coverage_pct: number
}> {
  var supabase = createServerClient()

  var { count: totalApproved } = await supabase
    .from('reports')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')

  var { count: withNarrative } = await (supabase
    .from('reports') as any)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('paradocs_narrative', 'is', null)

  var { count: withAssessment } = await (supabase
    .from('reports') as any)
    .select('*', { count: 'exact', head: true })
    .eq('status', 'approved')
    .not('paradocs_assessment', 'is', null)

  var total = totalApproved || 0
  var narr = withNarrative || 0
  var assess = withAssessment || 0

  return {
    total_approved: total,
    with_narrative: narr,
    with_assessment: assess,
    without_analysis: total - narr,
    coverage_pct: total > 0 ? Math.round((narr / total) * 1000) / 10 : 0
  }
}
