/**
 * Pattern Analysis Service
 *
 * Detects emergent patterns in paranormal report data including:
 * - Geographic clusters (using PostGIS DBSCAN)
 * - Temporal anomalies (z-score analysis)
 * - Characteristic correlations (chi-square analysis)
 * - Seasonal patterns
 */

import { createServerClient } from '../supabase'

// Types for pattern detection
export type PatternType =
  | 'geographic_cluster'
  | 'temporal_anomaly'
  | 'flap_wave'
  | 'characteristic_correlation'
  | 'regional_concentration'
  | 'seasonal_pattern'
  | 'time_of_day_pattern'
  | 'date_correlation'

export type PatternStatus = 'active' | 'historical' | 'emerging' | 'declining'

export interface GeographicCluster {
  cluster_id: number
  report_ids: string[]
  center_lat: number
  center_lng: number
  report_count: number
  density: number
  categories: string[]
  phenomenon_types: string[]
  first_date: string
  last_date: string
}

export interface DetectedPattern {
  id?: string
  pattern_type: PatternType
  status: PatternStatus
  confidence_score: number
  significance_score: number
  report_count: number
  center_point?: { lat: number; lng: number }
  radius_km?: number
  metadata: Record<string, unknown>
  ai_title?: string
  ai_summary?: string
  categories: string[]
}

export interface AnalysisRunResult {
  run_id: string
  patterns_detected: number
  patterns_updated: number
  patterns_archived: number
  reports_analyzed: number
  duration_ms: number
}

// Z-score threshold for temporal anomalies
const ZSCORE_THRESHOLD = 2.5

// Minimum cluster size
const MIN_CLUSTER_SIZE = 5

// Default clustering radius in km
const DEFAULT_EPS_KM = 50

/**
 * Main entry point for pattern analysis
 */
export async function runPatternAnalysis(
  runType: 'full' | 'incremental' = 'full'
): Promise<AnalysisRunResult> {
  const supabase = createServerClient()
  const startTime = Date.now()

  // Create analysis run record
  const { data: runData, error: runError } = await supabase
    .from('pattern_analysis_runs')
    .insert({
      run_type: runType,
      status: 'running',
      metadata: { started_by: 'system' }
    })
    .select('id')
    .single()

  if (runError || !runData) {
    throw new Error(`Failed to create analysis run: ${runError?.message}`)
  }

  const runId = runData.id

  try {
    // Get total reports count
    const { count: reportsCount } = await supabase
      .from('reports')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'approved')

    let patternsDetected = 0
    let patternsUpdated = 0
    let patternsArchived = 0

    // 1. Detect geographic clusters
    const geoResult = await detectGeographicClusters()
    patternsDetected += geoResult.newPatterns
    patternsUpdated += geoResult.updatedPatterns

    // 2. Detect temporal anomalies
    const temporalResult = await detectTemporalAnomalies()
    patternsDetected += temporalResult.newPatterns
    patternsUpdated += temporalResult.updatedPatterns

    // 3. Analyze seasonal patterns
    const seasonalResult = await analyzeSeasonalPatterns()
    patternsDetected += seasonalResult.newPatterns
    patternsUpdated += seasonalResult.updatedPatterns

    // 4. Archive stale patterns
    patternsArchived = await archiveStalePatterns()

    // Update run record with results
    await supabase
      .from('pattern_analysis_runs')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
        reports_analyzed: reportsCount || 0,
        patterns_detected: patternsDetected,
        patterns_updated: patternsUpdated,
        patterns_archived: patternsArchived
      })
      .eq('id', runId)

    return {
      run_id: runId,
      patterns_detected: patternsDetected,
      patterns_updated: patternsUpdated,
      patterns_archived: patternsArchived,
      reports_analyzed: reportsCount || 0,
      duration_ms: Date.now() - startTime
    }
  } catch (error) {
    // Log error and update run status
    await supabase
      .from('pattern_analysis_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error',
        error_stack: error instanceof Error ? error.stack : undefined
      })
      .eq('id', runId)

    throw error
  }
}

/**
 * Detect geographic clusters using PostGIS DBSCAN
 */
async function detectGeographicClusters(
  epsKm: number = DEFAULT_EPS_KM,
  minPoints: number = MIN_CLUSTER_SIZE
): Promise<{ newPatterns: number; updatedPatterns: number }> {
  const supabase = createServerClient()

  // Call the PostGIS clustering function
  const { data: clusters, error } = await supabase
    .rpc('detect_geographic_clusters', {
      p_eps_km: epsKm,
      p_min_points: minPoints,
      p_days_back: 365
    })

  if (error) {
    console.error('Geographic clustering error:', error)
    return { newPatterns: 0, updatedPatterns: 0 }
  }

  let newPatterns = 0
  let updatedPatterns = 0

  for (const cluster of clusters as GeographicCluster[]) {
    // Check if a similar pattern already exists
    const existingPattern = await findExistingGeographicPattern(
      cluster.center_lat,
      cluster.center_lng,
      epsKm / 2 // Half the clustering distance for matching
    )

    const patternData: Partial<DetectedPattern> = {
      pattern_type: 'geographic_cluster',
      status: determinePatternStatus(cluster),
      confidence_score: calculateClusterConfidence(cluster),
      significance_score: calculateClusterSignificance(cluster),
      report_count: cluster.report_count,
      center_point: { lat: cluster.center_lat, lng: cluster.center_lng },
      radius_km: epsKm,
      metadata: {
        cluster_id: cluster.cluster_id,
        density: cluster.density,
        first_date: cluster.first_date,
        last_date: cluster.last_date,
        phenomenon_types: cluster.phenomenon_types
      },
      categories: cluster.categories
    }

    if (existingPattern) {
      // Update existing pattern
      await supabase
        .from('detected_patterns')
        .update({
          ...patternData,
          last_updated_at: new Date().toISOString()
        })
        .eq('id', existingPattern.id)

      // Update pattern-report links
      await updatePatternReports(existingPattern.id, cluster.report_ids)
      updatedPatterns++
    } else {
      // Create new pattern
      const { data: newPattern } = await supabase
        .from('detected_patterns')
        .insert({
          ...patternData,
          center_point: `POINT(${cluster.center_lng} ${cluster.center_lat})`
        })
        .select('id')
        .single()

      if (newPattern) {
        await updatePatternReports(newPattern.id, cluster.report_ids)
        newPatterns++
      }
    }
  }

  return { newPatterns, updatedPatterns }
}

/**
 * Detect temporal anomalies using z-score analysis
 */
async function detectTemporalAnomalies(): Promise<{ newPatterns: number; updatedPatterns: number }> {
  const supabase = createServerClient()

  // Get weekly report counts
  const { data: weeklyCounts, error } = await supabase
    .rpc('get_weekly_report_counts', {
      p_weeks_back: 52
    })

  if (error || !weeklyCounts) {
    console.error('Temporal analysis error:', error)
    return { newPatterns: 0, updatedPatterns: 0 }
  }

  // Calculate z-scores for each week
  const counts = weeklyCounts.map((w: { report_count: number }) => w.report_count)
  const mean = counts.reduce((a: number, b: number) => a + b, 0) / counts.length
  const stdDev = Math.sqrt(
    counts.reduce((sq: number, n: number) => sq + Math.pow(n - mean, 2), 0) / counts.length
  )

  let newPatterns = 0
  let updatedPatterns = 0

  // Find anomalous weeks
  for (const week of weeklyCounts as Array<{ week_start: string; report_count: number; categories: Record<string, number> }>) {
    const zScore = stdDev > 0 ? (week.report_count - mean) / stdDev : 0

    if (Math.abs(zScore) >= ZSCORE_THRESHOLD) {
      const isSpike = zScore > 0

      // Check for existing temporal pattern in this time range
      const { data: existing } = await supabase
        .from('detected_patterns')
        .select('id')
        .eq('pattern_type', 'temporal_anomaly')
        .gte('pattern_start_date', week.week_start)
        .lte('pattern_end_date', week.week_start)
        .single()

      const patternData = {
        pattern_type: 'temporal_anomaly' as PatternType,
        status: 'active' as PatternStatus,
        confidence_score: Math.min(Math.abs(zScore) / 5, 1), // Normalize to 0-1
        significance_score: Math.min(week.report_count / 100, 1),
        report_count: week.report_count,
        pattern_start_date: week.week_start,
        pattern_end_date: week.week_start,
        metadata: {
          z_score: zScore,
          is_spike: isSpike,
          mean_baseline: mean,
          std_deviation: stdDev,
          categories: week.categories
        }
      }

      if (existing) {
        await supabase
          .from('detected_patterns')
          .update(patternData)
          .eq('id', existing.id)
        updatedPatterns++
      } else {
        await supabase.from('detected_patterns').insert(patternData)
        newPatterns++
      }
    }
  }

  return { newPatterns, updatedPatterns }
}

/**
 * Analyze seasonal patterns
 */
async function analyzeSeasonalPatterns(): Promise<{ newPatterns: number; updatedPatterns: number }> {
  const supabase = createServerClient()

  const { data: seasonalData, error } = await supabase
    .rpc('analyze_seasonal_patterns')

  if (error || !seasonalData) {
    console.error('Seasonal analysis error:', error)
    return { newPatterns: 0, updatedPatterns: 0 }
  }

  // Find months with significant deviation (seasonal_index > 1.5 or < 0.5)
  const significantMonths = (seasonalData as Array<{ month: number; report_count: number; seasonal_index: number; top_phenomenon_type: string }>)
    .filter(m => m.seasonal_index > 1.5 || m.seasonal_index < 0.5)

  let newPatterns = 0
  let updatedPatterns = 0

  for (const month of significantMonths) {
    const monthName = new Date(2024, month.month - 1, 1).toLocaleString('en-US', { month: 'long' })
    const isPeak = month.seasonal_index > 1

    // Check for existing seasonal pattern for this month
    const { data: existing } = await supabase
      .from('detected_patterns')
      .select('id')
      .eq('pattern_type', 'seasonal_pattern')
      .contains('metadata', { month: month.month })
      .single()

    const patternData = {
      pattern_type: 'seasonal_pattern' as PatternType,
      status: 'active' as PatternStatus,
      confidence_score: 0.8, // Seasonal patterns are generally reliable
      significance_score: Math.abs(month.seasonal_index - 1) / 2,
      report_count: month.report_count,
      metadata: {
        month: month.month,
        month_name: monthName,
        seasonal_index: month.seasonal_index,
        is_peak: isPeak,
        top_phenomenon_type: month.top_phenomenon_type
      }
    }

    if (existing) {
      await supabase
        .from('detected_patterns')
        .update(patternData)
        .eq('id', existing.id)
      updatedPatterns++
    } else {
      await supabase.from('detected_patterns').insert(patternData)
      newPatterns++
    }
  }

  return { newPatterns, updatedPatterns }
}

/**
 * Archive patterns that haven't been updated recently
 */
async function archiveStalePatterns(): Promise<number> {
  const supabase = createServerClient()

  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data } = await supabase
    .from('detected_patterns')
    .update({ status: 'historical' })
    .eq('status', 'active')
    .lt('last_updated_at', thirtyDaysAgo.toISOString())
    .select('id')

  return data?.length || 0
}

// Helper functions

async function findExistingGeographicPattern(
  lat: number,
  lng: number,
  radiusKm: number
): Promise<{ id: string } | null> {
  const supabase = createServerClient()

  const { data } = await supabase
    .rpc('find_nearby_patterns', {
      p_point: `POINT(${lng} ${lat})`,
      p_radius_km: radiusKm,
      p_limit: 1
    })

  if (data && data.length > 0) {
    return { id: data[0].pattern_id }
  }
  return null
}

async function updatePatternReports(patternId: string, reportIds: string[]): Promise<void> {
  const supabase = createServerClient()

  // Remove old links
  await supabase
    .from('pattern_reports')
    .delete()
    .eq('pattern_id', patternId)

  // Add new links
  const links = reportIds.map(reportId => ({
    pattern_id: patternId,
    report_id: reportId,
    relevance_score: 1.0
  }))

  await supabase.from('pattern_reports').insert(links)
}

function determinePatternStatus(cluster: GeographicCluster): PatternStatus {
  const lastDate = new Date(cluster.last_date)
  const daysSinceLastReport = (Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24)

  if (daysSinceLastReport < 7) return 'emerging'
  if (daysSinceLastReport < 30) return 'active'
  if (daysSinceLastReport < 90) return 'declining'
  return 'historical'
}

function calculateClusterConfidence(cluster: GeographicCluster): number {
  // Based on report count, density, and time span
  const countScore = Math.min(cluster.report_count / 20, 1)
  const densityScore = Math.min(cluster.density / 10, 1)

  return (countScore * 0.6 + densityScore * 0.4)
}

function calculateClusterSignificance(cluster: GeographicCluster): number {
  // Based on report count and category diversity
  const countScore = Math.min(cluster.report_count / 50, 1)
  const diversityScore = Math.min(cluster.categories.length / 5, 1)

  return (countScore * 0.7 + diversityScore * 0.3)
}

/**
 * Get trending patterns for display
 */
export async function getTrendingPatterns(limit: number = 5): Promise<DetectedPattern[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .from('detected_patterns')
    .select('*')
    .in('status', ['active', 'emerging'])
    .order('significance_score', { ascending: false })
    .order('last_updated_at', { ascending: false })
    .limit(limit)

  if (error) {
    console.error('Error fetching trending patterns:', error)
    return []
  }

  return data || []
}

/**
 * Get patterns near a location
 */
export async function getNearbyPatterns(
  lat: number,
  lng: number,
  radiusKm: number = 100
): Promise<DetectedPattern[]> {
  const supabase = createServerClient()

  const { data, error } = await supabase
    .rpc('find_nearby_patterns', {
      p_point: `POINT(${lng} ${lat})`,
      p_radius_km: radiusKm,
      p_limit: 10
    })

  if (error) {
    console.error('Error fetching nearby patterns:', error)
    return []
  }

  return data || []
}
