/**
 * Research Hub Insights Service
 *
 * Generates AI insights for the constellation research hub.
 * Two modes:
 *   1. On-add: Lightweight SQL-based checks when a user saves an artifact
 *   2. Deep scan: Claude API analysis of full research hub (weekly cron)
 *
 * On-add checks (no LLM call needed):
 *   - Spatial proximity: existing artifacts within ~50 miles
 *   - Temporal proximity: existing artifacts within +/-30 days
 *   - Tag overlap: shared tags with existing artifacts
 *   - Source overlap: same author/channel/subreddit
 *   - Phenomenon match: same linked phenomenon
 *
 * Deep scan (Claude API):
 *   - Cross-artifact pattern detection
 *   - Temporal sequence analysis
 *   - Geographic corridor detection
 *   - Investigation gap suggestions
 *   - Cross-case-file relationship discovery
 */

import Anthropic from '@anthropic-ai/sdk'
import { createServerClient } from '../supabase'

var anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

var DEEP_SCAN_MODEL = 'claude-sonnet-4-5-20250929'
var DEEP_SCAN_MAX_TOKENS = 2048

// ── Types ──

interface InsightInput {
  user_id: string
  scope_type: 'artifact' | 'case_file' | 'constellation'
  scope_id: string | null
  insight_type: string
  title: string
  body: string
  primary_view: string | null
  artifact_ids: string[]
  connection_ids: string[]
  confidence: number
  expires_at: string | null
}

interface ArtifactRow {
  id: string
  user_id: string
  source_type: string
  title: string
  external_url: string | null
  source_platform: string | null
  extracted_date: string | null
  extracted_location: string | null
  coordinates: any
  tags: string[]
  verdict: string | null
  metadata_json: any
  created_at: string
}

// ── On-Add Insight Generation ──

/**
 * Run all 5 lightweight checks when a user adds a new artifact.
 * Returns the insights that were generated and inserted.
 */
export async function generateOnAddInsights(
  userId: string,
  newArtifact: ArtifactRow
): Promise<InsightInput[]> {
  var supabase = createServerClient()
  var generatedInsights: InsightInput[] = []

  // Fetch all existing artifacts for this user (excluding the new one)
  var existingResult = await supabase
    .from('constellation_artifacts')
    .select('*')
    .eq('user_id', userId)
    .neq('id', newArtifact.id)

  var existing: ArtifactRow[] = (existingResult.data as any[]) || []

  if (existing.length === 0) return generatedInsights

  // ── Check 1: Temporal Proximity (within +/-30 days) ──
  if (newArtifact.extracted_date) {
    var newDate = new Date(newArtifact.extracted_date)
    var thirtyDays = 30 * 24 * 60 * 60 * 1000
    var temporalMatches = existing.filter(function(a) {
      if (!a.extracted_date) return false
      var diff = Math.abs(new Date(a.extracted_date).getTime() - newDate.getTime())
      return diff <= thirtyDays
    })

    if (temporalMatches.length > 0) {
      var matchTitles = temporalMatches.slice(0, 3).map(function(a) { return a.title })
      var dateStr = newDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      generatedInsights.push({
        user_id: userId,
        scope_type: 'artifact',
        scope_id: newArtifact.id,
        insight_type: 'temporal_pattern',
        title: 'Temporal cluster detected around ' + dateStr,
        body: 'Your new artifact "' + truncate(newArtifact.title, 40) + '" occurred within 30 days of ' + temporalMatches.length + ' other artifact' + (temporalMatches.length > 1 ? 's' : '') + ': ' + matchTitles.join(', ') + '. This temporal clustering could indicate a wave of activity worth investigating.',
        primary_view: 'timeline',
        artifact_ids: [newArtifact.id].concat(temporalMatches.map(function(a) { return a.id })),
        connection_ids: [],
        confidence: Math.min(0.5 + temporalMatches.length * 0.1, 0.9),
        expires_at: getExpiryDate(14),
      })
    }
  }

  // ── Check 2: Tag Overlap ──
  if (newArtifact.tags && newArtifact.tags.length > 0) {
    var tagMatches: Record<string, string[]> = {} // tag -> artifact IDs
    existing.forEach(function(a) {
      if (!a.tags) return
      a.tags.forEach(function(tag) {
        if (newArtifact.tags.includes(tag)) {
          if (!tagMatches[tag]) tagMatches[tag] = []
          tagMatches[tag].push(a.id)
        }
      })
    })

    var sharedTags = Object.keys(tagMatches)
    if (sharedTags.length > 0) {
      var allMatchedIds = new Set<string>()
      sharedTags.forEach(function(tag) {
        tagMatches[tag].forEach(function(id) { allMatchedIds.add(id) })
      })

      generatedInsights.push({
        user_id: userId,
        scope_type: 'artifact',
        scope_id: newArtifact.id,
        insight_type: 'suggestion',
        title: 'Shared tags: ' + sharedTags.slice(0, 3).join(', '),
        body: 'Your new artifact shares ' + sharedTags.length + ' tag' + (sharedTags.length > 1 ? 's' : '') + ' with ' + allMatchedIds.size + ' existing artifact' + (allMatchedIds.size > 1 ? 's' : '') + '. Consider drawing connections between these related pieces of evidence.',
        primary_view: 'board',
        artifact_ids: [newArtifact.id].concat(Array.from(allMatchedIds).slice(0, 5)),
        connection_ids: [],
        confidence: Math.min(0.4 + sharedTags.length * 0.15, 0.85),
        expires_at: getExpiryDate(7),
      })
    }
  }

  // ── Check 3: Source/Platform Overlap ──
  if (newArtifact.source_platform || newArtifact.source_type !== 'paradocs_report') {
    var platformKey = newArtifact.source_platform || newArtifact.source_type
    var sourceMatches = existing.filter(function(a) {
      var otherKey = a.source_platform || a.source_type
      return otherKey === platformKey && a.source_type !== 'paradocs_report'
    })

    if (sourceMatches.length >= 2) {
      generatedInsights.push({
        user_id: userId,
        scope_type: 'artifact',
        scope_id: newArtifact.id,
        insight_type: 'source_correlation',
        title: 'Multiple sources from ' + platformKey,
        body: 'You now have ' + (sourceMatches.length + 1) + ' artifacts from ' + platformKey + '. Having multiple sources from the same platform can help cross-reference accounts and verify details.',
        primary_view: 'board',
        artifact_ids: [newArtifact.id].concat(sourceMatches.slice(0, 4).map(function(a) { return a.id })),
        connection_ids: [],
        confidence: 0.5,
        expires_at: getExpiryDate(14),
      })
    }
  }

  // ── Check 4: Location/Spatial Proximity ──
  if (newArtifact.extracted_location) {
    var locationLower = newArtifact.extracted_location.toLowerCase()
    var locationMatches = existing.filter(function(a) {
      if (!a.extracted_location) return false
      // Simple string matching — check if location names share words
      var otherLower = a.extracted_location!.toLowerCase()
      var newWords = locationLower.split(/[\s,]+/).filter(function(w) { return w.length > 3 })
      return newWords.some(function(word) { return otherLower.includes(word) })
    })

    if (locationMatches.length > 0) {
      generatedInsights.push({
        user_id: userId,
        scope_type: 'artifact',
        scope_id: newArtifact.id,
        insight_type: 'spatial_cluster',
        title: 'Location overlap near ' + truncate(newArtifact.extracted_location, 30),
        body: locationMatches.length + ' other artifact' + (locationMatches.length > 1 ? 's' : '') + ' reference a similar location. Geographic clustering often reveals hotspots of activity worth mapping.',
        primary_view: 'map',
        artifact_ids: [newArtifact.id].concat(locationMatches.slice(0, 5).map(function(a) { return a.id })),
        connection_ids: [],
        confidence: Math.min(0.45 + locationMatches.length * 0.1, 0.85),
        expires_at: getExpiryDate(30),
      })
    }
  }

  // ── Check 5: Verdict Pattern (many skeptical or many compelling in same area) ──
  if (newArtifact.verdict) {
    var verdictMatches = existing.filter(function(a) {
      return a.verdict === newArtifact.verdict
    })

    if (verdictMatches.length >= 3) {
      var verdictLabel = newArtifact.verdict === 'compelling' ? 'compelling' :
                         newArtifact.verdict === 'skeptical' ? 'skeptical' :
                         newArtifact.verdict === 'inconclusive' ? 'inconclusive' : newArtifact.verdict
      generatedInsights.push({
        user_id: userId,
        scope_type: 'constellation',
        scope_id: null,
        insight_type: 'anomaly',
        title: 'Pattern: ' + (verdictMatches.length + 1) + ' artifacts marked "' + verdictLabel + '"',
        body: 'A significant portion of your research is rated "' + verdictLabel + '". This pattern might indicate a methodological trend or a genuine signal in the evidence you are collecting.',
        primary_view: 'board',
        artifact_ids: [newArtifact.id].concat(verdictMatches.slice(0, 4).map(function(a) { return a.id })),
        connection_ids: [],
        confidence: 0.45,
        expires_at: getExpiryDate(30),
      })
    }
  }

  // ── Insert generated insights ──
  if (generatedInsights.length > 0) {
    try {
      await supabase
        .from('constellation_ai_insights')
        .insert(generatedInsights.map(function(insight) {
          return {
            user_id: insight.user_id,
            scope_type: insight.scope_type,
            scope_id: insight.scope_id,
            insight_type: insight.insight_type,
            title: insight.title,
            body: insight.body,
            primary_view: insight.primary_view,
            artifact_ids: insight.artifact_ids,
            connection_ids: insight.connection_ids,
            confidence: insight.confidence,
            expires_at: insight.expires_at,
            dismissed: false,
            helpful: null,
          }
        }))
    } catch (err) {
      console.error('Failed to insert on-add insights:', err)
    }
  }

  return generatedInsights
}


// ── Deep Scan Analysis (Claude API) ──

/**
 * Run a comprehensive Claude-powered analysis of a user's full research hub.
 * Called by the weekly cron job or on-demand by the user.
 */
export async function runDeepScan(userId: string): Promise<InsightInput[]> {
  var supabase = createServerClient()
  var generatedInsights: InsightInput[] = []

  // Fetch all user data
  var artifactsResult = await supabase
    .from('constellation_artifacts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })

  var artifacts: ArtifactRow[] = (artifactsResult.data as any[]) || []

  if (artifacts.length < 3) return generatedInsights // Not enough data for deep analysis

  // Fetch connections
  var connectionsResult = await supabase
    .from('constellation_connections')
    .select('*')
    .eq('user_id', userId)

  var connections = connectionsResult.data || []

  // Fetch case files
  var caseFilesResult = await supabase
    .from('constellation_case_files')
    .select('*')
    .eq('user_id', userId)

  var caseFiles = caseFilesResult.data || []

  // Build a summary of the research hub for Claude
  var artifactSummaries = artifacts.slice(0, 50).map(function(a) {
    return {
      title: a.title,
      source_type: a.source_type,
      date: a.extracted_date || a.created_at,
      location: a.extracted_location || null,
      verdict: a.verdict,
      tags: a.tags || [],
    }
  })

  var caseFileSummaries = caseFiles.map(function(cf: any) {
    return {
      title: cf.title,
      description: cf.description,
    }
  })

  var connectionSummaries = connections.map(function(c: any) {
    var artifactA = artifacts.find(function(a) { return a.id === c.artifact_a_id })
    var artifactB = artifacts.find(function(a) { return a.id === c.artifact_b_id })
    return {
      type: c.relationship_type,
      annotation: c.annotation,
      artifact_a: artifactA ? artifactA.title : 'Unknown',
      artifact_b: artifactB ? artifactB.title : 'Unknown',
    }
  })

  var prompt = 'Analyze this researcher\'s evidence collection for a paranormal research platform. They have ' + artifacts.length + ' artifacts, ' + caseFiles.length + ' case files, and ' + connections.length + ' connections.\n\n'
  prompt += 'ARTIFACTS:\n' + JSON.stringify(artifactSummaries, null, 2) + '\n\n'
  if (caseFileSummaries.length > 0) {
    prompt += 'CASE FILES:\n' + JSON.stringify(caseFileSummaries, null, 2) + '\n\n'
  }
  if (connectionSummaries.length > 0) {
    prompt += 'CONNECTIONS:\n' + JSON.stringify(connectionSummaries, null, 2) + '\n\n'
  }
  prompt += 'Identify 2-4 non-obvious insights. For each, provide:\n'
  prompt += '1. insight_type: one of "temporal_pattern", "spatial_cluster", "cross_case_pattern", "anomaly", "suggestion"\n'
  prompt += '2. title: short, engaging title (max 60 chars)\n'
  prompt += '3. body: 1-2 sentence explanation of the pattern and why it matters\n'
  prompt += '4. primary_view: which view best displays this ("board", "timeline", "map", "constellation")\n'
  prompt += '5. confidence: 0.0-1.0 how confident you are\n'
  prompt += '6. referenced_artifact_titles: list of artifact titles this insight references\n\n'
  prompt += 'Return ONLY a JSON array of insight objects. No markdown, no explanation.'

  try {
    var response = await anthropic.messages.create({
      model: DEEP_SCAN_MODEL,
      max_tokens: DEEP_SCAN_MAX_TOKENS,
      system: 'You are a research analyst for Paradocs, a paranormal evidence platform. You find non-obvious patterns in user research collections. Be specific and evidence-based. Never fabricate connections that are not supported by the data. Return valid JSON only.',
      messages: [{ role: 'user', content: prompt }],
    })

    var responseText = ''
    response.content.forEach(function(block) {
      if (block.type === 'text') {
        responseText += block.text
      }
    })

    // Parse JSON response
    var cleanedText = responseText.trim()
    // Strip potential markdown code fences
    if (cleanedText.startsWith('```')) {
      cleanedText = cleanedText.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    }

    var parsedInsights: any[] = JSON.parse(cleanedText)

    // Map Claude's output to our insight format
    parsedInsights.forEach(function(parsed) {
      // Resolve artifact titles to IDs
      var referencedIds: string[] = []
      if (parsed.referenced_artifact_titles && Array.isArray(parsed.referenced_artifact_titles)) {
        parsed.referenced_artifact_titles.forEach(function(refTitle: string) {
          var match = artifacts.find(function(a) {
            return a.title.toLowerCase().includes(refTitle.toLowerCase()) ||
                   refTitle.toLowerCase().includes(a.title.toLowerCase())
          })
          if (match) referencedIds.push(match.id)
        })
      }

      generatedInsights.push({
        user_id: userId,
        scope_type: 'constellation',
        scope_id: null,
        insight_type: parsed.insight_type || 'suggestion',
        title: truncate(parsed.title || 'AI Insight', 80),
        body: truncate(parsed.body || '', 500),
        primary_view: parsed.primary_view || 'board',
        artifact_ids: referencedIds,
        connection_ids: [],
        confidence: Math.max(0.1, Math.min(1.0, parsed.confidence || 0.5)),
        expires_at: getExpiryDate(30),
      })
    })
  } catch (err) {
    console.error('Deep scan Claude API error:', err)
    // Return empty — don't crash on AI failure
  }

  // Insert generated insights
  if (generatedInsights.length > 0) {
    try {
      await supabase
        .from('constellation_ai_insights')
        .insert(generatedInsights.map(function(insight) {
          return {
            user_id: insight.user_id,
            scope_type: insight.scope_type,
            scope_id: insight.scope_id,
            insight_type: insight.insight_type,
            title: insight.title,
            body: insight.body,
            primary_view: insight.primary_view,
            artifact_ids: insight.artifact_ids,
            connection_ids: insight.connection_ids,
            confidence: insight.confidence,
            expires_at: insight.expires_at,
            dismissed: false,
            helpful: null,
          }
        }))
    } catch (err) {
      console.error('Failed to insert deep scan insights:', err)
    }
  }

  return generatedInsights
}


// ── Community Pattern Detection ──

/**
 * Detect community-wide patterns from the external URL signals table.
 * Finds URLs saved by multiple users and generates community convergence insights.
 */
export async function detectCommunityPatterns(userId: string): Promise<InsightInput[]> {
  var supabase = createServerClient()
  var generatedInsights: InsightInput[] = []

  try {
    // Find trending external URLs (saved by 3+ users)
    var signalsResult = await supabase
      .from('constellation_external_url_signals')
      .select('*')
      .gte('save_count', 3)
      .order('save_count', { ascending: false })
      .limit(10)

    var trendingUrls = (signalsResult.data as any[]) || []

    if (trendingUrls.length === 0) return generatedInsights

    // Check which of these URLs the current user has saved
    var userArtifactsResult = await supabase
      .from('constellation_artifacts')
      .select('id, external_url, title, external_url_hash')
      .eq('user_id', userId)
      .not('external_url', 'is', null)

    var userArtifacts = (userArtifactsResult.data as any[]) || []
    var userUrlHashes = new Set(userArtifacts.map(function(a) { return a.external_url_hash }).filter(Boolean))

    trendingUrls.forEach(function(signal) {
      if (userUrlHashes.has(signal.url_hash)) {
        // User has this URL — tell them it's popular
        var matchingArtifact = userArtifacts.find(function(a) {
          return a.external_url_hash === signal.url_hash
        })

        if (matchingArtifact) {
          generatedInsights.push({
            user_id: userId,
            scope_type: 'artifact',
            scope_id: matchingArtifact.id,
            insight_type: 'community_convergence',
            title: signal.save_count + ' researchers also saved this',
            body: '"' + truncate(signal.title || matchingArtifact.title, 40) + '" has been saved by ' + signal.save_count + ' other researchers on Paradocs. This convergence suggests it is a significant piece of evidence in the community.',
            primary_view: 'board',
            artifact_ids: [matchingArtifact.id],
            connection_ids: [],
            confidence: Math.min(0.5 + signal.save_count * 0.05, 0.95),
            expires_at: getExpiryDate(14),
          })
        }
      }
    })

    // Insert insights
    if (generatedInsights.length > 0) {
      // Avoid duplicate community insights — check for existing ones
      var existingResult = await supabase
        .from('constellation_ai_insights')
        .select('artifact_ids')
        .eq('user_id', userId)
        .eq('insight_type', 'community_convergence')
        .eq('dismissed', false)

      var existingArtifactIds = new Set<string>()
      if (existingResult.data) {
        existingResult.data.forEach(function(row: any) {
          if (row.artifact_ids) {
            row.artifact_ids.forEach(function(id: string) { existingArtifactIds.add(id) })
          }
        })
      }

      // Filter out insights for artifacts that already have community insights
      var newInsights = generatedInsights.filter(function(insight) {
        return !insight.artifact_ids.some(function(id) { return existingArtifactIds.has(id) })
      })

      if (newInsights.length > 0) {
        await supabase
          .from('constellation_ai_insights')
          .insert(newInsights.map(function(insight) {
            return {
              user_id: insight.user_id,
              scope_type: insight.scope_type,
              scope_id: insight.scope_id,
              insight_type: insight.insight_type,
              title: insight.title,
              body: insight.body,
              primary_view: insight.primary_view,
              artifact_ids: insight.artifact_ids,
              connection_ids: insight.connection_ids,
              confidence: insight.confidence,
              expires_at: insight.expires_at,
              dismissed: false,
              helpful: null,
            }
          }))
      }
    }
  } catch (err) {
    console.error('Community pattern detection error:', err)
  }

  return generatedInsights
}


// ── Helpers ──

function truncate(str: string, maxLen: number): string {
  if (str.length <= maxLen) return str
  return str.slice(0, maxLen - 1) + '\u2026'
}

function getExpiryDate(days: number): string {
  var date = new Date()
  date.setDate(date.getDate() + days)
  return date.toISOString()
}
