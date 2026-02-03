import React from 'react'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '@/components/Layout'
import {
  FlaskConical,
  Database,
  Cpu,
  BarChart3,
  AlertTriangle,
  Scale,
  BookOpen,
  ArrowLeft,
  Info,
  CheckCircle2,
  XCircle,
  Target,
  Layers,
  Clock,
  MapPin,
  TrendingUp,
  Waves
} from 'lucide-react'

// Algorithm card component
function AlgorithmCard({
  icon: Icon,
  name,
  description,
  parameters,
  limitations
}: {
  icon: React.ElementType
  name: string
  description: string
  parameters: { name: string; description: string }[]
  limitations: string[]
}) {
  return (
    <div className="glass-card p-6">
      <div className="flex items-start gap-4 mb-4">
        <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center flex-shrink-0">
          <Icon className="w-6 h-6 text-primary-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-white mb-1">{name}</h3>
          <p className="text-sm text-gray-400">{description}</p>
        </div>
      </div>

      {parameters.length > 0 && (
        <div className="mb-4">
          <h4 className="text-sm font-medium text-gray-300 mb-2 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Key Parameters
          </h4>
          <div className="space-y-2">
            {parameters.map((param, i) => (
              <div key={i} className="flex items-start gap-2 text-sm">
                <span className="text-primary-400 font-mono">{param.name}:</span>
                <span className="text-gray-400">{param.description}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
        <h4 className="text-xs font-medium text-amber-400 uppercase tracking-wide mb-2 flex items-center gap-2">
          <AlertTriangle className="w-3 h-3" />
          Limitations
        </h4>
        <ul className="space-y-1">
          {limitations.map((limitation, i) => (
            <li key={i} className="text-xs text-gray-400 flex items-start gap-2">
              <span className="text-amber-400 mt-0.5">•</span>
              {limitation}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Hypothesis card component
function HypothesisCard({
  name,
  description,
  plausibility,
  evidenceFor,
  evidenceAgainst
}: {
  name: string
  description: string
  plausibility: string
  evidenceFor: string[]
  evidenceAgainst: string[]
}) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-3">
        <h4 className="font-medium text-white">{name}</h4>
        <span className="px-2 py-1 bg-gray-700/50 rounded text-xs text-gray-300">
          {plausibility} plausibility
        </span>
      </div>
      <p className="text-sm text-gray-400 mb-4">{description}</p>

      <div className="grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="flex items-center gap-1 text-emerald-400 mb-2">
            <CheckCircle2 className="w-3 h-3" />
            <span className="font-medium">Evidence For</span>
          </div>
          <ul className="space-y-1">
            {evidenceFor.map((e, i) => (
              <li key={i} className="text-gray-400">{e}</li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-1 text-rose-400 mb-2">
            <XCircle className="w-3 h-3" />
            <span className="font-medium">Evidence Against</span>
          </div>
          <ul className="space-y-1">
            {evidenceAgainst.map((e, i) => (
              <li key={i} className="text-gray-400">{e}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}

// Quality flag component
function QualityFlagItem({
  flag,
  label,
  description,
  severity
}: {
  flag: string
  label: string
  description: string
  severity: 'info' | 'warning' | 'positive'
}) {
  const severityStyles = {
    info: 'bg-blue-500/20 border-blue-500/30 text-blue-400',
    warning: 'bg-amber-500/20 border-amber-500/30 text-amber-400',
    positive: 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400'
  }

  return (
    <div className={`p-3 rounded-lg border ${severityStyles[severity]}`}>
      <div className="flex items-center gap-2 mb-1">
        <code className="text-xs font-mono bg-black/20 px-1.5 py-0.5 rounded">{flag}</code>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <p className="text-xs text-gray-400">{description}</p>
    </div>
  )
}

export default function MethodologyPage() {
  return (
    <Layout>
      <Head>
        <title>Research Methodology | ParaDocs Pattern Detection</title>
        <meta
          name="description"
          content="Comprehensive documentation of ParaDocs pattern detection methodology, including algorithms, scoring systems, and statistical approaches."
        />
      </Head>

      <div className="py-8 max-w-5xl mx-auto">
        {/* Back link */}
        <Link
          href="/insights"
          className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Pattern Insights
        </Link>

        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <FlaskConical className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-display font-bold text-white">
                Research Methodology
              </h1>
              <p className="text-gray-400">ParaDocs Pattern Detection System v1.0</p>
            </div>
          </div>
          <p className="text-gray-300 text-lg leading-relaxed max-w-3xl">
            This document provides complete transparency into how ParaDocs identifies, scores, and
            presents patterns in paranormal report data. Our goal is to enable researchers to
            evaluate our findings critically and understand exactly how conclusions were reached.
          </p>
        </div>

        {/* Table of Contents */}
        <nav className="glass-card p-6 mb-12">
          <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary-400" />
            Contents
          </h2>
          <div className="grid md:grid-cols-2 gap-2">
            {[
              { id: 'overview', title: '1. System Overview' },
              { id: 'data', title: '2. Data Collection & Sources' },
              { id: 'algorithms', title: '3. Pattern Detection Algorithms' },
              { id: 'scoring', title: '4. Scoring Methodology' },
              { id: 'hypotheses', title: '5. Alternative Hypotheses' },
              { id: 'quality', title: '6. Quality Flags & Warnings' },
              { id: 'limitations', title: '7. Limitations & Caveats' },
              { id: 'glossary', title: '8. Glossary of Terms' }
            ].map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                className="text-sm text-gray-400 hover:text-primary-400 transition-colors"
              >
                {item.title}
              </a>
            ))}
          </div>
        </nav>

        {/* Section 1: Overview */}
        <section id="overview" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-primary-400" />
            </div>
            1. System Overview
          </h2>

          <div className="prose prose-invert max-w-none">
            <p className="text-gray-300 mb-4">
              The ParaDocs Pattern Detection System analyzes the database of paranormal reports to
              identify statistically significant patterns. The system runs continuously, processing
              new reports and updating pattern assessments in near real-time.
            </p>

            <div className="glass-card p-6 mb-6">
              <h3 className="text-lg font-medium text-white mb-4">System Architecture</h3>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <Database className="w-6 h-6 text-emerald-400 mb-2" />
                  <h4 className="text-sm font-medium text-white mb-1">Data Layer</h4>
                  <p className="text-xs text-gray-400">
                    PostgreSQL with PostGIS for spatial queries. Reports stored with full metadata,
                    coordinates, and timestamps.
                  </p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <Cpu className="w-6 h-6 text-cyan-400 mb-2" />
                  <h4 className="text-sm font-medium text-white mb-1">Analysis Engine</h4>
                  <p className="text-xs text-gray-400">
                    Statistical algorithms detect geographic clusters, temporal anomalies, and
                    cross-report correlations.
                  </p>
                </div>
                <div className="p-4 bg-gray-800/50 rounded-lg">
                  <Layers className="w-6 h-6 text-purple-400 mb-2" />
                  <h4 className="text-sm font-medium text-white mb-1">AI Enhancement</h4>
                  <p className="text-xs text-gray-400">
                    Claude AI generates narrative insights, explains significance, and identifies
                    potential alternative explanations.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-300">
              All patterns include confidence intervals, effect sizes, and quality flags to help
              researchers assess the reliability of findings. We explicitly present alternative
              hypotheses to encourage critical evaluation.
            </p>
          </div>
        </section>

        {/* Section 2: Data */}
        <section id="data" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <Database className="w-4 h-4 text-emerald-400" />
            </div>
            2. Data Collection & Sources
          </h2>

          <div className="space-y-6">
            <p className="text-gray-300">
              Pattern detection operates on the ParaDocs report database, which includes reports
              from multiple sources with varying levels of verification and detail.
            </p>

            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Data Sources</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <div className="w-8 h-8 rounded bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">📝</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">User Submissions</h4>
                    <p className="text-xs text-gray-400">
                      First-hand accounts submitted through the ParaDocs platform. Includes
                      structured fields for location, date, phenomena type, and detailed
                      descriptions.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <div className="w-8 h-8 rounded bg-green-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🌐</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">Aggregated Historical Data</h4>
                    <p className="text-xs text-gray-400">
                      Reports imported from public databases including BFRO (Bigfoot), MUFON (UFOs),
                      and historical archives. Data quality varies by source.
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3 p-3 bg-gray-800/50 rounded-lg">
                  <div className="w-8 h-8 rounded bg-purple-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-sm">🔍</span>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-white">Verified Reports</h4>
                    <p className="text-xs text-gray-400">
                      Reports that have undergone additional verification including source
                      confirmation, location validation, and cross-referencing.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-400">Data Quality Note</span>
              </div>
              <p className="text-sm text-gray-300">
                The database contains reports of varying quality and verification status. Not all
                reports have precise coordinates, complete timestamps, or verified details. Pattern
                detection accounts for these limitations through confidence intervals and quality
                flags.
              </p>
            </div>
          </div>
        </section>

        {/* Section 3: Algorithms */}
        <section id="algorithms" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/20 flex items-center justify-center">
              <BarChart3 className="w-4 h-4 text-cyan-400" />
            </div>
            3. Pattern Detection Algorithms
          </h2>

          <p className="text-gray-300 mb-6">
            We employ five primary algorithms for pattern detection, each targeting different types
            of patterns in the data.
          </p>

          <div className="space-y-6">
            <AlgorithmCard
              icon={MapPin}
              name="DBSCAN (Density-Based Spatial Clustering)"
              description="Identifies clusters of spatially proximate reports using PostGIS spatial functions. Reports within the epsilon radius that meet the minimum points threshold are grouped into clusters."
              parameters={[
                { name: 'epsilon', description: 'Maximum distance (km) between clustered points' },
                { name: 'min_points', description: 'Minimum reports required to form a cluster' }
              ]}
              limitations={[
                'Sensitive to epsilon parameter choice',
                'May merge distinct clusters if they overlap',
                'Does not account for population density',
                'Assumes spherical cluster shapes'
              ]}
            />

            <AlgorithmCard
              icon={TrendingUp}
              name="Z-Score Temporal Analysis"
              description="Compares weekly report counts against rolling historical averages. Weeks with counts exceeding the threshold standard deviations from the mean are flagged as anomalies."
              parameters={[
                { name: 'z_threshold', description: 'Standard deviations for anomaly detection (default: 2.0)' },
                { name: 'baseline_period', description: 'Weeks of historical data for baseline (default: 52)' }
              ]}
              limitations={[
                'Assumes normal distribution of report counts',
                'May flag legitimate seasonal variations',
                'Sensitive to outliers in baseline period',
                'Does not distinguish cause of anomaly'
              ]}
            />

            <AlgorithmCard
              icon={Clock}
              name="Seasonal Index Analysis"
              description="Calculates monthly averages relative to overall mean to identify recurring seasonal patterns. Months significantly above or below average are flagged."
              parameters={[
                { name: 'min_years', description: 'Minimum years of data required (default: 2)' },
                { name: 'variance_threshold', description: 'Coefficient of variation threshold (default: 0.3)' }
              ]}
              limitations={[
                'Requires multiple years of data for reliability',
                'Does not account for climate differences by region',
                'May reflect reporting behavior, not phenomena',
                'Conflates different phenomena types'
              ]}
            />

            <AlgorithmCard
              icon={Target}
              name="Regional Density Analysis"
              description="Measures report density within administrative regions compared to expected distribution based on population and historical patterns."
              parameters={[
                { name: 'population_weight', description: 'Adjustment factor for population density' },
                { name: 'historical_weight', description: 'Weight given to historical baseline' }
              ]}
              limitations={[
                'Dependent on accurate geocoding',
                'Population data may be outdated',
                'Urban bias in reporting',
                'Regional boundary artifacts'
              ]}
            />

            <AlgorithmCard
              icon={Waves}
              name="Spatio-Temporal Wave Detection"
              description="Identifies patterns where clusters of reports spread geographically over time, suggesting a 'wave' of activity moving across a region."
              parameters={[
                { name: 'time_window', description: 'Days within which reports are considered related' },
                { name: 'spread_velocity', description: 'Maximum km/day for wave propagation' }
              ]}
              limitations={[
                'Requires precise temporal data',
                'May reflect media contagion',
                'Sensitive to reporting delays',
                'Difficult to distinguish from coincidence'
              ]}
            />
          </div>
        </section>

        {/* Section 4: Scoring */}
        <section id="scoring" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
              <Scale className="w-4 h-4 text-purple-400" />
            </div>
            4. Scoring Methodology
          </h2>

          <p className="text-gray-300 mb-6">
            Each detected pattern receives multiple scores to help researchers assess its reliability
            and significance. We use established statistical methods with adaptations for the unique
            challenges of paranormal report data.
          </p>

          <div className="space-y-6">
            {/* Confidence Score */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Confidence Score</h3>
              <p className="text-sm text-gray-400 mb-4">
                Measures how certain we are that the detected pattern is real rather than noise.
                Calculated using the <strong className="text-white">Wilson score interval</strong>,
                which provides more reliable confidence bounds for small sample sizes than simple
                percentages.
              </p>

              <div className="bg-gray-800/50 rounded-lg p-4 mb-4 font-mono text-sm">
                <div className="text-gray-400 mb-2">// Wilson score interval formula</div>
                <div className="text-cyan-400">
                  center = (p + z²/2n) / (1 + z²/n)
                </div>
                <div className="text-cyan-400">
                  margin = (z / (1 + z²/n)) × √(p(1-p)/n + z²/4n²)
                </div>
                <div className="text-gray-500 mt-2">
                  where p = raw confidence, n = report count, z = 1.96 (95% CI)
                </div>
              </div>

              <p className="text-sm text-gray-400">
                Confidence is displayed as a point estimate with bounds, e.g., "72% (65%-79%)".
                Wider intervals indicate greater uncertainty, typically due to smaller sample sizes.
              </p>
            </div>

            {/* Significance Score */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Significance Score</h3>
              <p className="text-sm text-gray-400 mb-4">
                Measures how meaningful or important a pattern is for research purposes. Combines
                multiple factors with logarithmic scaling to prevent saturation.
              </p>

              <div className="grid md:grid-cols-2 gap-4">
                <div className="p-3 bg-gray-800/50 rounded-lg">
                  <h4 className="text-sm font-medium text-white mb-2">Components (weighted)</h4>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>• Report count (50%)</li>
                    <li>• Category diversity (25%)</li>
                    <li>• Phenomenon diversity (15%)</li>
                    <li>• Deviation from baseline (10%)</li>
                  </ul>
                </div>
                <div className="p-3 bg-gray-800/50 rounded-lg">
                  <h4 className="text-sm font-medium text-white mb-2">Score Interpretation</h4>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>• 90%+: Highly significant</li>
                    <li>• 70-89%: Moderately significant</li>
                    <li>• 50-69%: Potentially interesting</li>
                    <li>• &lt;50%: Preliminary</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Effect Size */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Effect Size (Cohen's d)</h3>
              <p className="text-sm text-gray-400 mb-4">
                Measures the magnitude of difference from baseline expectations. Unlike statistical
                significance, effect size tells us whether a pattern is <em>practically</em>
                meaningful.
              </p>

              <div className="bg-gray-800/50 rounded-lg p-4 mb-4 font-mono text-sm">
                <div className="text-cyan-400">
                  d = (observed_mean - baseline_mean) / pooled_std_dev
                </div>
              </div>

              <div className="grid grid-cols-5 gap-2 text-center text-xs">
                <div className="p-2 bg-gray-700/50 rounded">
                  <div className="text-gray-400">Negligible</div>
                  <div className="text-white font-mono">d &lt; 0.2</div>
                </div>
                <div className="p-2 bg-blue-500/20 rounded">
                  <div className="text-blue-400">Small</div>
                  <div className="text-white font-mono">0.2 - 0.5</div>
                </div>
                <div className="p-2 bg-cyan-500/20 rounded">
                  <div className="text-cyan-400">Medium</div>
                  <div className="text-white font-mono">0.5 - 0.8</div>
                </div>
                <div className="p-2 bg-purple-500/20 rounded">
                  <div className="text-purple-400">Large</div>
                  <div className="text-white font-mono">0.8 - 1.2</div>
                </div>
                <div className="p-2 bg-pink-500/20 rounded">
                  <div className="text-pink-400">Very Large</div>
                  <div className="text-white font-mono">d &gt; 1.2</div>
                </div>
              </div>
            </div>

            {/* Baseline Comparison */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4">Baseline Comparison</h3>
              <p className="text-sm text-gray-400 mb-4">
                Every pattern is compared against historical baselines to provide context. This shows
                whether current activity is truly unusual or within expected ranges.
              </p>

              <div className="p-4 bg-gray-800/50 rounded-lg">
                <h4 className="text-sm font-medium text-white mb-3">Baseline Metrics</h4>
                <div className="grid md:grid-cols-2 gap-4 text-xs">
                  <div>
                    <span className="text-gray-400">Percent Change:</span>
                    <span className="text-white ml-2">
                      How much current activity deviates from average
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Multiplier:</span>
                    <span className="text-white ml-2">
                      Current activity as multiple of baseline (e.g., "2.3× normal")
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Historical Rank:</span>
                    <span className="text-white ml-2">
                      Where current period ranks among all comparable periods
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-400">Period:</span>
                    <span className="text-white ml-2">
                      Time range used for baseline calculation
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 5: Alternative Hypotheses */}
        <section id="hypotheses" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-rose-500/20 flex items-center justify-center">
              <Scale className="w-4 h-4 text-rose-400" />
            </div>
            5. Alternative Hypotheses
          </h2>

          <p className="text-gray-300 mb-6">
            Every pattern includes alternative explanations to encourage critical evaluation. We
            explicitly consider mundane explanations alongside anomalous interpretations.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <HypothesisCard
              name="Reporting Bias"
              description="The pattern reflects where and when people report, not where phenomena occur."
              plausibility="High"
              evidenceFor={[
                'Urban areas have more reports',
                'Clusters near roads/population centers',
                'Weekend vs weekday patterns'
              ]}
              evidenceAgainst={[
                'Some remote areas show high activity',
                'Pattern persists across platforms'
              ]}
            />

            <HypothesisCard
              name="Media/Cultural Influence"
              description="Increased attention from media or social trends drives more reports."
              plausibility="Moderate"
              evidenceFor={[
                'Spikes follow media releases',
                'Social media amplification',
                'Cultural events correlate'
              ]}
              evidenceAgainst={[
                'Some patterns predate media',
                'Similar across different cultures'
              ]}
            />

            <HypothesisCard
              name="Geological/Environmental"
              description="Geographic features or environmental conditions explain the pattern."
              plausibility="Moderate"
              evidenceFor={[
                'Clusters align with fault lines',
                'Water features nearby',
                'Specific terrain associations'
              ]}
              evidenceAgainst={[
                'Many lack geological features',
                'Similar terrain elsewhere inactive'
              ]}
            />

            <HypothesisCard
              name="Genuine Anomalous Activity"
              description="The pattern represents actual unexplained phenomena."
              plausibility="Low"
              evidenceFor={[
                'Multiple independent witnesses',
                'Consistent descriptions',
                'Some physical evidence'
              ]}
              evidenceAgainst={[
                'No verified physical evidence',
                'Alternative explanations exist',
                'Witness reliability varies'
              ]}
            />
          </div>

          <div className="mt-6 p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Info className="w-4 h-4 text-blue-400" />
              <span className="text-sm font-medium text-blue-400">Research Note</span>
            </div>
            <p className="text-sm text-gray-300">
              Plausibility scores are subjective estimates based on general research consensus.
              Individual patterns may have specific factors that shift these assessments. We
              encourage researchers to evaluate evidence independently.
            </p>
          </div>
        </section>

        {/* Section 6: Quality Flags */}
        <section id="quality" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            6. Quality Flags & Warnings
          </h2>

          <p className="text-gray-300 mb-6">
            Patterns are automatically tagged with quality indicators to help researchers quickly
            assess data reliability.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            <QualityFlagItem
              flag="low_sample_size"
              label="Small Sample"
              description="Fewer than 10 reports - results may not be statistically robust"
              severity="warning"
            />
            <QualityFlagItem
              flag="short_time_window"
              label="Recent Pattern"
              description="Less than 30 days of data - pattern may be transient"
              severity="info"
            />
            <QualityFlagItem
              flag="single_category"
              label="Single Category"
              description="All reports in one category - may indicate specific phenomenon"
              severity="info"
            />
            <QualityFlagItem
              flag="no_precise_location"
              label="Approximate Location"
              description="Lacks precise coordinates - geographic analysis limited"
              severity="warning"
            />
            <QualityFlagItem
              flag="well_established"
              label="Well Established"
              description="Over 100 reports spanning more than a year"
              severity="positive"
            />
            <QualityFlagItem
              flag="multi_phenomenon"
              label="Multi-Phenomenon"
              description="Multiple phenomenon types reported - complex activity zone"
              severity="positive"
            />
          </div>
        </section>

        {/* Section 7: Limitations */}
        <section id="limitations" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-gray-500/20 flex items-center justify-center">
              <AlertTriangle className="w-4 h-4 text-gray-400" />
            </div>
            7. Limitations & Caveats
          </h2>

          <div className="glass-card p-6">
            <p className="text-gray-300 mb-6">
              This system analyzes <em>reports</em> of paranormal phenomena, not the phenomena
              themselves. Results should be interpreted with the following limitations in mind:
            </p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">1</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">Selection Bias</h4>
                  <p className="text-sm text-gray-400">
                    The database represents reports that were submitted, not all experiences that
                    occurred. Many experiences go unreported, and reporting propensity varies by
                    region, culture, and phenomenon type.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">2</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">Verification Challenges</h4>
                  <p className="text-sm text-gray-400">
                    Most reports cannot be independently verified. Accuracy of locations, dates, and
                    descriptions depends on witness memory and honesty. Some reports may be
                    misidentifications, hoaxes, or fabrications.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">3</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">Temporal Inconsistency</h4>
                  <p className="text-sm text-gray-400">
                    Historical data density varies significantly. Recent years have far more reports
                    than earlier decades, which may reflect increased reporting rather than
                    increased activity.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">4</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">Geographic Coverage</h4>
                  <p className="text-sm text-gray-400">
                    English-language reports from North America are overrepresented. Patterns in
                    other regions may be underdetected due to limited data rather than absence of
                    activity.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">5</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">Algorithm Limitations</h4>
                  <p className="text-sm text-gray-400">
                    Each algorithm has specific assumptions and edge cases where it may produce
                    misleading results. See individual algorithm sections for specific limitations.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-6 h-6 rounded bg-amber-500/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-amber-400 text-sm">6</span>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-white mb-1">No Causal Claims</h4>
                  <p className="text-sm text-gray-400">
                    This system identifies correlations and patterns, not causes. A detected pattern
                    does not prove any particular explanation—mundane or anomalous.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Section 8: Glossary */}
        <section id="glossary" className="mb-16">
          <h2 className="text-2xl font-display font-semibold text-white mb-6 flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <BookOpen className="w-4 h-4 text-indigo-400" />
            </div>
            8. Glossary of Terms
          </h2>

          <div className="glass-card p-6">
            <div className="grid gap-4">
              {[
                {
                  term: 'Confidence Interval',
                  definition:
                    'A range of values that likely contains the true value. A 95% CI means we expect the true value to fall within this range 95% of the time.'
                },
                {
                  term: "Cohen's d",
                  definition:
                    'A standardized measure of effect size expressing the difference between two means in standard deviation units.'
                },
                {
                  term: 'DBSCAN',
                  definition:
                    'Density-Based Spatial Clustering of Applications with Noise. An algorithm that groups nearby points and identifies outliers.'
                },
                {
                  term: 'Effect Size',
                  definition:
                    'A quantitative measure of the magnitude of a phenomenon. Unlike p-values, effect size indicates practical significance.'
                },
                {
                  term: 'Epsilon (ε)',
                  definition:
                    'In DBSCAN, the maximum distance between two points for them to be considered neighbors.'
                },
                {
                  term: 'Flap/Wave',
                  definition:
                    'A period of concentrated sighting activity in a particular area, often appearing to spread geographically over time.'
                },
                {
                  term: 'PostGIS',
                  definition:
                    'A spatial database extension for PostgreSQL that enables geographic queries and analysis.'
                },
                {
                  term: 'Wilson Score Interval',
                  definition:
                    'A method for calculating confidence intervals that performs well with small sample sizes and extreme proportions.'
                },
                {
                  term: 'Z-Score',
                  definition:
                    'The number of standard deviations a value is from the mean. Used to identify statistical outliers.'
                }
              ].map((item, i) => (
                <div key={i} className="flex gap-4 p-3 bg-gray-800/30 rounded-lg">
                  <span className="text-primary-400 font-medium min-w-[160px]">{item.term}</span>
                  <span className="text-gray-400 text-sm">{item.definition}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Footer */}
        <div className="glass-card p-6 text-center">
          <p className="text-sm text-gray-400 mb-4">
            Questions about our methodology? Suggestions for improvement?
          </p>
          <p className="text-sm text-gray-500">
            Contact us at{' '}
            <a href="mailto:research@paradocs.io" className="text-primary-400 hover:underline">
              research@paradocs.io
            </a>
          </p>
          <p className="text-xs text-gray-600 mt-4">
            Last updated: {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            {' · '}ParaDocs Pattern Detection v1.0
          </p>
        </div>
      </div>
    </Layout>
  )
}
