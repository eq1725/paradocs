/**
 * Analytics Dashboard Page
 *
 * Visualize report statistics, trends, and patterns
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { useSubscription } from '@/lib/hooks/useSubscription'
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  Globe,
  Folder,
  Camera,
  Calendar,
  AlertCircle,
  Loader2,
  Lock,
  ArrowRight
} from 'lucide-react'
import Link from 'next/link'

interface AnalyticsData {
  overview: {
    total_reports: number
    reports_this_month: number
    reports_change: number
    categories_count: number
    countries_count: number
    avg_credibility: number
  }
  reports_by_category: Array<{
    category: string
    count: number
    percentage: number
  }>
  reports_by_country: Array<{
    country: string
    count: number
    percentage: number
  }>
  reports_by_month: Array<{
    month: string
    count: number
  }>
  reports_by_credibility: Array<{
    credibility: string
    count: number
    percentage: number
  }>
  recent_trends: {
    most_active_category: string
    most_active_country: string
    peak_month: string
    reports_with_media: number
    media_percentage: number
  }
}

// Category colors for visualization
const categoryColors: Record<string, string> = {
  ufo: '#8b5cf6',
  ghost: '#06b6d4',
  cryptid: '#22c55e',
  alien: '#f97316',
  paranormal: '#ec4899',
  unexplained: '#eab308',
  other: '#6b7280'
}

// Credibility colors
const credibilityColors: Record<string, string> = {
  verified: '#22c55e',
  credible: '#3b82f6',
  unverified: '#f97316',
  disputed: '#ef4444'
}

function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  trend
}: {
  label: string
  value: string | number
  subValue?: string
  icon: React.ElementType
  trend?: { value: number; positive: boolean }
}) {
  return (
    <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-gray-400 text-sm mb-1">{label}</p>
          <p className="text-2xl font-bold text-white">{value}</p>
          {subValue && (
            <p className="text-sm text-gray-500 mt-1">{subValue}</p>
          )}
          {trend && (
            <div className={`flex items-center gap-1 text-sm mt-1 ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
              {trend.positive ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
              <span>{trend.positive ? '+' : ''}{trend.value}% vs last month</span>
            </div>
          )}
        </div>
        <div className="p-3 bg-gray-800 rounded-lg">
          <Icon className="w-6 h-6 text-purple-400" />
        </div>
      </div>
    </div>
  )
}

function BarChartSimple({
  data,
  colorKey,
  colors
}: {
  data: Array<{ label: string; value: number; percentage: number }>
  colorKey?: string
  colors?: Record<string, string>
}) {
  const maxValue = Math.max(...data.map(d => d.value))

  return (
    <div className="space-y-3">
      {data.map((item, i) => (
        <div key={i} className="space-y-1">
          <div className="flex justify-between text-sm">
            <span className="text-gray-300 capitalize">{item.label.replace(/_/g, ' ')}</span>
            <span className="text-gray-400">{item.value} ({item.percentage}%)</span>
          </div>
          <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${(item.value / maxValue) * 100}%`,
                backgroundColor: colors?.[item.label.toLowerCase()] || '#9333ea'
              }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function LineChartSimple({ data }: { data: Array<{ label: string; value: number }> }) {
  const maxValue = Math.max(...data.map(d => d.value), 1)
  const minValue = Math.min(...data.map(d => d.value))
  const range = maxValue - minValue || 1

  const points = data.map((d, i) => ({
    x: (i / (data.length - 1)) * 100,
    y: 100 - ((d.value - minValue) / range) * 80 - 10
  }))

  const pathD = points.length > 0
    ? `M ${points.map(p => `${p.x} ${p.y}`).join(' L ')}`
    : ''

  return (
    <div className="relative">
      <svg viewBox="0 0 100 100" className="w-full h-48" preserveAspectRatio="none">
        {/* Grid lines */}
        <line x1="0" y1="25" x2="100" y2="25" stroke="#374151" strokeWidth="0.5" />
        <line x1="0" y1="50" x2="100" y2="50" stroke="#374151" strokeWidth="0.5" />
        <line x1="0" y1="75" x2="100" y2="75" stroke="#374151" strokeWidth="0.5" />

        {/* Area fill */}
        <path
          d={`${pathD} L 100 100 L 0 100 Z`}
          fill="url(#gradient)"
          opacity="0.3"
        />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="#9333ea"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Points */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r="2"
            fill="#9333ea"
            className="hover:r-3 transition-all"
          />
        ))}

        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9333ea" />
            <stop offset="100%" stopColor="transparent" />
          </linearGradient>
        </defs>
      </svg>

      {/* X-axis labels */}
      <div className="flex justify-between text-xs text-gray-500 mt-2">
        {data.filter((_, i) => i % 3 === 0 || i === data.length - 1).map((d, i) => (
          <span key={i}>{d.label.split(' ')[0]}</span>
        ))}
      </div>
    </div>
  )
}

function UpgradePrompt() {
  return (
    <div className="flex flex-col items-center justify-center h-full py-12 text-center">
      <div className="p-4 bg-gray-800 rounded-full mb-4">
        <Lock className="w-8 h-8 text-gray-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">Analytics is a Pro Feature</h3>
      <p className="text-gray-400 mb-6 max-w-md">
        Upgrade to Pro or Researcher to access detailed analytics, visualizations,
        and insights about paranormal activity trends.
      </p>
      <Link
        href="/dashboard/subscription"
        className="inline-flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
      >
        Upgrade Now
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  )
}

export default function AnalyticsPage() {
  const router = useRouter()
  const { subscription, tierName, loading: subLoading } = useSubscription()
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Check if user has analytics access (pro or researcher)
  const hasAnalyticsAccess = tierName === 'pro' || tierName === 'researcher'

  useEffect(() => {
    if (!subLoading && hasAnalyticsAccess) {
      fetchAnalytics()
    } else if (!subLoading && !hasAnalyticsAccess) {
      setLoading(false)
    }
  }, [subLoading, hasAnalyticsAccess])

  const fetchAnalytics = async () => {
    try {
      const res = await fetch('/api/analytics')
      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch analytics')
      }

      setAnalytics(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading || subLoading) {
    return (
      <DashboardLayout title="Analytics">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-purple-400 animate-spin" />
        </div>
      </DashboardLayout>
    )
  }

  if (!hasAnalyticsAccess) {
    return (
      <DashboardLayout title="Analytics">
        <UpgradePrompt />
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout title="Analytics">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Analytics</h2>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  if (!analytics) {
    return (
      <DashboardLayout title="Analytics">
        <div className="text-center py-12 text-gray-400">
          No analytics data available
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout title="Analytics">
      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          label="Total Reports"
          value={analytics.overview.total_reports.toLocaleString()}
          icon={BarChart3}
        />
        <StatCard
          label="Reports This Month"
          value={analytics.overview.reports_this_month}
          icon={Calendar}
          trend={{
            value: analytics.overview.reports_change,
            positive: analytics.overview.reports_change >= 0
          }}
        />
        <StatCard
          label="Categories"
          value={analytics.overview.categories_count}
          subValue={`Most active: ${analytics.recent_trends.most_active_category}`}
          icon={Folder}
        />
        <StatCard
          label="Countries"
          value={analytics.overview.countries_count}
          subValue={`Most active: ${analytics.recent_trends.most_active_country}`}
          icon={Globe}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Reports Over Time */}
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Reports Over Time</h3>
          <LineChartSimple
            data={analytics.reports_by_month.map(d => ({
              label: d.month,
              value: d.count
            }))}
          />
          <p className="text-sm text-gray-400 mt-4">
            Peak activity: <span className="text-purple-400">{analytics.recent_trends.peak_month}</span>
          </p>
        </div>

        {/* Reports by Category */}
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Reports by Category</h3>
          <BarChartSimple
            data={analytics.reports_by_category.map(d => ({
              label: d.category,
              value: d.count,
              percentage: d.percentage
            }))}
            colors={categoryColors}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Reports by Country */}
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Reports by Country</h3>
          <BarChartSimple
            data={analytics.reports_by_country.map(d => ({
              label: d.country,
              value: d.count,
              percentage: d.percentage
            }))}
          />
        </div>

        {/* Credibility Distribution */}
        <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-6">Credibility Distribution</h3>
          <BarChartSimple
            data={analytics.reports_by_credibility.map(d => ({
              label: d.credibility,
              value: d.count,
              percentage: d.percentage
            }))}
            colors={credibilityColors}
          />
        </div>
      </div>

      {/* Media Stats */}
      <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
        <h3 className="text-lg font-semibold text-white mb-4">Media & Evidence</h3>
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gray-800 rounded-lg">
              <Camera className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <p className="text-2xl font-bold text-white">{analytics.recent_trends.reports_with_media}</p>
              <p className="text-gray-400 text-sm">Reports with Photos/Videos</p>
            </div>
          </div>
          <div className="h-12 w-px bg-gray-800" />
          <div>
            <p className="text-2xl font-bold text-white">{analytics.recent_trends.media_percentage}%</p>
            <p className="text-gray-400 text-sm">of all reports include media</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
