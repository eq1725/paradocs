/**
 * Dashboard Overview Page
 *
 * Main dashboard showing user stats, usage, and quick actions.
 */

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileText,
  Bookmark,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Sparkles,
  BarChart3,
  Stars
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UsageMeter } from '@/components/dashboard/UsageMeter'
import { UpgradeCard } from '@/components/dashboard/UpgradeCard'
import { TierBadge } from '@/components/dashboard/TierBadge'
import ResearchStreak from '@/components/dashboard/ResearchStreak'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import type { TierName } from '@/lib/subscription'

interface DashboardStats {
  profile: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    reputation_score: number
    member_since: string
  }
  reports: {
    total: number
    pending: number
    approved: number
    rejected: number
  }
  saved: {
    total: number
  }
  subscription: {
    tier: TierName
    tier_display: string
    status: string
    usage: {
      reports_submitted: number
      reports_saved: number
      api_calls_made: number
    }
    limits: {
      reports_per_month: number
      saved_reports_max: number
      api_calls_per_month: number
    }
    canSubmitReport: boolean
    canSaveReport: boolean
  } | null
  recent_activity: Array<{
    id: string
    title: string
    slug: string
    status: string
    created_at: string
  }>
}

function StatCard({
  label,
  value,
  icon: Icon,
  trend,
  href
}: {
  label: string
  value: number | string
  icon: React.ElementType
  trend?: { value: number; positive: boolean }
  href?: string
}) {
  const content = (
    <div className="p-4 sm:p-6 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors">
      <div className="flex items-center gap-3 sm:gap-4">
        <div className="p-2.5 sm:p-3 bg-gray-800 rounded-lg shrink-0">
          <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-purple-400" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-gray-400 text-xs sm:text-sm truncate">{label}</p>
          <p className="text-xl sm:text-2xl font-bold text-white">{value}</p>
          {trend && (
            <p className={`text-xs sm:text-sm ${trend.positive ? 'text-green-400' : 'text-red-400'}`}>
              {trend.positive ? '+' : ''}{trend.value}%
            </p>
          )}
        </div>
      </div>
    </div>
  )

  if (href) {
    return <Link href={href}>{content}</Link>
  }

  return content
}

function RecentActivityItem({
  report
}: {
  report: {
    id: string
    title: string
    slug: string
    status: string
    created_at: string
  }
}) {
  const statusConfig = {
    pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/30' },
    approved: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30' },
    rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30' },
    draft: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-800' }
  }

  const config = statusConfig[report.status as keyof typeof statusConfig] || statusConfig.draft
  const Icon = config.icon

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  return (
    <Link
      href={`/report/${report.slug}`}
      className="flex items-center gap-4 p-4 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
    >
      <div className={`p-2 rounded-lg ${config.bg}`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white font-medium truncate">{report.title}</p>
        <p className="text-sm text-gray-400">{formatDate(report.created_at)}</p>
      </div>
      <span className={`text-sm ${config.color} capitalize`}>{report.status}</span>
    </Link>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { tierName, isPaidTier, loading: subscriptionLoading } = useSubscription()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()

        if (!session) {
          router.push('/login')
          return
        }

        const response = await fetch('/api/user/stats', {
          headers: {
            'Authorization': `Bearer ${session.access_token}`
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch stats')
        }

        const data = await response.json()
        setStats(data)
      } catch (err) {
        console.error('Error fetching stats:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [router])

  if (loading || subscriptionLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-32 bg-gray-900 rounded-xl animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-96 bg-gray-900 rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  if (error) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Dashboard</h2>
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

  return (
    <DashboardLayout title="Dashboard">
      {/* Welcome Section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          Welcome back{stats?.profile.display_name ? `, ${stats.profile.display_name}` : ''}!
        </h2>
        <p className="text-gray-400">
          Here's an overview of your paranormal research activity.
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
        <StatCard
          label="Total Reports"
          value={stats?.reports.total || 0}
          icon={FileText}
          href="/dashboard/reports"
        />
        <StatCard
          label="Approved"
          value={stats?.reports.approved || 0}
          icon={CheckCircle}
        />
        <StatCard
          label="Pending Review"
          value={stats?.reports.pending || 0}
          icon={Clock}
        />
        <StatCard
          label="Saved Reports"
          value={stats?.saved.total || 0}
          icon={Bookmark}
          href="/dashboard/saved"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Main Content Area */}
        <div className="lg:col-span-2 space-y-6">
          {/* Usage Overview */}
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Usage This Month</h3>
              {tierName && <TierBadge tier={tierName} size="sm" />}
            </div>

            <div className="space-y-6">
              <UsageMeter
                label="Reports Submitted"
                current={stats?.subscription?.usage.reports_submitted || 0}
                limit={stats?.subscription?.limits.reports_per_month || 5}
                icon={<FileText className="w-4 h-4" />}
              />
              <UsageMeter
                label="Saved Reports"
                current={stats?.subscription?.usage.reports_saved || 0}
                limit={stats?.subscription?.limits.saved_reports_max || 10}
                icon={<Bookmark className="w-4 h-4" />}
              />
              {isPaidTier && stats?.subscription?.limits.api_calls_per_month !== undefined && (
                <UsageMeter
                  label="API Calls"
                  current={stats?.subscription?.usage.api_calls_made || 0}
                  limit={stats?.subscription?.limits.api_calls_per_month}
                  icon={<BarChart3 className="w-4 h-4" />}
                />
              )}
            </div>
          </div>

          {/* Recent Activity */}
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-white">Recent Activity</h3>
              <Link
                href="/dashboard/reports"
                className="text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
              >
                View All
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>

            {stats?.recent_activity && stats.recent_activity.length > 0 ? (
              <div className="space-y-3">
                {stats.recent_activity.map(report => (
                  <RecentActivityItem key={report.id} report={report} />
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <FileText className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                <p className="text-gray-400">No recent activity</p>
                <Link
                  href="/submit"
                  className="inline-block mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
                >
                  Submit Your First Report
                </Link>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          {/* Constellation Preview */}
          <Link
            href="/dashboard/constellation"
            className="block p-6 bg-gray-950 rounded-xl border border-gray-800 hover:border-primary-500/30 transition-all group overflow-hidden relative"
          >
            {/* Decorative background stars */}
            <div className="absolute inset-0 opacity-30">
              {[
                { x: '15%', y: '20%', s: 2 }, { x: '80%', y: '15%', s: 1.5 },
                { x: '45%', y: '70%', s: 2.5 }, { x: '70%', y: '45%', s: 1 },
                { x: '25%', y: '80%', s: 1.8 }, { x: '90%', y: '75%', s: 1.2 },
                { x: '55%', y: '25%', s: 2 }, { x: '10%', y: '55%', s: 1.5 },
              ].map((star, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-primary-400"
                  style={{
                    left: star.x,
                    top: star.y,
                    width: `${star.s}px`,
                    height: `${star.s}px`,
                    boxShadow: `0 0 ${star.s * 2}px rgba(139, 92, 246, 0.5)`,
                  }}
                />
              ))}
            </div>
            <div className="relative">
              <div className="flex items-center gap-2 mb-2">
                <Stars className="w-5 h-5 text-primary-400" />
                <h3 className="text-lg font-semibold text-white group-hover:text-primary-300 transition-colors">My Constellation</h3>
              </div>
              <p className="text-gray-400 text-sm mb-3">
                Explore your research universe — see how phenomena connect and discover new fields.
              </p>
              <span className="text-primary-400 text-sm flex items-center gap-1 group-hover:gap-2 transition-all">
                View Map <ArrowRight className="w-4 h-4" />
              </span>
            </div>
          </Link>

          {/* Research Streak */}
          <ResearchStreak compact />

          {/* Quick Actions */}
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="text-lg font-semibold text-white mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <Link
                href="/submit"
                className="flex items-center gap-3 p-3 bg-purple-600 hover:bg-purple-500 rounded-lg text-white transition-colors"
              >
                <FileText className="w-5 h-5" />
                <span className="font-medium">Submit New Report</span>
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors"
              >
                <TrendingUp className="w-5 h-5" />
                <span>Explore Sightings Map</span>
              </Link>
              <Link
                href="/insights"
                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 transition-colors"
              >
                <Sparkles className="w-5 h-5" />
                <span>View AI Insights</span>
              </Link>
            </div>
          </div>

          {/* Upgrade Card (for non-enterprise users) */}
          {tierName && tierName !== 'enterprise' && (
            <UpgradeCard currentTier={tierName} variant="full" />
          )}

          {/* Reputation Score */}
          <div className="p-6 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="text-lg font-semibold text-white mb-4">Reputation Score</h3>
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20">
                <svg className="w-full h-full transform -rotate-90">
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="#374151"
                    strokeWidth="8"
                  />
                  <circle
                    cx="40"
                    cy="40"
                    r="36"
                    fill="none"
                    stroke="#9333ea"
                    strokeWidth="8"
                    strokeDasharray={`${(stats?.profile.reputation_score || 0) * 2.26} 226`}
                    strokeLinecap="round"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-white">
                    {stats?.profile.reputation_score || 0}
                  </span>
                </div>
              </div>
              <div>
                <p className="text-gray-400 text-sm">
                  Based on your report accuracy and community engagement.
                </p>
                <Link
                  href="/faq#reputation"
                  className="text-sm text-purple-400 hover:text-purple-300"
                >
                  Learn more →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
