/**
 * Pattern Analysis Service V2
 *
 * Optimized for large datasets (270K+ reports):
 * - Processes by category to avoid timeouts
 * - Uses simpler, faster analysis methods
 * - Supports incremental updates
 * - Better error handling and progress tracking
 */

import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Minimum thresholds for pattern detection
const MIN_REPORTS_FOR_PATTERN = 10
const MIN_WEEKS_FOR_BASELINE = 4

/**
 * Get the baseline start date from system settings
 * Pattern detection only considers data created after this date
 */
async function getBaselineStartDate(): Promise<Date> {
  const { data } = await supabaseAdmin
    .from('system_settings')
    .select('value')
    .eq('key', 'pattern_baseline_start_date')
    .single()

  if (data?.value) {
    return new Date(data.value)
  }

  // Default: 90 days ago if no setting exists
  const defaultDate = new Date()
  defaultDate.setDate(defaultDate.getDate() - 90)
  return defaultDate
}

/**
 * Check if we have enough data for meaningful pattern detection
 */
async function hasEnoughDataForPatterns(baselineStart: Date): Promise<boolean> {
  const { count } = await supabaseAdmin
    .from('reports')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'approved')
    .gte('created_at', baselineStart.toISOString())

  const weeksSinceStart = Math.floor(
    (Date.now() - baselineStart.getTime()) / (7 * 24 * 60 * 60 * 1000)
  )

  const hasEnoughReports = (count || 0) >= MIN_REPORTS_FOR_PATTERN
  const hasEnoughTime = weeksSinceStart >= MIN_WEEKS_FOR_BASELINE

  if (!hasEnoughReports || !hasEnoughTime) {
    console.log(`[Pattern Analysis] Insufficient data: ${count} reports, ${weeksSinceStart} weeks (need ${MIN_REPORTS_FOR_PATTERN} reports, ${MIN_WEEKS_FOR_BASELINE} weeks)`)
  }

  return hasEnoughReports && hasEnoughTime
}

// Categories to process - these match the actual database values
const CATEGORIES = [
  'ufos_aliens',
  'cryptids',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'biological_factors',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
  'multi_disciplinary',
  'combination'
]

export interface AnalysisResult {
  run_id: string
  status: 'completed' | 'partial' | 'failed'
  patterns_detected: number
  patterns_updated: number
  patterns_archived: number
  reports_analyzed: number
  duration_ms: number
  errors: string[]
  category_results: Record<string, { analyzed: number; patterns: number }>
}

/**
 * Main entry point - optimized pattern analysis
 */
export async function runOptimizedPatternAnalysis(): Promise<AnalysisResult> {
  const startTime = Date.now()
  const errors: string[] = []
  const categoryResults: Record<string, { analyzed: number; patterns: number }> = {}

  let patternsDetected = 0
  let patternsUpdated = 0
  let patternsArchived = 0
  let totalReportsAnalyzed = 0

  // Get baseline start date (only analyze data after this date)
  const baselineStartDate = await getBaselineStartDate()
  console.log(`[Pattern Analysis V2] Using baseline start date: ${baselineStartDate.toISOString()}`)

  // Check if we have enough data for meaningful analysis
  const hasEnoughData = await hasEnoughDataForPatterns(baselineStartDate)
  if (!hasEnoughData) {
    console.log('[Pattern Analysis V2] Skipping analysis - insufficient data for reliable patterns')
    return {
      run_id: 'skipped_insufficient_data',
      status: 'completed',
      patterns_detected: 0,
      patterns_updated: 0,
      patterns_archived: 0,
      reports_analyzed: 0,
      duration_ms: Date.now() - startTime,
      errors: ['Insufficient data for pattern detection - building baseline'],
      category_results: {}
    }
  }

  // Create run record
  const { data: runData, error: runError } = await supabaseAdmin
    .from('pattern_analysis_runs')
    .insert({
      run_type: 'optimized',
      status: 'running',
      metadata: { version: 'v2', started_by: 'system' }
    })
    .select('id')
    .single()

  if (runError) {
    console.error('Failed to create analysis run:', runError)
    throw new Error(`Failed to create analysis run: ${runError.message}`)
  }

  const runId = runData.id

  try {
    // 1. Get all categories - use hardcoded list which covers all possible values
    // This is more reliable than dynamic discovery which can miss categories
    console.log('[Pattern Analysis V2] Using known category list...')
    const uniqueCategories = CATEGORIES.filter(Boolean)
    console.log('[Pattern Analysis V2] Processing categories:', uniqueCategories)

    // 2. Update temporal patterns (category-based surge detection)
    console.log('[Pattern Analysis V2] Starting category-based analysis...')

    for (const category of uniqueCategories) {
      try {
        const result = await analyzeCategoryTrends(category)
        categoryResults[category] = result
        patternsDetected += result.patterns
        totalReportsAnalyzed += result.analyzed
      } catch (err) {
        const msg = `Category ${category} failed: ${err instanceof Error ? err.message : 'Unknown'}`
        errors.push(msg)
        console.error(msg)
      }
    }

    // 2. Detect temporal anomalies (weekly spikes)
    console.log('[Pattern Analysis V2] Detecting temporal anomalies...')
    try {
      const temporalResult = await detectTemporalAnomaliesOptimized()
      patternsDetected += temporalResult.newPatterns
      patternsUpdated += temporalResult.updatedPatterns
    } catch (err) {
      errors.push(`Temporal analysis failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    }

    // 3. Update existing patterns with new reports
    console.log('[Pattern Analysis V2] Updating existing patterns...')
    try {
      const updateResult = await updateExistingPatterns()
      patternsUpdated += updateResult.updated
    } catch (err) {
      errors.push(`Pattern update failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    }

    // 4. Archive stale patterns
    console.log('[Pattern Analysis V2] Archiving stale patterns...')
    try {
      patternsArchived = await archiveStalePatterns()
    } catch (err) {
      errors.push(`Archive failed: ${err instanceof Error ? err.message : 'Unknown'}`)
    }

    // Update run record
    const status = errors.length === 0 ? 'completed' : 'partial'
    await supabaseAdmin
      .from('pattern_analysis_runs')
      .update({
        status,
        completed_at: new Date().toISOString(),
        reports_analyzed: totalReportsAnalyzed,
        patterns_detected: patternsDetected,
        patterns_updated: patternsUpdated,
        patterns_archived: patternsArchived,
        error_message: errors.length > 0 ? errors.join('; ') : null,
        metadata: {
          version: 'v2',
          category_results: categoryResults,
          errors
        }
      })
      .eq('id', runId)

    console.log('[Pattern Analysis V2] Complete:', {
      status,
      patternsDetected,
      patternsUpdated,
      patternsArchived,
      duration: Date.now() - startTime
    })

    return {
      run_id: runId,
      status,
      patterns_detected: patternsDetected,
      patterns_updated: patternsUpdated,
      patterns_archived: patternsArchived,
      reports_analyzed: totalReportsAnalyzed,
      duration_ms: Date.now() - startTime,
      errors,
      category_results: categoryResults
    }

  } catch (error) {
    await supabaseAdmin
      .from('pattern_analysis_runs')
      .update({
        status: 'failed',
        completed_at: new Date().toISOString(),
        error_message: error instanceof Error ? error.message : 'Unknown error'
      })
      .eq('id', runId)

    throw error
  }
}

/**
 * Analyze trends for a specific category
 * Uses simpler time-based analysis instead of expensive DBSCAN
 * Only considers data after the baseline start date
 */
async function analyzeCategoryTrends(category: string): Promise<{ analyzed: number; patterns: number }> {
  // Get baseline start date - only analyze data after this date
  const baselineStartDate = await getBaselineStartDate()

  const { data: reports, error, count } = await supabaseAdmin
    .from('reports')
    .select('id, event_date, created_at, country, location_name, source_type', { count: 'exact' })
    .eq('status', 'approved')
    .eq('category', category)
    .gte('created_at', baselineStartDate.toISOString())
    .order('created_at', { ascending: false })
    .limit(5000)

  if (error) throw error

  const reportsAnalyzed = count || reports?.length || 0
  let patternsFound = 0

  // Need enough reports for meaningful analysis
  if (!reports || reports.length < MIN_REPORTS_FOR_PATTERN) {
    return { analyzed: reportsAnalyzed, patterns: 0 }
  }

  // Calculate weekly averages and detect surges
  const weeklyGroups = groupByWeek(reports)
  const avgPerWeek = reports.length / 13 // 90 days ≈ 13 weeks

  for (const [weekStart, weekReports] of Object.entries(weeklyGroups)) {
    const weekCount = (weekReports as any[]).length
    const ratio = weekCount / avgPerWeek

    // Check if most reports are from bulk ingestion (non-user sources)
    const typedReports = weekReports as any[]
    const userReports = typedReports.filter(r => r.source_type === 'user' || !r.source_type).length
    const ingestedReports = weekCount - userReports
    const ingestionRatio = ingestedReports / weekCount

    // Skip surges that are >80% from bulk ingestion - these are setup, not patterns
    const isBulkIngestion = ingestionRatio > 0.8 && ratio > 5

    // Surge detection: >2x average (but not bulk ingestion)
    if (ratio >= 2 && weekCount >= 5 && !isBulkIngestion) {
      const patternKey = `surge_${category}_${weekStart}`
      const existing = await findExistingPattern(patternKey)

      if (existing) {
        await updatePattern(existing.id, {
          report_count: weekCount,
          metadata: {
            ...existing.metadata,
            ratio,
            user_reports: userReports,
            ingested_reports: ingestedReports,
            last_analyzed: new Date().toISOString()
          }
        })
      } else {
        await createTemporalPattern({
          pattern_type: 'temporal_anomaly',
          category,
          weekStart,
          reportCount: weekCount,
          ratio,
          reports: typedReports
        })
        patternsFound++
      }
    }
  }

  // Check for regional concentrations
  const locationGroups = groupByLocation(reports)
  for (const [location, locReports] of Object.entries(locationGroups)) {
    if ((locReports as any[]).length >= 10) {
      const patternKey = `region_${category}_${location.replace(/\W/g, '_')}`
      const existing = await findExistingPattern(patternKey)

      if (!existing) {
        await createRegionalPattern({
          category,
          location,
          reports: locReports as any[]
        })
        patternsFound++
      }
    }
  }

  return { analyzed: reportsAnalyzed, patterns: patternsFound }
}

/**
 * Detect temporal anomalies using simple statistical analysis
 * Only considers data after the baseline start date
 */
async function detectTemporalAnomaliesOptimized(): Promise<{ newPatterns: number; updatedPatterns: number }> {
  let newPatterns = 0
  let updatedPatterns = 0

  // Get baseline start date - only analyze data after this date
  const baselineStartDate = await getBaselineStartDate()

  // Get weekly report counts since baseline start
  const { data: weeklyData, error } = await supabaseAdmin
    .from('reports')
    .select('created_at, category, source_type')
    .eq('status', 'approved')
    .gte('created_at', baselineStartDate.toISOString())
    .limit(50000)

  if (error || !weeklyData) return { newPatterns: 0, updatedPatterns: 0 }

  // Check if we have enough data for meaningful statistics
  if (weeklyData.length < MIN_REPORTS_FOR_PATTERN) {
    console.log(`[Temporal Analysis] Only ${weeklyData.length} reports since baseline - skipping`)
    return { newPatterns: 0, updatedPatterns: 0 }
  }

  // Group by week, tracking user vs ingested reports
  const weekCounts: Record<string, number> = {}
  const weekUserCounts: Record<string, number> = {}
  for (const report of weeklyData) {
    const week = getWeekStart(new Date(report.created_at))
    weekCounts[week] = (weekCounts[week] || 0) + 1
    // Track user-submitted reports separately
    if (report.source_type === 'user' || !report.source_type) {
      weekUserCounts[week] = (weekUserCounts[week] || 0) + 1
    }
  }

  // Calculate statistics
  const counts = Object.values(weekCounts)
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length
  const variance = counts.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / counts.length
  const stdDev = Math.sqrt(variance)

  // Find anomalies (z-score > 2), but skip bulk ingestion surges
  for (const [week, count] of Object.entries(weekCounts)) {
    const zScore = (count - mean) / stdDev
    const userCount = weekUserCounts[week] || 0
    const ingestionRatio = (count - userCount) / count

    // Skip surges that are >80% from bulk ingestion with z-score > 3
    // These are setup/ingestion periods, not genuine patterns
    const isBulkIngestion = ingestionRatio > 0.8 && zScore > 3

    if (Math.abs(zScore) > 2 && !isBulkIngestion) {
      const isSpike = zScore > 0
      const existing = await findExistingPattern(`temporal_${week}`)

      if (existing) {
        await updatePattern(existing.id, {
          metadata: { ...existing.metadata, z_score: zScore, count }
        })
        updatedPatterns++
      } else {
        await supabaseAdmin
          .from('detected_patterns')
          .insert({
            pattern_type: 'temporal_anomaly',
            status: 'active',
            confidence_score: Math.min(Math.abs(zScore) / 5, 1),
            significance_score: Math.min(count / 100, 1),
            report_count: count,
            pattern_start_date: week,
            pattern_end_date: addDays(week, 7),
            metadata: {
              pattern_key: `temporal_${week}`,
              z_score: zScore,
              is_spike: isSpike,
              mean_count: mean,
              std_dev: stdDev
            },
            ai_title: isSpike
              ? `Report Surge: ${count} Reports (Week of ${week})`
              : `Report Decline: Only ${count} Reports (Week of ${week})`,
            ai_summary: isSpike
              ? `Statistically significant increase in paranormal reports. This week saw ${count} reports, which is ${(zScore).toFixed(1)} standard deviations above the weekly average of ${mean.toFixed(0)}.`
              : `Unusual decrease in report activity. Only ${count} reports this week, ${Math.abs(zScore).toFixed(1)} standard deviations below average.`
          })
        newPatterns++
      }
    }
  }

  return { newPatterns, updatedPatterns }
}

/**
 * Update existing patterns - just refresh timestamps for active patterns
 * Report counts are managed by the category analysis functions
 */
async function updateExistingPatterns(): Promise<{ updated: number }> {
  const { data: patterns, error } = await supabaseAdmin
    .from('detected_patterns')
    .select('id, status, last_updated_at')
    .in('status', ['active', 'emerging'])

  if (error || !patterns) return { updated: 0 }

  let updated = 0
  const now = new Date()
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  for (const pattern of patterns) {
    const lastUpdated = new Date(pattern.last_updated_at)

    // Refresh timestamp for patterns not updated in the last 7 days
    if (lastUpdated < sevenDaysAgo) {
      await supabaseAdmin
        .from('detected_patterns')
        .update({
          last_updated_at: now.toISOString()
        })
        .eq('id', pattern.id)
      updated++
    }
  }

  return { updated }
}

/**
 * Archive patterns that haven't had activity in 90+ days
 */
async function archiveStalePatterns(): Promise<number> {
  const ninetyDaysAgo = new Date()
  ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90)

  const { data, error } = await supabaseAdmin
    .from('detected_patterns')
    .update({ status: 'historical' })
    .in('status', ['active', 'emerging', 'declining'])
    .lt('last_updated_at', ninetyDaysAgo.toISOString())
    .select('id')

  return data?.length || 0
}

// Helper functions

function groupByWeek(reports: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {}
  for (const report of reports) {
    const week = getWeekStart(new Date(report.created_at))
    if (!groups[week]) groups[week] = []
    groups[week].push(report)
  }
  return groups
}

function groupByLocation(reports: any[]): Record<string, any[]> {
  const groups: Record<string, any[]> = {}
  for (const report of reports) {
    const loc = report.country || report.location_name || 'Unknown'
    if (!groups[loc]) groups[loc] = []
    groups[loc].push(report)
  }
  return groups
}

function getWeekStart(date: Date): string {
  const d = new Date(date)
  d.setDate(d.getDate() - d.getDay())
  return d.toISOString().split('T')[0]
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr)
  d.setDate(d.getDate() + days)
  return d.toISOString().split('T')[0]
}

async function findExistingPattern(patternKey: string) {
  const { data } = await supabaseAdmin
    .from('detected_patterns')
    .select('*')
    .contains('metadata', { pattern_key: patternKey })
    .single()
  return data
}

async function updatePattern(id: string, updates: any) {
  await supabaseAdmin
    .from('detected_patterns')
    .update({
      ...updates,
      last_updated_at: new Date().toISOString()
    })
    .eq('id', id)
}

async function createTemporalPattern(data: any) {
  await supabaseAdmin
    .from('detected_patterns')
    .insert({
      pattern_type: 'temporal_anomaly',
      status: 'emerging',
      confidence_score: Math.min(data.ratio / 5, 1),
      significance_score: Math.min(data.reportCount / 50, 1),
      report_count: data.reportCount,
      pattern_start_date: data.weekStart,
      pattern_end_date: addDays(data.weekStart, 7),
      categories: [data.category],
      metadata: {
        pattern_key: `surge_${data.category}_${data.weekStart}`,
        ratio: data.ratio,
        category: data.category
      },
      ai_title: `${getCategoryName(data.category)} Surge: ${Math.round(data.ratio * 100)}% Above Average (Week of ${data.weekStart})`,
      ai_summary: `A statistically significant surge in ${getCategoryName(data.category)} reports was detected during the week of ${data.weekStart}, with ${data.reportCount} reports - ${Math.round(data.ratio * 100)}% above the typical weekly average.`
    })
}

async function createRegionalPattern(data: any) {
  const reportCount = data.reports.length
  await supabaseAdmin
    .from('detected_patterns')
    .insert({
      pattern_type: 'regional_concentration',
      status: 'emerging',
      confidence_score: Math.min(reportCount / 50, 1),
      significance_score: Math.min(reportCount / 30, 1),
      report_count: reportCount,
      categories: [data.category],
      metadata: {
        pattern_key: `region_${data.category}_${data.location.replace(/\W/g, '_')}`,
        location: data.location,
        category: data.category
      },
      ai_title: `${getCategoryName(data.category)} Concentration: ${data.reports.length} Reports in ${data.location}`,
      ai_summary: `A notable concentration of ${getCategoryName(data.category)} reports has been identified in ${data.location}, with ${data.reports.length} documented incidents in recent months.`
    })
}

function getCategoryName(category: string): string {
  const names: Record<string, string> = {
    'ufos_aliens': 'UFOs & Aliens',
    'cryptids': 'Cryptids',
    'ghosts_hauntings': 'Ghosts & Hauntings',
    'psychic_phenomena': 'Psychic Phenomena',
    'consciousness_practices': 'Consciousness Practices',
    'psychological_experiences': 'Psychological Experiences',
    'biological_factors': 'Biological Factors',
    'perception_sensory': 'Perception & Sensory',
    'religion_mythology': 'Religion & Mythology',
    'esoteric_practices': 'Esoteric Practices',
    'multi_disciplinary': 'Multi-Disciplinary',
    'combination': 'Combination'
  }
  return names[category] || category.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
