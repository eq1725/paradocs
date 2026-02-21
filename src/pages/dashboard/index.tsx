/**
 * Dashboard Overview Page
 *
 * Engagement-focused dashboard: streak & CTA up top, smart stats,
 * recent activity, and sidebar with constellation + quick actions.
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
  Stars,
  Plus,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UsageMeter } from '@/components/dashboard/UsageMeter'
import { UpgradeCard } from '@/components/dashboard/UpgradeCard'
import { TierBadge } from '@/components/dashboard/TierBadge'
import ResearchStreak from '@/components/dashboard/ResearchStreak'
import DashboardTour, { hasDashboardTourCompleted } from '@/components/dashboard/DashboardTour'
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
    pending: { icon: Clock, color: 'text-amber-400', bg: 'bg-amber-900/30', label: 'Pending' },
    approved: { icon: CheckCircle, color: 'text-green-400', bg: 'bg-green-900/30', label: 'Approved' },
    rejected: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-900/30', label: 'Rejected' },
    draft: { icon: AlertCircle, color: 'text-gray-400', bg: 'bg-gray-800', label: 'Draft' }
  }

  const config = statusConfig[report.status as keyof typeof statusConfig] || statusConfig.draft
  const Icon = config.icon

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return 'Today'
    if (diffDays === 1) return 'Yesterday'
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }

  return (
    <Link
      href={`/report/${report.slug}`}
      className="flex items-center gap-3 p-3 bg-gray-900 rounded-lg border border-gray-800 hover:border-gray-700 transition-colors"
    >
      <div className={`p-1.5 rounded-lg ${config.bg} shrink-0`}>
        <Icon className={`w-4 h-4 ${config.color}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-white text-sm font-medium truncate">{report.title}</p>
        <p className="text-xs text-gray-500">{formatDate(report.created_at)}</p>
      </div>
      <span className={`text-xs ${config.color} shrink-0`}>{config.label}</span>
    </Link>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { tierName, isPaidTier, loading: subscriptionLoading } = useSubscription()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showDashboardTour, setShowDashboardTour] = useState(false)

  // Show dashboard tour for first-time visitors
  useEffect(() => {
    if (!loading && stats && !hasDashboardTourCompleted()) {
      const timer = setTimeout(() => setShowDashboardTour(true), 800)
      return () => clearTimeout(timer)
    }
  }, [loading, stats])

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
        <div className="space-y-4">
          <div className="h-20 bg-gray-900 rounded-xl animate-pulse" />
          <div className="grid grid-cols-3 gap-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-24 bg-gray-900 rounded-xl animate-pulse" />
            ))}
          </div>
          <div className="h-64 bg-gray-900 rounded-xl animate-pulse" />
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

  const reportsTotal = stats?.reports.total || 0
  const reportsApproved = stats?.reports.approved || 0
  const reportsPending = stats?.reports.pending || 0
  const reportsRejected = stats?.reports.rejected || 0
  const savedTotal = stats?.saved.total || 0

  return (
    <DashboardLayout title="Dashboard">
      {/* ── Hero: Welcome + Submit CTA ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Welcome back{stats?.profile.display_name ? `, ${stats.profile.display_name}` : ''}
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">
            Here&apos;s your research overview.
          </p>
        </div>
        <Link
          href="/submit"
          className="flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white rounded-lg font-medium text-sm transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          Submit Report
        </Link>
      </div>

      {/* ── Research Streak (prominent, drives daily engagement) ── */}
      <div className="mb-5">
        <ResearchStreak compact />
      </div>

      {/* ── Smart Stat Cards (3 cards: Reports, Saved, Activity) ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        {/* My Reports — shows total with status breakdown */}
        <Link
          href="/dashboard/reports"
          className="p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gray-800 rounded-lg shrink-0">
              <FileText className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">My Reports</p>
              <p className="text-2xl font-bold text-white">{reportsTotal}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {reportsApproved > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-green-400 bg-green-400/10 rounded-full px-2 py-0.5">
                <CheckCircle className="w-3 h-3" /> {reportsApproved} approved
              </span>
            )}
            {reportsPending > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-amber-400 bg-amber-400/10 rounded-full px-2 py-0.5">
                <Clock className="w-3 h-3" /> {reportsPending} pending
              </span>
            )}
            {reportsRejected > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-red-400 bg-red-400/10 rounded-full px-2 py-0.5">
                <XCircle className="w-3 h-3" /> {reportsRejected}
              </span>
            )}
            {reportsTotal === 0 && (
              <span className="text-[11px] text-gray-600">No reports yet</span>
            )}
          </div>
        </Link>

        {/* Saved Collection */}
        <Link
          href="/dashboard/saved"
          className="p-4 bg-gray-900 rounded-xl border border-gray-800 hover:border-gray-700 transition-colors group"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2 bg-gray-800 rounded-lg shrink-0">
              <Bookmark className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <p className="text-gray-500 text-xs">Saved Collection</p>
              <p className="text-2xl font-bold text-white">{savedTotal}</p>
            </div>
          </div>
          <span className="text-[11px] text-gray-500 group-hover:text-blue-400 flex items-center gap-1 transition-colors">
            Browse saved reports <ArrowRight className="w-3 h-3" />
          </span>
        </Link>

        {/* Explore — drives discovery */}
        <Link
          href="/dashboard/constellation"
          className="p-4 bg-gray-950 rounded-xl border border-gray-800 hover:border-primary-500/30 transition-colors group relative overflow-hidden"
        >
          {/* Decorative stars */}
          <div className="absolute inset-0 opacity-20 pointer-events-none">
            {[
              { x: '20%', y: '15%', s: 2 }, { x: '75%', y: '25%', s: 1.5 },
              { x: '40%', y: '80%', s: 2.5 }, { x: '85%', y: '60%', s: 1.2 },
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
            <div className="flex items-center gap-3 mb-3">
              <div className="p-2 bg-primary-600/20 rounded-lg shrink-0">
                <Stars className="w-5 h-5 text-primary-400" />
              </div>
              <div>
                <p className="text-gray-500 text-xs">Constellation</p>
                <p className="text-sm font-semibold text-white group-hover:text-primary-300 transition-colors">Explore Your Map</p>
              </div>
            </div>
            <span className="text-[11px] text-primary-400/70 group-hover:text-primary-400 flex items-center gap-1 transition-colors">
              See how phenomena connect <ArrowRight className="w-3 h-3" />
            </span>
          </div>
        </Link>
      </div>

      {/* ── Main Content Grid ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: Activity + Usage */}
        <div className="lg:col-span-2 space-y-5">
          {/* Your Constellation — the core feature */}
          <Link
            href="/dashboard/constellation"
            className="block p-5 sm:p-6 bg-gray-950 rounded-xl border border-gray-800 hover:border-primary-500/30 transition-all group relative overflow-hidden"
          >
            {/* Decorative star field background */}
            <div className="absolute inset-0 opacity-30 pointer-events-none">
              {[
                { x: '10%', y: '20%', s: 2, o: 0.8 }, { x: '25%', y: '70%', s: 1.5, o: 0.6 },
                { x: '45%', y: '15%', s: 3, o: 0.9 }, { x: '60%', y: '55%', s: 2, o: 0.7 },
                { x: '80%', y: '30%', s: 2.5, o: 0.8 }, { x: '70%', y: '75%', s: 1.5, o: 0.5 },
                { x: '15%', y: '45%', s: 1, o: 0.4 }, { x: '90%', y: '50%', s: 2, o: 0.6 },
                { x: '35%', y: '85%', s: 1.5, o: 0.5 }, { x: '55%', y: '35%', s: 2.5, o: 0.7 },
              ].map((star, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-primary-400"
                  style={{
                    left: star.x, top: star.y,
                    width: `${star.s}px`, height: `${star.s}px`,
                    opacity: star.o,
                    boxShadow: `0 0 ${star.s * 3}px rgba(139, 92, 246, 0.4)`,
                  }}
                />
              ))}
            </div>

            <div className="relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-primary-600/20 rounded-xl">
                    <Stars className="w-6 h-6 text-primary-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-white group-hover:text-primary-300 transition-colors">
                      Your Constellation
                    </h3>
                    <p className="text-xs text-gray-500">Your personal map of the unexplained</p>
                  </div>
                </div>
                <ArrowRight className="w-5 h-5 text-gray-600 group-hover:text-primary-400 transition-colors" />
              </div>

              {/* Constellation mini stats */}
              <div className="grid grid-cols-3 gap-3 mt-4">
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-white">{savedTotal}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Saved</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-white">{reportsTotal}</p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Reports</p>
                </div>
                <div className="bg-white/5 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-primary-400">
                    {reportsTotal + savedTotal > 0 ? 'Active' : 'New'}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-0.5">Status</p>
                </div>
              </div>

              <p className="text-xs text-primary-400/70 mt-4 group-hover:text-primary-400 transition-colors flex items-center gap-1">
                {reportsTotal + savedTotal > 0 ? 'Continue building your constellation' : 'Start exploring to light up your first star'}
                <ArrowRight className="w-3 h-3" />
              </p>
            </div>
          </Link>

          {/* Usage Overview — compact */}
          <div className="p-4 sm:p-5 bg-gray-900 rounded-xl border border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Usage This Month</h3>
              {tierName && <TierBadge tier={tierName} size="sm" />}
            </div>

            <div className="space-y-4">
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
        </div>

        {/* Right column: Quick Actions + Upgrade */}
        <div className="space-y-5">
          {/* Quick Actions */}
          <div className="p-4 sm:p-5 bg-gray-900 rounded-xl border border-gray-800">
            <h3 className="text-base font-semibold text-white mb-3">Quick Actions</h3>
            <div className="space-y-2">
              <Link
                href="/discover"
                className="flex items-center gap-3 p-3 bg-primary-600/20 border border-primary-500/20 hover:border-primary-500/40 rounded-lg text-primary-300 text-sm transition-colors"
              >
                <Sparkles className="w-4 h-4 text-primary-400" />
                <span className="font-medium">Discover Something New</span>
              </Link>
              <Link
                href="/map"
                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm transition-colors"
              >
                <TrendingUp className="w-4 h-4" />
                <span>Explore Sightings Map</span>
              </Link>
              <Link
                href="/submit"
                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm transition-colors"
              >
                <Plus className="w-4 h-4" />
                <span>Submit a Report</span>
              </Link>
              <Link
                href="/dashboard/journal/new"
                className="flex items-center gap-3 p-3 bg-gray-800 hover:bg-gray-700 rounded-lg text-gray-300 text-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                <span>New Journal Entry</span>
              </Link>
            </div>
          </div>

          {/* Upgrade Card (for non-enterprise users) */}
          {tierName && tierName !== 'enterprise' && (
            <UpgradeCard currentTier={tierName} variant="full" />
          )}

          {/* Dashboard Feature Tour */}
          {showDashboardTour && (
            <DashboardTour onComplete={() => setShowDashboardTour(false)} />
          )}
        </div>
      </div>
    </DashboardLayout>
  )
}
