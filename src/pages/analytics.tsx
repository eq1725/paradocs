'use client'

/**
 * Enhanced Analytics Page
 *
 * Comprehensive analytics dashboard featuring:
 * - Real-time activity monitoring (Phenomenon Pulse)
 * - Temporal pattern analysis (Time Heatmaps)
 * - Geographic hotspots visualization
 * - Evidence and source analysis
 * - AI-detected emerging patterns
 * - Correlation explorer
 * - Category and credibility breakdowns
 */

import React, { useEffect, useState } from 'react'
import Head from 'next/head'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, AreaChart, Area
} from 'recharts'
import {
  FileText, Eye, MapPin, TrendingUp, Calendar, Activity,
  BarChart3, Sparkles, RefreshCw, Clock
} from 'lucide-react'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import StatsCard from '@/components/StatsCard'
import PhenomenonPulse from '@/components/analytics/PhenomenonPulse'
import EmergingPatternsAlert from '@/components/analytics/EmergingPatternsAlert'
import TimeHeatmap from '@/components/analytics/TimeHeatmap'
import EvidenceAnalysis from '@/components/analytics/EvidenceAnalysis'
import CorrelationExplorer from '@/components/analytics/CorrelationExplorer'
import GeographicHotspots from '@/components/analytics/GeographicHotspots'

interface AnalyticsData {
  basicStats: {
    totalReports: number
    totalViews: number
    countriesCount: number
    thisMonthReports: number
    monthOverMonthChange: number
    last24hReports: number
    last7dReports: number
  }
  categoryBreakdown: { category: string; count: number }[]
  countryBreakdown: { country: string; count: number }[]
  monthlyTrend: { month: string; monthKey: string; count: number; byCategory: Record<string, number> }[]
  credibilityBreakdown: { name: string; value: number }[]
  timeOfDayData: { hour: number; label: string; count: number; byCategory: Record<string, number> }[]
  dayOfWeekData: { day: number; name: string; shortName: string; count: number; byCategory: Record<string, number> }[]
  evidenceAnalysis: {
    total: number
    withPhotoVideo: { count: number; percentage: number }
    withPhysicalEvidence: { count: number; percentage: number }
    withOfficialReport: { count: number; percentage: number }
    withAnyEvidence: { count: number; percentage: number }
  }
  sourceAnalysis: { source: string; count: number }[]
  recentActivity: {
    id: string
    title: string
    slug: string
    category: PhenomenonCategory
    location_name?: string
    country?: string
    created_at: string
    view_count: number
  }[]
  emergingPatterns: {
    id: string
    pattern_type: string
    ai_title?: string
    ai_summary?: string
    report_count: number
    confidence_score: number
    significance_score: number
    categories: string[]
    first_detected_at: string
    last_updated_at: string
    status: 'active' | 'emerging'
  }[]
  witnessStats: {
    totalReports: number
    totalWitnesses: number
    averageWitnessCount: string
    reportsWithMultipleWitnesses: number
    submitterWasWitness: number
    anonymousSubmissions: number
    anonymousPercentage: number
  }
  generatedAt: string
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'temporal' | 'geographic' | 'evidence'>('overview')

  useEffect(() => {
    loadAnalytics()
  }, [])

  async function loadAnalytics(isRefresh = false) {
    try {
      if (isRefresh) setRefreshing(true)
      else setLoading(true)

      const response = await fetch('/api/analytics/enhanced')
      if (!response.ok) throw new Error('Failed to fetch analytics')

      const analyticsData = await response.json()
      setData(analyticsData)
      setError(null)
    } catch (err) {
      console.error('Error loading analytics:', err)
      setError('Failed to load analytics data')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const COLORS = ['#22c55e', '#f59e0b', '#a855f7', '#ef4444', '#3b82f6', '#14b8a6', '#ec4899', '#6b7280']

  const CREDIBILITY_COLORS: Record<string, string> = {
    confirmed: '#22c55e',
    high: '#3b82f6',
    medium: '#f59e0b',
    low: '#f97316',
    unverified: '#6b7280',
  }

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-48 mb-8" />
        <div className="grid md:grid-cols-4 gap-6 mb-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="skeleton h-32" />
          ))}
        </div>
        <div className="grid md:grid-cols-2 gap-6 mb-6">
          <div className="skeleton h-96" />
          <div className="skeleton h-96" />
        </div>
        <div className="skeleton h-80 mb-6" />
        <div className="grid md:grid-cols-2 gap-6">
          <div className="skeleton h-80" />
          <div className="skeleton h-80" />
        </div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="glass-card p-8 text-center">
          <Activity className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Unable to Load Analytics</h2>
          <p className="text-gray-400 mb-4">{error || 'Something went wrong'}</p>
          <button
            onClick={() => loadAnalytics()}
            className="btn-primary"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <>
      <Head>
        <title>Analytics - ParaDocs</title>
        <meta name="description" content="Explore patterns and trends across paranormal phenomena with advanced analytics and AI-powered insights." />
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-display font-bold text-white flex items-center gap-3">
              <BarChart3 className="w-8 h-8 text-primary-400" />
              Analytics Dashboard
            </h1>
            <p className="mt-2 text-gray-400">
              Discover patterns and trends across {data.basicStats.totalReports.toLocaleString()} documented phenomena
            </p>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Updated {new Date(data.generatedAt).toLocaleTimeString()}
            </span>
            <button
              onClick={() => loadAnalytics(true)}
              disabled={refreshing}
              className="btn-secondary text-sm flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8 overflow-x-auto pb-2">
          {[
            { id: 'overview', label: 'Overview', icon: Sparkles },
            { id: 'temporal', label: 'Temporal', icon: Calendar },
            { id: 'geographic', label: 'Geographic', icon: MapPin },
            { id: 'evidence', label: 'Evidence', icon: FileText },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                  : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10 hover:text-white'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Stats Cards - Always visible */}
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <StatsCard
            title="Total Reports"
            value={data.basicStats.totalReports.toLocaleString()}
            icon={FileText}
            color="primary"
            change={data.basicStats.monthOverMonthChange !== 0 ? data.basicStats.monthOverMonthChange : undefined}
          />
          <StatsCard
            title="Total Views"
            value={data.basicStats.totalViews.toLocaleString()}
            icon={Eye}
            color="green"
          />
          <StatsCard
            title="Countries"
            value={data.basicStats.countriesCount}
            icon={MapPin}
            color="amber"
          />
          <StatsCard
            title="This Month"
            value={`+${data.basicStats.thisMonthReports}`}
            icon={TrendingUp}
            color="purple"
          />
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Emerging Patterns Alert - if any */}
            {data.emergingPatterns.length > 0 && (
              <div className="mb-8">
                <EmergingPatternsAlert patterns={data.emergingPatterns} />
              </div>
            )}

            {/* Main content grid */}
            <div className="grid lg:grid-cols-3 gap-6 mb-8">
              {/* Left column - Pulse and Correlation */}
              <div className="lg:col-span-2 space-y-6">
                <PhenomenonPulse
                  recentActivity={data.recentActivity}
                  last24hReports={data.basicStats.last24hReports}
                  last7dReports={data.basicStats.last7dReports}
                  categoryBreakdown={data.categoryBreakdown}
                />

                {/* Category breakdown chart */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary-400" />
                    Reports by Category
                  </h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.categoryBreakdown} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                      <XAxis type="number" stroke="#6b7280" />
                      <YAxis
                        type="category"
                        dataKey="category"
                        stroke="#6b7280"
                        width={100}
                        tickFormatter={(cat) => CATEGORY_CONFIG[cat as PhenomenonCategory]?.label || cat}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(20,20,35,0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string, props: any) => [
                          value,
                          CATEGORY_CONFIG[props.payload.category as PhenomenonCategory]?.label || props.payload.category
                        ]}
                      />
                      <Bar
                        dataKey="count"
                        radius={[0, 4, 4, 0]}
                      >
                        {data.categoryBreakdown.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CATEGORY_CONFIG[entry.category as PhenomenonCategory]?.color || COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Right column - Correlation Explorer */}
              <div className="space-y-6">
                <CorrelationExplorer
                  timeOfDayData={data.timeOfDayData}
                  dayOfWeekData={data.dayOfWeekData}
                  categoryData={data.categoryBreakdown}
                  credibilityData={data.credibilityBreakdown}
                />

                {/* Credibility pie chart */}
                <div className="glass-card p-6">
                  <h3 className="text-lg font-medium text-white mb-4">Credibility Distribution</h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie
                        data={data.credibilityBreakdown}
                        cx="50%"
                        cy="50%"
                        innerRadius={40}
                        outerRadius={70}
                        paddingAngle={2}
                        dataKey="value"
                        nameKey="name"
                      >
                        {data.credibilityBreakdown.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={CREDIBILITY_COLORS[entry.name] || COLORS[index % COLORS.length]}
                          />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          background: 'rgba(20,20,35,0.95)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '8px',
                        }}
                        formatter={(value: number, name: string) => [
                          value,
                          name.charAt(0).toUpperCase() + name.slice(1)
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="flex flex-wrap justify-center gap-3 mt-2">
                    {data.credibilityBreakdown.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-2">
                        <div
                          className="w-2 h-2 rounded-full"
                          style={{ background: CREDIBILITY_COLORS[item.name] || COLORS[i] }}
                        />
                        <span className="text-xs text-gray-400 capitalize">{item.name}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Monthly trend */}
            <div className="glass-card p-6 mb-8">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-green-400" />
                Monthly Reports Trend
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={data.monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="month" stroke="#6b7280" />
                  <YAxis stroke="#6b7280" />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(20,20,35,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                  />
                  <defs>
                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#5b63f1" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#5b63f1" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <Area
                    type="monotone"
                    dataKey="count"
                    stroke="#5b63f1"
                    strokeWidth={2}
                    fill="url(#colorCount)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </>
        )}

        {/* Temporal Tab */}
        {activeTab === 'temporal' && (
          <div className="space-y-8">
            <TimeHeatmap
              timeOfDayData={data.timeOfDayData}
              dayOfWeekData={data.dayOfWeekData}
            />

            <CorrelationExplorer
              timeOfDayData={data.timeOfDayData}
              dayOfWeekData={data.dayOfWeekData}
              categoryData={data.categoryBreakdown}
              credibilityData={data.credibilityBreakdown}
            />
          </div>
        )}

        {/* Geographic Tab */}
        {activeTab === 'geographic' && (
          <div className="grid lg:grid-cols-2 gap-8">
            <GeographicHotspots
              countryData={data.countryBreakdown}
              totalReports={data.basicStats.totalReports}
            />

            {/* Country bar chart */}
            <div className="glass-card p-6">
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <MapPin className="w-5 h-5 text-emerald-400" />
                Top Reporting Countries
              </h3>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={data.countryBreakdown.slice(0, 10)} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis type="number" stroke="#6b7280" />
                  <YAxis
                    type="category"
                    dataKey="country"
                    stroke="#6b7280"
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(20,20,35,0.95)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: '8px',
                    }}
                  />
                  <Bar dataKey="count" fill="#22c55e" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Evidence Tab */}
        {activeTab === 'evidence' && (
          <EvidenceAnalysis
            evidenceData={data.evidenceAnalysis}
            sourceData={data.sourceAnalysis}
            witnessData={data.witnessStats}
          />
        )}

        {/* Footer with data freshness indicator */}
        <div className="mt-8 pt-6 border-t border-white/10 text-center">
          <p className="text-sm text-gray-500">
            Data refreshed at {new Date(data.generatedAt).toLocaleString()}
          </p>
        </div>
      </div>
    </>
  )
}
