/**
 * AI Pattern Detection Service
 *
 * Detects emergent patterns across reports using a combination of:
 * - Geographic clustering (reports within X miles describing similar phenomena)
 * - Temporal correlation (spikes in category/region during date ranges)
 * - Phenomena similarity (cross-decade/location descriptions matching)
 *
 * Uses vector embeddings for similarity + database queries for geographic/temporal.
 * Calls Claude to generate human-readable pattern descriptions.
 *
 * Session 15: AI Experience & Intelligence
 */

import { createServerClient } from '../supabase'

var ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001'

export interface DetectedAIPattern {
  type: 'geographic_cluster' | 'temporal_spike' | 'phenomena_similarity' | 'cross_category'
  title: string
  description: string
  confidence: number  // 0-1
  report_ids: string[]
  report_count: number
  metadata: {
    category?: string
    location?: string
    date_range?: { start: string; end: string }
    center_lat?: number
    center_lng?: number
    radius_miles?: number
    similar_descriptions?: string[]
    [key: string]: any
  }
}

/**
 * Detect geographic clusters: groups of reports within a radius
 * that share similar phenomena descriptions.
 */
export async function detectGeographicClusters(options?: {
  category?: string
  radiusMiles?: number
  minClusterSize?: number
}): Promise<DetectedAIPattern[]> {
  var supabase = createServerClient()
  var radius = options?.radiusMiles || 50
  var minSize = options?.minClusterSize || 3
  var radiusKm = radius * 1.60934

  // Query reports with coordinates, grouped by proximity
  // Using a simplified grid-based approach (0.5 degree cells ~35 miles)
  var query = supabase
    .from('reports')
    .select('id, title, category, location, latitude, longitude, event_date, description, slug, credibility')
    .eq('status', 'approved')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)

  if (options?.category) {
    query = query.eq('category', options.category)
  }

  var { data: reports, error } = await query.limit(2000)
  if (error || !reports || reports.length === 0) return []

  // Grid-based clustering (simple but effective for current scale)
  var gridSize = 0.5 // degrees (~35 miles)
  var grid: Record<string, typeof reports> = {}

  for (var i = 0; i < reports.length; i++) {
    var r = reports[i]
    if (!r.latitude || !r.longitude) continue
    var cellKey = Math.floor(r.latitude / gridSize) + ',' + Math.floor(r.longitude / gridSize)
    if (!grid[cellKey]) grid[cellKey] = []
    grid[cellKey].push(r)
  }

  var patterns: DetectedAIPattern[] = []

  // Find cells with enough reports
  var cellKeys = Object.keys(grid)
  for (var c = 0; c < cellKeys.length; c++) {
    var cellReports = grid[cellKeys[c]]
    if (cellReports.length < minSize) continue

    // Compute center
    var sumLat = 0, sumLng = 0
    for (var j = 0; j < cellReports.length; j++) {
      sumLat += cellReports[j].latitude!
      sumLng += cellReports[j].longitude!
    }
    var centerLat = sumLat / cellReports.length
    var centerLng = sumLng / cellReports.length

    // Get dominant category
    var catCounts: Record<string, number> = {}
    for (var k = 0; k < cellReports.length; k++) {
      var cat = cellReports[k].category || 'unknown'
      catCounts[cat] = (catCounts[cat] || 0) + 1
    }
    var dominantCat = Object.keys(catCounts).sort(function(a, b) { return catCounts[b] - catCounts[a] })[0]

    // Get location name from first report
    var locationName = cellReports[0].location || 'Unknown area'

    // Get date range
    var dates = cellReports
      .filter(function(r) { return r.event_date })
      .map(function(r) { return r.event_date! })
      .sort()

    patterns.push({
      type: 'geographic_cluster',
      title: cellReports.length + ' reports near ' + locationName,
      description: cellReports.length + ' ' + dominantCat + ' reports within approximately ' + radius + ' miles of ' + locationName + '.',
      confidence: Math.min(0.5 + cellReports.length * 0.05, 0.95),
      report_ids: cellReports.map(function(r) { return r.id }),
      report_count: cellReports.length,
      metadata: {
        category: dominantCat,
        location: locationName,
        center_lat: centerLat,
        center_lng: centerLng,
        radius_miles: radius,
        date_range: dates.length > 0 ? { start: dates[0], end: dates[dates.length - 1] } : undefined
      }
    })
  }

  // Sort by report count (most interesting first)
  patterns.sort(function(a, b) { return b.report_count - a.report_count })

  return patterns.slice(0, 20) // Top 20
}

/**
 * Detect temporal spikes: unusual concentrations of reports in specific time periods.
 */
export async function detectTemporalSpikes(options?: {
  category?: string
  region?: string
}): Promise<DetectedAIPattern[]> {
  var supabase = createServerClient()

  // Get report counts by month
  var query = supabase
    .from('reports')
    .select('id, title, category, location, event_date, slug')
    .eq('status', 'approved')
    .not('event_date', 'is', null)
    .order('event_date', { ascending: true })

  if (options?.category) query = query.eq('category', options.category)
  if (options?.region) query = query.ilike('location', '%' + options.region + '%')

  var { data: reports, error } = await query.limit(5000)
  if (error || !reports || reports.length === 0) return []

  // Group by year-month
  var monthly: Record<string, typeof reports> = {}
  for (var i = 0; i < reports.length; i++) {
    var date = reports[i].event_date
    if (!date) continue
    var yearMonth = date.substring(0, 7) // YYYY-MM
    if (!monthly[yearMonth]) monthly[yearMonth] = []
    monthly[yearMonth].push(reports[i])
  }

  // Group by year for annual comparison
  var yearly: Record<string, number> = {}
  var months = Object.keys(monthly)
  for (var m = 0; m < months.length; m++) {
    var year = months[m].substring(0, 4)
    yearly[year] = (yearly[year] || 0) + monthly[months[m]].length
  }

  // Calculate mean and stddev for monthly counts
  var counts = months.map(function(m) { return monthly[m].length })
  if (counts.length < 3) return []

  var mean = counts.reduce(function(a, b) { return a + b }, 0) / counts.length
  var variance = counts.reduce(function(a, b) { return a + (b - mean) * (b - mean) }, 0) / counts.length
  var stddev = Math.sqrt(variance)

  if (stddev === 0) return []

  // Find months with z-score > 2 (significant spikes)
  var patterns: DetectedAIPattern[] = []

  for (var mi = 0; mi < months.length; mi++) {
    var monthKey = months[mi]
    var monthReports = monthly[monthKey]
    var zScore = (monthReports.length - mean) / stddev

    if (zScore > 2 && monthReports.length >= 5) {
      var catCounts: Record<string, number> = {}
      for (var ri = 0; ri < monthReports.length; ri++) {
        var cat = monthReports[ri].category || 'unknown'
        catCounts[cat] = (catCounts[cat] || 0) + 1
      }
      var topCat = Object.keys(catCounts).sort(function(a, b) { return catCounts[b] - catCounts[a] })[0]

      var dateObj = new Date(monthKey + '-01')
      var monthName = dateObj.toLocaleString('en-US', { month: 'long', year: 'numeric' })

      patterns.push({
        type: 'temporal_spike',
        title: 'Spike in ' + topCat + ' reports: ' + monthName,
        description: monthReports.length + ' reports recorded in ' + monthName + ' (' + zScore.toFixed(1) + 'x above average). Primarily ' + topCat + ' reports.',
        confidence: Math.min(0.5 + zScore * 0.1, 0.95),
        report_ids: monthReports.map(function(r) { return r.id }),
        report_count: monthReports.length,
        metadata: {
          category: topCat,
          date_range: { start: monthKey + '-01', end: monthKey + '-28' },
          z_score: zScore,
          average_monthly: Math.round(mean * 10) / 10
        }
      })
    }
  }

  patterns.sort(function(a, b) { return b.confidence - a.confidence })
  return patterns.slice(0, 10)
}

/**
 * Detect phenomena similarity: reports from different times/places
 * describing similar physical characteristics, using vector similarity.
 */
export async function detectPhenomenaSimilarity(options?: {
  category?: string
  minSimilarity?: number
}): Promise<DetectedAIPattern[]> {
  var supabase = createServerClient()
  var minSim = options?.minSimilarity || 0.8

  // Get reports with embeddings, grouped by category
  var query = supabase
    .from('vector_chunks')
    .select('source_id, chunk_text, metadata, embedding')
    .eq('source_table', 'report')
    .eq('chunk_index', 0) // Use first chunk (title + summary) for comparison

  if (options?.category) {
    query = query.contains('metadata', { category: options.category })
  }

  var { data: chunks, error } = await query.limit(500)
  if (error || !chunks || chunks.length < 2) return []

  // For each pair of chunks, find high-similarity pairs from different locations/times
  // This is O(n^2) but with 500 max items it's manageable
  var patterns: DetectedAIPattern[] = []
  var seen: Record<string, boolean> = {}

  for (var i = 0; i < Math.min(chunks.length, 100); i++) {
    var chunkA = chunks[i]
    var metaA = chunkA.metadata as any

    // Use the search_vectors RPC to find similar reports
    if (!chunkA.embedding) continue

    var { data: similar } = await supabase.rpc('search_vectors', {
      query_embedding: chunkA.embedding,
      match_count: 5,
      similarity_threshold: minSim,
      filter_source_table: 'report',
      filter_metadata: null
    })

    if (!similar || similar.length < 2) continue

    // Filter out self-matches and same-location matches
    var crossMatches = similar.filter(function(s: any) {
      return s.source_id !== chunkA.source_id
    })

    if (crossMatches.length === 0) continue

    // Check if we already have this group
    var groupKey = [chunkA.source_id].concat(crossMatches.map(function(m: any) { return m.source_id })).sort().join(',')
    if (seen[groupKey]) continue
    seen[groupKey] = true

    var allIds = [chunkA.source_id].concat(crossMatches.map(function(m: any) { return m.source_id }))
    var avgSim = crossMatches.reduce(function(sum: number, m: any) { return sum + m.similarity }, 0) / crossMatches.length

    patterns.push({
      type: 'phenomena_similarity',
      title: 'Similar descriptions across ' + allIds.length + ' reports',
      description: allIds.length + ' reports share remarkably similar descriptions (avg ' + Math.round(avgSim * 100) + '% match). ' +
        (metaA.category ? 'Category: ' + metaA.category + '.' : ''),
      confidence: avgSim,
      report_ids: allIds,
      report_count: allIds.length,
      metadata: {
        category: metaA.category,
        average_similarity: avgSim,
        similar_descriptions: crossMatches.map(function(m: any) { return m.chunk_text.substring(0, 200) })
      }
    })

    // Limit to avoid excessive API calls
    if (patterns.length >= 10) break
  }

  patterns.sort(function(a, b) { return b.confidence - a.confidence })
  return patterns
}

/**
 * Run all pattern detectors and return combined results.
 */
export async function detectAllPatterns(options?: {
  category?: string
}): Promise<{
  geographic: DetectedAIPattern[]
  temporal: DetectedAIPattern[]
  similarity: DetectedAIPattern[]
  total: number
}> {
  var geographic = await detectGeographicClusters({ category: options?.category })
  var temporal = await detectTemporalSpikes({ category: options?.category })
  var similarity = await detectPhenomenaSimilarity({ category: options?.category })

  return {
    geographic: geographic,
    temporal: temporal,
    similarity: similarity,
    total: geographic.length + temporal.length + similarity.length
  }
}

/**
 * Generate AI narrative for a detected pattern using Claude.
 */
export async function generatePatternNarrative(pattern: DetectedAIPattern): Promise<string> {
  var apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return pattern.description

  var supabase = createServerClient()

  // Fetch a few report details for context
  var { data: reports } = await supabase
    .from('reports')
    .select('title, location, event_date, category, summary')
    .in('id', pattern.report_ids.slice(0, 5))

  var reportContext = (reports || []).map(function(r) {
    return '- "' + r.title + '" (' + (r.location || 'unknown') + ', ' + (r.event_date || 'unknown date') + '): ' + (r.summary || '').substring(0, 200)
  }).join('\n')

  var prompt = 'You are the Paradocs AI analyzing patterns in paranormal report data. Generate a brief, engaging 2-3 sentence description of this pattern. Be specific about what makes it interesting. DO NOT fabricate details - only reference what is provided.\n\n'
  prompt += 'Pattern type: ' + pattern.type + '\n'
  prompt += 'Reports involved: ' + pattern.report_count + '\n'
  prompt += 'Metadata: ' + JSON.stringify(pattern.metadata) + '\n\n'
  prompt += 'Sample reports:\n' + reportContext

  try {
    var resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: ANTHROPIC_MODEL,
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    })

    if (resp.ok) {
      var data = await resp.json()
      return (data.content && data.content[0]) ? data.content[0].text : pattern.description
    }
  } catch (e) {
    console.error('Pattern narrative generation failed:', e)
  }

  return pattern.description
}

/**
 * Generate and cache featured patterns for homepage display.
 * Returns 2-3 interesting pattern discoveries.
 */
export async function generateFeaturedPatterns(): Promise<DetectedAIPattern[]> {
  var supabase = createServerClient()

  // Check cache first
  var { data: cached } = await supabase
    .from('ai_featured_patterns')
    .select('*')
    .eq('is_active', true)
    .gt('expires_at', new Date().toISOString())
    .order('relevance_score', { ascending: false })
    .limit(3)

  if (cached && cached.length >= 2) {
    return cached.map(function(c) {
      return {
        type: c.pattern_type as any,
        title: c.title,
        description: c.description,
        confidence: c.relevance_score,
        report_ids: c.report_ids || [],
        report_count: (c.report_ids || []).length,
        metadata: c.supporting_data || {}
      }
    })
  }

  // Generate fresh patterns
  var allPatterns = await detectAllPatterns()
  var combined: DetectedAIPattern[] = []
    .concat(allPatterns.geographic.slice(0, 3))
    .concat(allPatterns.temporal.slice(0, 3))
    .concat(allPatterns.similarity.slice(0, 3))

  // Sort by confidence and take top 3
  combined.sort(function(a, b) { return b.confidence - a.confidence })
  var featured = combined.slice(0, 3)

  // Generate narratives for each
  for (var i = 0; i < featured.length; i++) {
    featured[i].description = await generatePatternNarrative(featured[i])
  }

  // Cache results
  // First deactivate old ones
  await supabase.from('ai_featured_patterns').update({ is_active: false }).eq('is_active', true)

  // Insert new ones
  for (var j = 0; j < featured.length; j++) {
    await supabase.from('ai_featured_patterns').insert({
      pattern_type: featured[j].type,
      title: featured[j].title,
      description: featured[j].description,
      supporting_data: featured[j].metadata,
      report_ids: featured[j].report_ids,
      relevance_score: featured[j].confidence,
      is_active: true,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    })
  }

  return featured
}
