/**
 * Pattern Scoring Service
 *
 * Enhanced scoring system with:
 * - Uncertainty quantification (confidence intervals)
 * - Baseline comparisons
 * - Effect size calculations
 * - Methodology transparency
 * - Alternative hypothesis scoring
 */

export interface UncertaintyBounds {
  lower: number
  upper: number
  point: number
}

export interface BaselineComparison {
  currentValue: number
  baselineValue: number
  percentChange: number
  multiplier: number
  historicalRank: number
  totalComparisons: number
  periodDescription: string
}

export interface MethodologyData {
  algorithmName: string
  algorithmDescription: string
  parameters: Record<string, number | string>
  dataTimeRange: { start: string; end: string }
  sampleSize: number
  lastRunAt: string
  limitations: string[]
}

export interface AlternativeHypothesis {
  id: string
  name: string
  description: string
  plausibilityScore: number // 0-1
  evidenceFor: string[]
  evidenceAgainst: string[]
}

export interface EnhancedPatternScores {
  confidence: UncertaintyBounds
  significance: UncertaintyBounds
  effectSize: number
  effectSizeLabel: 'negligible' | 'small' | 'medium' | 'large' | 'very_large'
  baselineComparison: BaselineComparison
  methodology: MethodologyData
  alternativeHypotheses: AlternativeHypothesis[]
  qualityFlags: string[]
}

/**
 * Calculate confidence with uncertainty bounds using Wilson score interval
 * Better than simple percentage for small samples
 */
export function calculateConfidenceWithUncertainty(
  reportCount: number,
  density: number,
  totalReportsInPeriod: number
): UncertaintyBounds {
  // Base confidence from count and density
  const rawConfidence = calculateRawConfidence(reportCount, density)

  // Calculate standard error using Wilson score interval approximation
  // SE = sqrt(p(1-p)/n) where p is our confidence and n is report count
  const n = Math.max(reportCount, 1)
  const p = rawConfidence
  const z = 1.96 // 95% CI

  // Wilson score interval
  const denominator = 1 + (z * z) / n
  const center = (p + (z * z) / (2 * n)) / denominator
  const margin = (z / denominator) * Math.sqrt((p * (1 - p) / n) + (z * z) / (4 * n * n))

  // Adjust bounds based on sample quality
  const sampleQualityFactor = Math.min(reportCount / 50, 1) // Stabilizes at 50 reports
  const adjustedMargin = margin * (2 - sampleQualityFactor) // Wider intervals for small samples

  return {
    point: Math.min(Math.max(center, 0), 1),
    lower: Math.min(Math.max(center - adjustedMargin, 0), 1),
    upper: Math.min(Math.max(center + adjustedMargin, 0), 1)
  }
}

/**
 * Calculate raw confidence using logarithmic scaling to prevent 100% saturation
 */
function calculateRawConfidence(reportCount: number, density: number): number {
  // Logarithmic scaling - never reaches 1.0
  // 20 reports = ~0.65, 50 reports = ~0.78, 100 reports = ~0.87, 500 reports = ~0.96
  const countScore = Math.log10(reportCount + 1) / Math.log10(1000) // Approaches 1 at 1000 reports

  // Density contribution (reports per sq km)
  const densityScore = Math.log10((density * 100) + 1) / Math.log10(100)

  // Weighted combination
  const rawScore = (countScore * 0.6 + densityScore * 0.4)

  // Apply sigmoid to keep in reasonable range (max ~0.95)
  return 0.95 / (1 + Math.exp(-5 * (rawScore - 0.5)))
}

/**
 * Calculate significance with uncertainty bounds
 */
export function calculateSignificanceWithUncertainty(
  reportCount: number,
  categoryCount: number,
  baselineReportCount: number,
  phenomenonDiversity: number
): UncertaintyBounds {
  // Effect size: how much does this deviate from baseline?
  const effectSize = baselineReportCount > 0
    ? (reportCount - baselineReportCount) / Math.max(Math.sqrt(baselineReportCount), 1)
    : reportCount / 10

  // Logarithmic scaling for count component
  const countComponent = Math.log10(reportCount + 1) / Math.log10(500)

  // Diversity bonus (more categories = more significant)
  const diversityComponent = Math.min(categoryCount / 6, 1)

  // Phenomenon diversity bonus
  const phenomenonComponent = Math.min(phenomenonDiversity / 5, 1)

  // Combined raw significance
  const rawSignificance = (
    countComponent * 0.5 +
    diversityComponent * 0.25 +
    phenomenonComponent * 0.15 +
    Math.min(Math.abs(effectSize) / 3, 1) * 0.1
  )

  // Apply sigmoid transformation
  const pointEstimate = 0.95 / (1 + Math.exp(-6 * (rawSignificance - 0.4)))

  // Uncertainty based on sample size
  const uncertaintyWidth = 0.15 * Math.exp(-reportCount / 100)

  return {
    point: pointEstimate,
    lower: Math.max(pointEstimate - uncertaintyWidth, 0),
    upper: Math.min(pointEstimate + uncertaintyWidth, 0.98)
  }
}

/**
 * Calculate Cohen's d effect size
 */
export function calculateEffectSize(
  observedMean: number,
  baselineMean: number,
  pooledStdDev: number
): { value: number; label: 'negligible' | 'small' | 'medium' | 'large' | 'very_large' } {
  if (pooledStdDev === 0) {
    return { value: 0, label: 'negligible' }
  }

  const d = (observedMean - baselineMean) / pooledStdDev
  const absD = Math.abs(d)

  let label: 'negligible' | 'small' | 'medium' | 'large' | 'very_large'
  if (absD < 0.2) label = 'negligible'
  else if (absD < 0.5) label = 'small'
  else if (absD < 0.8) label = 'medium'
  else if (absD < 1.2) label = 'large'
  else label = 'very_large'

  return { value: d, label }
}

/**
 * Generate baseline comparison data
 */
export function generateBaselineComparison(
  currentCount: number,
  historicalCounts: number[],
  periodDescription: string
): BaselineComparison {
  if (historicalCounts.length === 0) {
    return {
      currentValue: currentCount,
      baselineValue: 0,
      percentChange: 0,
      multiplier: 1,
      historicalRank: 1,
      totalComparisons: 1,
      periodDescription
    }
  }

  const sortedCounts = [...historicalCounts].sort((a, b) => b - a)
  const baselineValue = historicalCounts.reduce((a, b) => a + b, 0) / historicalCounts.length
  const percentChange = baselineValue > 0 ? ((currentCount - baselineValue) / baselineValue) * 100 : 0
  const multiplier = baselineValue > 0 ? currentCount / baselineValue : 1

  // Find rank (1 = highest)
  const rank = sortedCounts.findIndex(c => currentCount >= c) + 1 || sortedCounts.length + 1

  return {
    currentValue: currentCount,
    baselineValue: Math.round(baselineValue * 10) / 10,
    percentChange: Math.round(percentChange * 10) / 10,
    multiplier: Math.round(multiplier * 100) / 100,
    historicalRank: rank,
    totalComparisons: historicalCounts.length + 1,
    periodDescription
  }
}

/**
 * Generate methodology documentation
 */
export function generateMethodologyData(
  patternType: string,
  parameters: Record<string, number | string>,
  dataRange: { start: string; end: string },
  sampleSize: number
): MethodologyData {
  const algorithmDescriptions: Record<string, { name: string; description: string; limitations: string[] }> = {
    geographic_cluster: {
      name: 'DBSCAN (Density-Based Spatial Clustering)',
      description: 'Identifies clusters of spatially proximate reports using PostGIS. Reports within the epsilon radius that meet the minimum points threshold are grouped into clusters.',
      limitations: [
        'Sensitive to epsilon parameter choice',
        'May merge distinct clusters if they overlap',
        'Does not account for population density',
        'Assumes spherical cluster shapes'
      ]
    },
    temporal_anomaly: {
      name: 'Z-Score Temporal Analysis',
      description: 'Compares weekly report counts against rolling historical averages. Weeks with counts exceeding the threshold standard deviations from the mean are flagged as anomalies.',
      limitations: [
        'Assumes normal distribution of report counts',
        'May flag legitimate seasonal variations',
        'Sensitive to outliers in baseline period',
        'Does not distinguish cause of anomaly'
      ]
    },
    seasonal_pattern: {
      name: 'Seasonal Index Analysis',
      description: 'Calculates monthly averages relative to overall mean to identify recurring seasonal patterns. Months significantly above or below average are flagged.',
      limitations: [
        'Requires multiple years of data for reliability',
        'Does not account for climate differences by region',
        'May reflect reporting behavior, not phenomena',
        'Conflates different phenomena types'
      ]
    },
    regional_concentration: {
      name: 'Regional Density Analysis',
      description: 'Measures report density within administrative regions compared to expected distribution based on population and historical patterns.',
      limitations: [
        'Dependent on accurate geocoding',
        'Population data may be outdated',
        'Urban bias in reporting',
        'Regional boundary artifacts'
      ]
    },
    flap_wave: {
      name: 'Spatio-Temporal Wave Detection',
      description: 'Identifies patterns where clusters of reports spread geographically over time, suggesting a "wave" of activity.',
      limitations: [
        'Requires precise temporal data',
        'May reflect media contagion',
        'Sensitive to reporting delays',
        'Difficult to distinguish from coincidence'
      ]
    }
  }

  const algo = algorithmDescriptions[patternType] || {
    name: 'Statistical Pattern Detection',
    description: 'Identifies statistically significant patterns in report data using various analytical methods.',
    limitations: ['Methodology details pending documentation']
  }

  return {
    algorithmName: algo.name,
    algorithmDescription: algo.description,
    parameters,
    dataTimeRange: dataRange,
    sampleSize,
    lastRunAt: new Date().toISOString(),
    limitations: algo.limitations
  }
}

/**
 * Generate alternative hypotheses for a pattern
 */
export function generateAlternativeHypotheses(
  patternType: string,
  metadata: Record<string, unknown>
): AlternativeHypothesis[] {
  const hypotheses: AlternativeHypothesis[] = []

  // Common alternative hypotheses for all patterns
  hypotheses.push({
    id: 'reporting_bias',
    name: 'Reporting Bias',
    description: 'The pattern reflects where and when people report, not where phenomena occur.',
    plausibilityScore: 0.7,
    evidenceFor: [
      'Urban areas tend to have more reports',
      'Reports cluster near roads and population centers',
      'Weekends show different patterns than weekdays'
    ],
    evidenceAgainst: [
      'Some remote areas show high activity',
      'Pattern persists across different reporting platforms'
    ]
  })

  hypotheses.push({
    id: 'media_influence',
    name: 'Media/Cultural Influence',
    description: 'Increased attention from media, movies, or social trends drives more reports.',
    plausibilityScore: 0.6,
    evidenceFor: [
      'Report spikes often follow popular media releases',
      'Social media amplifies local reports',
      'Cultural events correlate with certain phenomena types'
    ],
    evidenceAgainst: [
      'Some patterns predate modern media',
      'Similar patterns across different cultures'
    ]
  })

  // Pattern-specific hypotheses
  if (patternType === 'geographic_cluster') {
    hypotheses.push({
      id: 'geological_correlation',
      name: 'Geological/Environmental Factor',
      description: 'Geographic features or environmental conditions in the area may explain reports.',
      plausibilityScore: 0.5,
      evidenceFor: [
        'Some clusters align with fault lines',
        'Water features near many sighting locations',
        'Specific terrain types associated with reports'
      ],
      evidenceAgainst: [
        'Many clusters lack obvious geological features',
        'Similar terrain elsewhere shows no activity'
      ]
    })

    hypotheses.push({
      id: 'genuine_anomaly',
      name: 'Genuine Anomalous Activity',
      description: 'The cluster represents actual unexplained phenomena concentrated in this location.',
      plausibilityScore: 0.3,
      evidenceFor: [
        'Multiple independent witnesses',
        'Consistent descriptions across reports',
        'Physical evidence in some cases'
      ],
      evidenceAgainst: [
        'No verified physical evidence',
        'Alternative explanations for most cases',
        'Witness reliability varies'
      ]
    })
  }

  if (patternType === 'temporal_anomaly') {
    hypotheses.push({
      id: 'astronomical_correlation',
      name: 'Astronomical Events',
      description: 'Moon phases, meteor showers, or other astronomical events may explain timing.',
      plausibilityScore: 0.4,
      evidenceFor: [
        'Some spikes align with meteor showers',
        'Full moon correlations noted historically',
        'Planet visibility affects UFO reports'
      ],
      evidenceAgainst: [
        'Many anomalies show no astronomical correlation',
        'Effect size often negligible when controlled'
      ]
    })
  }

  if (patternType === 'seasonal_pattern') {
    hypotheses.push({
      id: 'outdoor_activity',
      name: 'Seasonal Outdoor Activity',
      description: 'People spend more time outdoors in certain seasons, increasing observation opportunities.',
      plausibilityScore: 0.8,
      evidenceFor: [
        'Summer shows increased reports in northern latitudes',
        'Camping/hiking seasons correlate with cryptid reports',
        'Weather affects observation conditions'
      ],
      evidenceAgainst: [
        'Some phenomena show opposite seasonal patterns',
        'Indoor phenomena also show seasonality'
      ]
    })
  }

  // Sort by plausibility
  return hypotheses.sort((a, b) => b.plausibilityScore - a.plausibilityScore)
}

/**
 * Format uncertainty for display
 */
export function formatUncertainty(bounds: UncertaintyBounds, format: 'percent' | 'decimal' = 'percent'): string {
  if (format === 'percent') {
    const point = Math.round(bounds.point * 100)
    const lower = Math.round(bounds.lower * 100)
    const upper = Math.round(bounds.upper * 100)

    if (lower === upper) {
      return `${point}%`
    }
    return `${point}% (${lower}%-${upper}%)`
  }

  return `${bounds.point.toFixed(2)} [${bounds.lower.toFixed(2)}-${bounds.upper.toFixed(2)}]`
}

/**
 * Generate quality flags for a pattern
 */
export function generateQualityFlags(
  reportCount: number,
  timeSpanDays: number,
  categoryCount: number,
  hasLocation: boolean
): string[] {
  const flags: string[] = []

  if (reportCount < 10) {
    flags.push('low_sample_size')
  }

  if (timeSpanDays < 30) {
    flags.push('short_time_window')
  }

  if (categoryCount === 1) {
    flags.push('single_category')
  }

  if (!hasLocation) {
    flags.push('no_precise_location')
  }

  if (reportCount > 100 && timeSpanDays > 365) {
    flags.push('well_established')
  }

  if (categoryCount >= 3 && reportCount >= 20) {
    flags.push('multi_phenomenon')
  }

  return flags
}

/**
 * Get quality flag descriptions
 */
export function getQualityFlagDescription(flag: string): { label: string; description: string; severity: 'info' | 'warning' | 'positive' } {
  const flagDescriptions: Record<string, { label: string; description: string; severity: 'info' | 'warning' | 'positive' }> = {
    low_sample_size: {
      label: 'Small Sample',
      description: 'Fewer than 10 reports - results may not be statistically robust',
      severity: 'warning'
    },
    short_time_window: {
      label: 'Recent Pattern',
      description: 'Less than 30 days of data - pattern may be transient',
      severity: 'info'
    },
    single_category: {
      label: 'Single Category',
      description: 'All reports in one category - may indicate specific phenomenon',
      severity: 'info'
    },
    no_precise_location: {
      label: 'Approximate Location',
      description: 'Lacks precise coordinates - geographic analysis limited',
      severity: 'warning'
    },
    well_established: {
      label: 'Well Established',
      description: 'Over 100 reports spanning more than a year',
      severity: 'positive'
    },
    multi_phenomenon: {
      label: 'Multi-Phenomenon',
      description: 'Multiple phenomenon types reported - complex activity zone',
      severity: 'positive'
    }
  }

  return flagDescriptions[flag] || {
    label: flag,
    description: 'Unknown quality indicator',
    severity: 'info'
  }
}
