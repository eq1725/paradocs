/**
 * Dashboard Overview Page — Constellation-First Research Hub
 *
 * Prioritizes the constellation map and research activity over report submission.
 * Layout: Hero → Streak → Constellation Preview → Research Activity → Stats → Suggestions → Usage Footer
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileText,
  Bookmark,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Stars,
  Compass,
  BookOpen,
  Link2,
  Lightbulb,
  Star,
  PenTool,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UpgradeCard } from '@/components/dashboard/UpgradeCard'
import { TierBadge } from '@/components/dashboard/TierBadge'
import ResearchStreak from '@/components/dashboard/ResearchStreak'
import DashboardTour, { hasDashboardTourCompleted } from '@/components/dashboard/DashboardTour'
import ConstellationMapV2 from '@/components/dashboard/ConstellationMapV2'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { supabase } from '@/lib/supabase'
import { getSuggestedExplorations } from '@/lib/constellation-data'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'
import type { TierName } from '@/lib/subscription'
import type { UserMapData, EntryNode } from './constellation'

interface DashboardStats {
  profile: {
    username: string | null
    display_name: string | null
    avatar_url: string | null
    reputation_score: number
    member_since: string
  }
  reports: { total: number; pending: number; approved: number; rejected: number }
  saved: { total: number }
  constellation: {
    totalEntries: number
    totalConnections: number
    rank: string
    rankIcon: string
  }
  journal: { totalEntries: number }
  research_activity: Array<{
    id: string
    type: string
    title: string
    created_at: string
  }>
  subscription: {
    tier: TierName
    tier_display: string
    status: string
    usage: { reports_submitted: number; reports_saved: number; api_calls_made: number }
    limits: { reports_per_month: number; saved_reports_max: number; api_calls_per_month: number }
    canSubmitReport: boolean
    canSaveReport: boolean
  } | null
  recent_reports: Array<{ id: string; title: string; slug: string; status: string; created_at: string }>
}

const ACTIVITY_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  constellation_entry: { icon: Star, label: 'Logged to constellation', color: 'text-amber-400' },
  journal_entry: { icon: PenTool, label: 'Journal entry', color: 'text-blue-400' },
  connection: { icon: Link2, label: 'Drew connection', color: 'text-green-400' },
  theory: { icon: Lightbulb, label: 'Created theory', color: 'text-purple-400' },
}

function formatRelativeTime(dateString: string) {
  const date = new Date(dateString)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  const router = useRouter()
  const { tierName, loading: subscriptionLoading } = useSubscription()
  const { data: personalization } = usePersonalization()
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [userMapData, setUserMapData] = useState<UserMapData | null>(null)
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
    const fetchData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) { router.push('/login'); return }

        // Fetch dashboard stats and constellation map data in parallel
        const [statsResp, mapResp] = await Promise.all([
          fetch('/api/user/stats', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }),
          fetch('/api/constellation/user-map', {
            headers: { 'Authorization': `Bearer ${session.access_token}` }
          }).catch(() => null),
        ])

        if (!statsResp.ok) throw new Error('Failed to fetch stats')
        const statsData = await statsResp.json()
        setStats(statsData)

        if (mapResp?.ok) {
          const mapData = await mapResp.json()
          setUserMapData(mapData)
        }
      } catch (err) {
        console.error('Error fetching dashboard data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [router])

  const handleSelectEntry = useCallback((entry: EntryNode | null) => {
    if (entry) {
      router.push(`/dashboard/constellation?entry=${entry.id}`)
    }
  }, [router])

  if (loading || subscriptionLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="space-y-4">
          <div className="h-16 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-10 bg-gray-900 rounded-xl animate-pulse w-48" />
          <div className="h-[300px] bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-32 bg-gray-900 rounded-xl animate-pulse" />
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

  const hasEntries = (stats?.constellation.totalEntries || 0) > 0
  const userInterests = personalization?.interested_categories || []
  const suggestions = hasEntries ? getSuggestedExplorations(userInterests as PhenomenonCategory[], 3) : []

  return (
    <DashboardLayout title="Dashboard">
      {/* ── A. Hero: Welcome + Research CTAs ── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-white">
            Welcome back{stats?.profile.display_name ? `, ${stats.profile.display_name}` : ''}
          </h2>
          <p className="text-gray-500 text-sm mt-0.5">Your research at a glance</p>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            href="/explore"
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium text-sm transition-colors"
          >
            <Compass className="w-4 h-4" />
            Explore Phenomena
          </Link>
          <Link
            href="/dashboard/journal/new"
            className="flex items-center gap-2 px-4 py-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            <PenTool className="w-4 h-4" />
            <span className="hidden sm:inline">Journal Entry</span>
          </Link>
        </div>
      </div>

      {/* ── B. Research Streak ── */}
      <div className="mb-5">
        <ResearchStreak compact />
      </div>

      {/* ── C. Constellation Preview (THE CENTERPIECE) ── */}
      <div className="mb-5 rounded-xl overflow-hidden border border-gray-800 relative">
        {hasEntries && userMapData ? (
          <>
            <div className="h-[260px] sm:h-[340px]">
              <ConstellationMapV2
                userMapData={userMapData}
                onSelectEntry={handleSelectEntry}
                selectedEntryId={null}
              />
            </div>
            {/* Overlay with rank + link — right-aligned to not cover the legend */}
            <div className="absolute bottom-0 right-0 bg-gradient-to-l from-gray-950 via-gray-950/90 to-transparent px-4 py-3 rounded-bl-lg pointer-events-none">
              <div className="flex items-center gap-3 pointer-events-auto">
                <span className="text-lg">{stats?.constellation.rankIcon}</span>
                <span className="text-sm font-medium text-white">{stats?.constellation.rank}</span>
                <span className="text-xs text-gray-500">
                  · {stats?.constellation.totalEntries} {stats?.constellation.totalEntries === 1 ? 'star' : 'stars'}
                </span>
                <Link
                  href="/dashboard/constellation"
                  className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1 transition-colors ml-2"
                >
                  Open Full Map <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            </div>
          </>
        ) : (
          /* Empty state */
          <div className="h-[260px] sm:h-[300px] bg-gray-950 relative flex flex-col items-center justify-center text-center px-6">
            {/* Decorative stars */}
            <div className="absolute inset-0 opacity-20 pointer-events-none overflow-hidden">
              {[
                { x: '15%', y: '20%', s: 2 }, { x: '80%', y: '15%', s: 1.5 },
                { x: '25%', y: '70%', s: 2.5 }, { x: '70%', y: '65%', s: 1.8 },
                { x: '50%', y: '40%', s: 3 }, { x: '90%', y: '80%', s: 1.2 },
                { x: '10%', y: '50%', s: 1.8 }, { x: '60%', y: '25%', s: 2.2 },
              ].map((star, i) => (
                <div
                  key={i}
                  className="absolute rounded-full bg-purple-400"
                  style={{
                    left: star.x, top: star.y,
                    width: `${star.s}px`, height: `${star.s}px`,
                    boxShadow: `0 0 ${star.s * 3}px rgba(139, 92, 246, 0.5)`,
                  }}
                />
              ))}
            </div>
            <div className="relative">
              <Stars className="w-10 h-10 text-purple-500/50 mx-auto mb-3" />
              <h3 className="text-white font-semibold text-lg mb-1">Your constellation awaits</h3>
              <p className="text-gray-500 text-sm max-w-sm mb-4">
                Log reports to your constellation to build a personal map of your paranormal research journey.
              </p>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <Compass className="w-4 h-4" />
                Browse Reports
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── D. Research Activity ── */}
      {stats?.research_activity && stats.research_activity.length > 0 && (
        <div className="mb-5 p-4 bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-white">Research Activity</h3>
            <Link
              href="/dashboard/constellation"
              className="text-xs text-purple-400 hover:text-purple-300 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1.5">
            {stats.research_activity.map(activity => {
              const config = ACTIVITY_TYPE_CONFIG[activity.type] || ACTIVITY_TYPE_CONFIG.constellation_entry
              const Icon = config.icon
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-3 p-2.5 bg-gray-950/50 rounded-lg"
                >
                  <Icon className={`w-4 h-4 ${config.color} shrink-0`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{activity.title}</p>
                    <p className="text-[11px] text-gray-600">{config.label}</p>
                  </div>
                  <span className="text-[11px] text-gray-600 shrink-0">{formatRelativeTime(activity.created_at)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── E. Research Snapshot (metric pills) ── */}
      <div className="mb-5 flex flex-wrap gap-2">
        <Link
          href="/dashboard/constellation"
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-sm transition-colors group"
        >
          <Star className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-white font-medium">{stats?.constellation.totalEntries || 0}</span>
          <span className="text-gray-500 group-hover:text-gray-400">Stars</span>
        </Link>
        <Link
          href="/dashboard/constellation"
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-sm transition-colors group"
        >
          <Link2 className="w-3.5 h-3.5 text-green-400" />
          <span className="text-white font-medium">{stats?.constellation.totalConnections || 0}</span>
          <span className="text-gray-500 group-hover:text-gray-400">Connections</span>
        </Link>
        <Link
          href="/dashboard/journal"
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-sm transition-colors group"
        >
          <BookOpen className="w-3.5 h-3.5 text-blue-400" />
          <span className="text-white font-medium">{stats?.journal.totalEntries || 0}</span>
          <span className="text-gray-500 group-hover:text-gray-400">Journal</span>
        </Link>
        <Link
          href="/dashboard/saved"
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-sm transition-colors group"
        >
          <Bookmark className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-white font-medium">{stats?.saved.total || 0}</span>
          <span className="text-gray-500 group-hover:text-gray-400">Saved</span>
        </Link>
        <Link
          href="/dashboard/reports"
          className="flex items-center gap-2 px-3.5 py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-sm transition-colors group"
        >
          <FileText className="w-3.5 h-3.5 text-gray-400" />
          <span className="text-white font-medium">{stats?.reports.total || 0}</span>
          <span className="text-gray-500 group-hover:text-gray-400">Reports</span>
        </Link>
      </div>

      {/* ── F. Suggested Explorations ── */}
      {suggestions.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white mb-3">Suggested Explorations</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {suggestions.map(suggestion => {
              const config = CATEGORY_CONFIG[suggestion.category as keyof typeof CATEGORY_CONFIG]
              return (
                <Link
                  key={suggestion.category}
                  href={`/explore?category=${suggestion.category}`}
                  className="group p-3.5 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-500/30 transition-all"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-lg">{config?.icon || '✨'}</span>
                    <span className="text-sm font-medium text-white group-hover:text-purple-300 transition-colors">
                      {config?.label || suggestion.category}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 line-clamp-2">{suggestion.reason}</p>
                </Link>
              )
            })}
          </div>
        </div>
      )}

      {/* ── G. Account & Usage (compact footer) ── */}
      <div className="pt-4 border-t border-gray-800/50">
        <div className="flex items-center gap-3 text-xs text-gray-500 flex-wrap">
          {tierName && <TierBadge tier={tierName} size="sm" />}
          {stats?.subscription && (
            <>
              <span>·</span>
              <span>{stats.subscription.usage.reports_submitted}/{stats.subscription.limits.reports_per_month === 0 ? '∞' : stats.subscription.limits.reports_per_month} reports</span>
              <span>·</span>
              <span>{stats.subscription.usage.reports_saved}/{stats.subscription.limits.saved_reports_max === 0 ? '∞' : stats.subscription.limits.saved_reports_max} saved</span>
            </>
          )}
          <Link
            href="/dashboard/subscription"
            className="text-purple-400 hover:text-purple-300 flex items-center gap-1 ml-auto transition-colors"
          >
            Manage <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {/* Upgrade card for free tier */}
        {tierName && tierName === 'free' && (
          <div className="mt-4">
            <UpgradeCard currentTier={tierName} variant="compact" />
          </div>
        )}
      </div>

      {/* Dashboard Feature Tour */}
      {showDashboardTour && (
        <DashboardTour onComplete={() => setShowDashboardTour(false)} />
      )}
    </DashboardLayout>
  )
}
