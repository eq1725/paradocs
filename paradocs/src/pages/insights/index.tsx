import React, { useState, useEffect } from 'react'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { PatternCard, Pattern } from '@/components/patterns'
import {
  TrendingUp,
  Filter,
  Loader2,
  MapPin,
  Calendar,
  Activity,
  Sparkles
} from 'lucide-react'

const PATTERN_TYPES = [
  { value: '', label: 'All Types' },
  { value: 'geographic_cluster', label: 'Geographic Clusters' },
  { value: 'temporal_anomaly', label: 'Temporal Anomalies' },
  { value: 'seasonal_pattern', label: 'Seasonal Patterns' },
  { value: 'flap_wave', label: 'Flap Waves' },
  { value: 'characteristic_correlation', label: 'Correlations' }
]

const STATUS_FILTERS = [
  { value: 'active,emerging', label: 'Active & Emerging' },
  { value: 'active', label: 'Active Only' },
  { value: 'emerging', label: 'Emerging Only' },
  { value: 'historical', label: 'Historical' }
]

export default function InsightsPage() {
  const [patterns, setPatterns] = useState<Pattern[]>([])
  const [loading, setLoading] = useState(true)
  const [typeFilter, setTypeFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('active,emerging')

  useEffect(() => {
    async function fetchPatterns() {
      setLoading(true)
      try {
        const params = new URLSearchParams({
          limit: '50',
          status: statusFilter
        })
        if (typeFilter) params.append('type', typeFilter)

        const response = await fetch(`/api/patterns?${params}`)
        if (response.ok) {
          const data = await response.json()
          setPatterns(data.patterns || [])
        }
      } catch (error) {
        console.error('Failed to fetch patterns:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchPatterns()
  }, [typeFilter, statusFilter])

  // Group patterns by type for the overview
  const patternsByType = patterns.reduce((acc, pattern) => {
    const type = pattern.pattern_type
    if (!acc[type]) acc[type] = []
    acc[type].push(pattern)
    return acc
  }, {} as Record<string, Pattern[]>)

  const stats = [
    {
      icon: TrendingUp,
      label: 'Active Patterns',
      value: patterns.filter(p => p.status === 'active').length,
      color: 'text-green-400'
    },
    {
      icon: Sparkles,
      label: 'Emerging',
      value: patterns.filter(p => p.status === 'emerging').length,
      color: 'text-amber-400'
    },
    {
      icon: MapPin,
      label: 'Geographic Clusters',
      value: patternsByType['geographic_cluster']?.length || 0,
      color: 'text-emerald-400'
    },
    {
      icon: Calendar,
      label: 'Temporal Patterns',
      value: (patternsByType['temporal_anomaly']?.length || 0) +
             (patternsByType['seasonal_pattern']?.length || 0),
      color: 'text-cyan-400'
    }
  ]

  return (
    <Layout>
      <Head>
        <title>Pattern Insights | ParaDocs</title>
        <meta
          name="description"
          content="Explore AI-detected patterns in paranormal report data including geographic clusters, temporal anomalies, and correlations."
        />
      </Head>

      <div className="py-8">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
            Pattern Insights
          </h1>
          <p className="text-gray-400 max-w-2xl mx-auto">
            Our AI analyzes thousands of reports to detect emerging patterns,
            geographic hotspots, and temporal anomalies in paranormal activity.
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {stats.map((stat, index) => (
            <div key={index} className="glass-card p-4 text-center">
              <stat.icon className={`w-6 h-6 ${stat.color} mx-auto mb-2`} />
              <p className="text-2xl font-bold text-white">{stat.value}</p>
              <p className="text-sm text-gray-400">{stat.label}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="glass-card p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              <span className="text-sm text-gray-400">Filters:</span>
            </div>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {PATTERN_TYPES.map(type => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="bg-gray-800/50 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {STATUS_FILTERS.map(status => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-500 ml-auto">
              {patterns.length} patterns found
            </span>
          </div>
        </div>

        {/* Pattern Grid */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
          </div>
        ) : patterns.length === 0 ? (
          <div className="glass-card p-12 text-center">
            <Activity className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-white mb-2">
              No Patterns Found
            </h3>
            <p className="text-gray-400">
              No patterns match your current filters. Try adjusting your search criteria.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {patterns.map(pattern => (
              <PatternCard key={pattern.id} pattern={pattern} variant="featured" />
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-12 glass-card p-6">
          <h2 className="text-xl font-display font-semibold text-white mb-4">
            About Pattern Detection
          </h2>
          <div className="grid md:grid-cols-2 gap-6 text-sm text-gray-400">
            <div>
              <h3 className="text-white font-medium mb-2">How It Works</h3>
              <p>
                Our system uses statistical algorithms including DBSCAN clustering
                and z-score analysis to identify significant patterns in report data.
                Geographic clusters are detected using PostGIS spatial functions,
                while temporal anomalies are flagged when activity deviates significantly
                from baseline levels.
              </p>
            </div>
            <div>
              <h3 className="text-white font-medium mb-2">AI-Enhanced Analysis</h3>
              <p>
                Each detected pattern is analyzed by Claude, an advanced AI model,
                to generate narrative insights that explain potential significance,
                historical context, and research implications. These insights are
                updated automatically as new reports are added to the database.
              </p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  )
}
