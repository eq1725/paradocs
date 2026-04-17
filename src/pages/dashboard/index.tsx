/**
 * Dashboard Overview Page — Research Hub Mission Control
 *
 * Session 5 Redesign (March 25, 2026):
 * New page flow optimized for both new and active users:
 *
 * 1. Welcome Bar — Compact name + tier badge + streak flame
 * 2. Quick Actions — Horizontal scroll action pills
 * 3. Activity Summary — Consolidated "Your Research Snapshot" card
 * 4. Active Investigations — Case files (Netflix horizontal scroll on mobile)
 * 5. Recent Artifacts — Latest Research Hub additions
 * 6. AI Insights — Banner linking to insights in Research Hub
 * 7. Constellation Preview — D3 mini-map with progression messaging
 * 8. Suggested Next Steps — Context-aware prompts based on user state
 * 9. Account footer — Tier + usage + manage link
 *
 * Empty state: New users see Welcome + Quick Actions + EmptyState + Next Steps
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import {
  FileText,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Star,
  PenTool,
  FolderOpen,
  Plus,
  Globe,
  Zap,
  Link2,
  Lightbulb,
  Flame,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UpgradeCard } from '@/components/dashboard/UpgradeCard'
import { TierBadge } from '@/components/dashboard/TierBadge'
import DashboardTour, { hasDashboardTourCompleted } from '@/components/dashboard/DashboardTour'
import { MobileCardRow, MobileCardRowItem } from '@/components/mobile/MobileCardRow'
import QuickActions from '@/components/dashboard/QuickActions'
import ActivitySummary from '@/components/dashboard/ActivitySummary'
import SuggestedNextSteps from '@/components/dashboard/SuggestedNextSteps'
import EmptyState from '@/components/dashboard/EmptyState'
import { useProgressMilestones } from '@/components/dashboard/ProgressMilestones'
import { useSubscription } from '@/lib/hooks/useSubscription'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'
import type { TierName } from '@/lib/subscription'
import type { UserMapData, EntryNode } from '@/lib/constellation-types'

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
  researchHub: {
    totalArtifacts: number
    totalCaseFiles: number
    activeInsights: number
    recentArtifacts: Array<{
      id: string
      title: string
      source_type: string
      verdict: string | null
      thumbnail_url: string | null
      created_at: string
    }>
    caseFiles: Array<{
      id: string
      title: string
      cover_color: string
      created_at: string
      artifact_count: number
    }>
  }
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

var SOURCE_ICONS: Record<string, { icon: React.ElementType; color: string }> = {
  paradocs_report: { icon: FileText, color: 'text-indigo-400' },
  youtube: { icon: Globe, color: 'text-red-400' },
  reddit: { icon: Globe, color: 'text-orange-400' },
  tiktok: { icon: Globe, color: 'text-pink-400' },
  instagram: { icon: Globe, color: 'text-purple-400' },
  podcast: { icon: Globe, color: 'text-green-400' },
  news: { icon: FileText, color: 'text-blue-400' },
  website: { icon: Globe, color: 'text-cyan-400' },
  other: { icon: Globe, color: 'text-gray-400' },
}

var VERDICT_DOTS: Record<string, string> = {
  compelling: 'bg-amber-400',
  inconclusive: 'bg-blue-400',
  skeptical: 'bg-gray-400',
  needs_info: 'bg-purple-400',
}

var ACTIVITY_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string }> = {
  constellation_entry: { icon: Star, label: 'Logged to constellation', color: 'text-amber-400' },
  journal_entry: { icon: PenTool, label: 'Journal entry', color: 'text-blue-400' },
  connection: { icon: Link2, label: 'Drew connection', color: 'text-green-400' },
  theory: { icon: Lightbulb, label: 'Created theory', color: 'text-purple-400' },
  artifact_added: { icon: Plus, label: 'Added to Research Hub', color: 'text-cyan-400' },
}

function formatRelativeTime(dateString: string) {
  var date = new Date(dateString)
  var now = new Date()
  var diffMs = now.getTime() - date.getTime()
  var diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return diffDays + 'd ago'
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function DashboardPage() {
  var router = useRouter()
  var { tierName, loading: subscriptionLoading } = useSubscription()
  var [stats, setStats] = useState<DashboardStats | null>(null)
  var [userMapData, setUserMapData] = useState<UserMapData | null>(null)
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [showDashboardTour, setShowDashboardTour] = useState(false)
  var [streakDays, setStreakDays] = useState(0)
  var milestones = useProgressMilestones()

  useEffect(function() {
    if (!loading && stats && !hasDashboardTourCompleted()) {
      var timer = setTimeout(function() { setShowDashboardTour(true) }, 800)
      return function() { clearTimeout(timer) }
    }
  }, [loading, stats])

  useEffect(function() {
    if (!loading && stats && milestones.isHydrated) {
      milestones.checkAndUpdate({
        savedCount: stats.saved.total || 0,
        caseFileCount: stats.researchHub.totalCaseFiles || 0,
        constellationEntries: stats.constellation.totalEntries || 0,
        artifactCount: stats.researchHub.totalArtifacts || 0,
      })
    }
  }, [loading, stats, milestones.isHydrated])

  useEffect(function() {
    var fetchData = async function() {
      try {
        var sessionResult = await supabase.auth.getSession()
        var session = sessionResult.data.session
        if (!session) { router.push('/login'); return }

        var headers = { 'Authorization': 'Bearer ' + session.access_token }
        var [statsResp, mapResp, streakResp] = await Promise.all([
          fetch('/api/user/stats', { headers: headers }),
          fetch('/api/constellation/user-map', { headers: headers }).catch(function() { return null }),
          fetch('/api/user/streak', { headers: headers }).catch(function() { return null }),
        ])

        if (!statsResp.ok) throw new Error('Failed to fetch stats')
        var statsData = await statsResp.json()
        setStats(statsData)

        if (mapResp && mapResp.ok) {
          var mapData = await mapResp.json()
          setUserMapData(mapData)
        }

        if (streakResp && streakResp.ok) {
          var streakData = await streakResp.json()
          setStreakDays(streakData.current_streak || 0)
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

  var handleSelectEntry = useCallback(function(entry: EntryNode | null) {
    if (entry) {
      router.push('/dashboard/constellation?entry=' + entry.id)
    }
  }, [router])

  // ── Loading state ──
  if (loading || subscriptionLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="space-y-4">
          <div className="h-10 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-8 bg-gray-900 rounded-full animate-pulse w-64" />
          <div className="h-24 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-32 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-48 bg-gray-900 rounded-xl animate-pulse" />
        </div>
      </DashboardLayout>
    )
  }

  // ── Error state ──
  if (error) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Error Loading Dashboard</h2>
          <p className="text-gray-400">{error}</p>
          <button
            onClick={function() { window.location.reload() }}
            className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      </DashboardLayout>
    )
  }

  var hasEntries = (stats && stats.constellation ? stats.constellation.totalEntries : 0) > 0
  var hasArtifacts = (stats && stats.researchHub ? stats.researchHub.totalArtifacts : 0) > 0
  var hub = stats?.researchHub || { totalArtifacts: 0, totalCaseFiles: 0, activeInsights: 0, recentArtifacts: [], caseFiles: [] }

  // Find smallest case file for SuggestedNextSteps
  var smallestCaseFile = null as { id: string; title: string; artifact_count: number } | null
  if (hub.caseFiles.length > 0) {
    var sorted = hub.caseFiles.slice().sort(function(a, b) { return a.artifact_count - b.artifact_count })
    if (sorted[0] && sorted[0].artifact_count < 3) {
      smallestCaseFile = sorted[0]
    }
  }

  return (
    <DashboardLayout title="Dashboard">

      {/* ── 1. Welcome Bar — Compact: name + tier + streak ── */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <h2 className="text-base sm:text-xl font-bold text-white truncate">
            {'Welcome back' + (stats?.profile.display_name ? ', ' + stats.profile.display_name : '')}
          </h2>
          {tierName && <TierBadge tier={tierName} size="sm" />}
        </div>
        {streakDays > 0 && (
          <div className="flex items-center gap-1 text-orange-400 flex-shrink-0">
            <Flame className="w-4 h-4" />
            <span className="text-sm font-semibold">{streakDays}</span>
          </div>
        )}
      </div>

      {/* ── Milestone Celebration Banner ── */}
      {milestones.newMilestoneMessage && (
        <div className="mb-4 p-3 sm:p-4 bg-gradient-to-r from-amber-950/40 to-amber-900/20 border border-amber-700/50 rounded-xl flex items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 bg-amber-500/15 rounded-lg flex-shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <p className="text-sm font-medium text-amber-200 truncate">
              {milestones.newMilestoneMessage}
            </p>
          </div>
          <button
            onClick={function() { milestones.dismissMilestoneMessage() }}
            className="flex-shrink-0 text-amber-400/60 hover:text-amber-300 transition-colors"
            aria-label="Dismiss"
          >
            <span className="text-lg">{'×'}</span>
          </button>
        </div>
      )}

      {/* ── 2. Quick Actions — Horizontal scroll pills ── */}
      <div className="mb-5">
        <QuickActions />
      </div>

      {/* ── 3. Activity Summary — Consolidated stats card ── */}
      <div className="mb-5">
        <ActivitySummary
          artifactsCount={hub.totalArtifacts}
          reportsSaved={stats?.saved.total || 0}
          streakDays={streakDays}
          constellationEntries={stats?.constellation.totalEntries || 0}
        />
      </div>

      {/* ── 4. Active Investigations (case files) ── */}
      {hasArtifacts && hub.caseFiles.length > 0 && (
        <div className="mb-5">
          {/* Mobile: Netflix-style horizontal row */}
          <div className="sm:hidden">
            <MobileCardRow
              title="Active Investigations"
              icon={<FolderOpen className="w-4 h-4 text-indigo-400" />}
              seeAllHref="/dashboard/research-hub"
              cardWidthPercent={75}
              minCardWidth={220}
              maxCardWidth={280}
              showDots={hub.caseFiles.length > 1}
              itemCount={hub.caseFiles.length}
            >
              {hub.caseFiles.map(function(cf) {
                return (
                  <MobileCardRowItem
                    key={cf.id}
                    widthPercent={75}
                    minWidth={220}
                    maxWidth={280}
                  >
                    <Link
                      href="/dashboard/research-hub"
                      className="block p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-indigo-500/30 transition-all h-full"
                      style={{ borderLeftWidth: '3px', borderLeftColor: cf.cover_color || '#6366f1' }}
                    >
                      <p className="text-sm font-medium text-white truncate">{cf.title}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {cf.artifact_count + ' artifact' + (cf.artifact_count !== 1 ? 's' : '')}
                      </p>
                      <p className="text-[10px] text-gray-600 mt-0.5">
                        {formatRelativeTime(cf.created_at)}
                      </p>
                    </Link>
                  </MobileCardRowItem>
                )
              })}
              {/* "New investigation" card at the end */}
              <MobileCardRowItem
                key="new-investigation"
                widthPercent={75}
                minWidth={220}
                maxWidth={280}
              >
                <Link
                  href="/dashboard/research-hub"
                  className="flex flex-col items-center justify-center p-3 bg-gray-900/50 border border-dashed border-gray-700 rounded-xl hover:border-indigo-500/40 transition-all h-full min-h-[76px]"
                >
                  <Plus className="w-5 h-5 text-gray-500 mb-1" />
                  <span className="text-xs text-gray-500">New Investigation</span>
                </Link>
              </MobileCardRowItem>
            </MobileCardRow>
          </div>

          {/* Desktop: grid */}
          <div className="hidden sm:block">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-indigo-400" />
                Active Investigations
              </h3>
              <Link
                href="/dashboard/research-hub"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                View All <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-3 lg:grid-cols-5 gap-2.5">
              {hub.caseFiles.map(function(cf) {
                return (
                  <Link
                    key={cf.id}
                    href="/dashboard/research-hub"
                    className="group p-3.5 bg-gray-900 border border-gray-800 rounded-xl hover:border-indigo-500/30 transition-all overflow-hidden"
                    style={{ borderLeftWidth: '3px', borderLeftColor: cf.cover_color || '#6366f1' }}
                  >
                    <p className="text-sm font-medium text-white group-hover:text-indigo-300 truncate transition-colors">
                      {cf.title}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {cf.artifact_count + ' artifact' + (cf.artifact_count !== 1 ? 's' : '')}
                    </p>
                  </Link>
                )
              })}
              {/* New investigation card */}
              <Link
                href="/dashboard/research-hub"
                className="group flex flex-col items-center justify-center p-3.5 bg-gray-900/50 border border-dashed border-gray-700 rounded-xl hover:border-indigo-500/40 transition-all"
              >
                <Plus className="w-5 h-5 text-gray-500 group-hover:text-indigo-400 mb-1 transition-colors" />
                <span className="text-xs text-gray-500 group-hover:text-gray-400 transition-colors">New</span>
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── 5. Recent Artifacts ── */}
      {hasArtifacts && hub.recentArtifacts.length > 0 && (
        <div className="mb-5">
          {/* Mobile */}
          <div className="sm:hidden">
            <MobileCardRow
              title="Recent Artifacts"
              seeAllHref="/dashboard/research-hub"
              cardWidthPercent={80}
              minCardWidth={260}
              maxCardWidth={320}
            >
              {hub.recentArtifacts.map(function(artifact) {
                var sourceConfig = SOURCE_ICONS[artifact.source_type] || SOURCE_ICONS.other
                var SourceIcon = sourceConfig.icon
                var verdictDot = artifact.verdict ? VERDICT_DOTS[artifact.verdict] : null
                return (
                  <MobileCardRowItem
                    key={artifact.id}
                    widthPercent={80}
                    minWidth={260}
                    maxWidth={320}
                  >
                    <Link
                      href="/dashboard/research-hub"
                      className="block p-3 bg-gray-900 border border-gray-800 rounded-xl hover:border-cyan-500/30 transition-all h-full"
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div className={classNames('p-2 rounded-lg flex-shrink-0', artifact.source_type === 'paradocs_report' ? 'bg-indigo-500/15' : 'bg-cyan-500/15')}>
                          <SourceIcon className={classNames('w-4 h-4', sourceConfig.color)} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-white truncate">{artifact.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            {verdictDot && (
                              <span className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', verdictDot)} />
                            )}
                            <span className="text-xs text-gray-500">{formatRelativeTime(artifact.created_at)}</span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </MobileCardRowItem>
                )
              })}
            </MobileCardRow>
          </div>

          {/* Desktop */}
          <div className="hidden sm:block">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white">Recent Artifacts</h3>
              <Link
                href="/dashboard/research-hub"
                className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
              >
                Open Hub <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {hub.recentArtifacts.map(function(artifact) {
                var sourceConfig = SOURCE_ICONS[artifact.source_type] || SOURCE_ICONS.other
                var SourceIcon = sourceConfig.icon
                var verdictDot = artifact.verdict ? VERDICT_DOTS[artifact.verdict] : null
                return (
                  <Link
                    key={artifact.id}
                    href="/dashboard/research-hub"
                    className="group p-4 bg-gray-900 border border-gray-800 rounded-xl hover:border-cyan-500/30 transition-all overflow-hidden"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={classNames('p-2 rounded-lg flex-shrink-0', artifact.source_type === 'paradocs_report' ? 'bg-indigo-500/15' : 'bg-cyan-500/15')}>
                        <SourceIcon className={classNames('w-4 h-4', sourceConfig.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white group-hover:text-cyan-300 truncate transition-colors">{artifact.title}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {verdictDot && (
                            <span className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', verdictDot)} />
                          )}
                          <span className="text-xs text-gray-500">{formatRelativeTime(artifact.created_at)}</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Empty state for new users (no artifacts) ── */}
      {!hasArtifacts && (
        <div className="mb-5">
          <EmptyState
            icon={Sparkles}
            iconColor="text-indigo-400"
            iconBg="bg-indigo-500/10"
            title="Your Research Hub is ready"
            description="Save URLs from YouTube, Reddit, news sites, or log Paradocs reports. Organize evidence into case files, draw connections, and build theories."
            ctaLabel="Add Your First Artifact"
            ctaHref="/dashboard/research-hub"
            secondaryLabel="Browse Reports"
            secondaryHref="/explore"
          />
        </div>
      )}

      {/* ── 6. AI Insights Banner ── */}
      {hub.activeInsights > 0 ? (
        <Link
          href="/dashboard/research-hub"
          className="block mb-5 p-3 sm:p-4 bg-cyan-950/30 border border-cyan-800/50 rounded-xl hover:border-cyan-700/60 transition-colors group overflow-hidden"
        >
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/15 rounded-lg flex-shrink-0">
              <Zap className="w-5 h-5 text-cyan-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-cyan-200 truncate">
                {hub.activeInsights + ' AI Insight' + (hub.activeInsights !== 1 ? 's' : '') + ' available'}
              </p>
              <p className="text-xs text-cyan-400/60 truncate">
                Patterns and connections detected across your research
              </p>
            </div>
            <ArrowRight className="w-4 h-4 text-cyan-400 group-hover:translate-x-0.5 transition-transform flex-shrink-0" />
          </div>
        </Link>
      ) : hasArtifacts && hub.totalArtifacts < 5 ? (
        <div className="mb-5 p-3 sm:p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-cyan-500/10 rounded-lg flex-shrink-0">
              <Zap className="w-5 h-5 text-cyan-500/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-400 truncate">AI Pattern Detection</p>
              <p className="text-xs text-gray-500 truncate">
                {'Add ' + (5 - hub.totalArtifacts) + ' more artifact' + ((5 - hub.totalArtifacts) !== 1 ? 's' : '') + ' to unlock AI insights'}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── 7. Research Library Preview — replaces the old canvas preview ── */}
      {hasEntries ? (
        <Link
          href="/lab?tab=map"
          className="mb-5 rounded-xl overflow-hidden border border-gray-800 bg-gray-900 hover:bg-gray-900/80 hover:border-gray-700 transition-colors p-4 flex items-center gap-3"
        >
          <div className="p-2 bg-purple-500/10 rounded-lg flex-shrink-0">
            <Star className="w-5 h-5 text-purple-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">
              {stats && stats.constellation ? stats.constellation.rank : 'Your research library'}
            </p>
            <p className="text-xs text-gray-500 truncate">
              {(stats && stats.constellation ? stats.constellation.totalEntries : 0) + ' saves · open your Lab to read and find patterns'}
            </p>
          </div>
          <ArrowRight className="w-4 h-4 text-gray-500 flex-shrink-0" />
        </Link>
      ) : !hasEntries ? (
        <div className="mb-5 p-4 bg-gray-900 border border-gray-800 rounded-xl">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-purple-500/10 rounded-lg flex-shrink-0">
              <Star className="w-5 h-5 text-purple-500/50" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-400">Your Constellation</p>
              <p className="text-xs text-gray-500">
                Log your first 5 items to build your research constellation map
              </p>
            </div>
            <Link
              href="/dashboard/constellation"
              className="text-xs text-purple-400 hover:text-purple-300 flex-shrink-0 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      ) : null}

      {/* ── 8. Research Activity (compact feed) ── */}
      {stats?.research_activity && stats.research_activity.length > 0 && (
        <div className="mb-5 p-3 sm:p-4 bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Activity</h3>
            <Link
              href="/dashboard/research-hub"
              className="text-xs text-indigo-400 hover:text-indigo-300 flex items-center gap-1"
            >
              View All <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-1">
            {stats.research_activity.map(function(activity) {
              var config = ACTIVITY_TYPE_CONFIG[activity.type] || ACTIVITY_TYPE_CONFIG.constellation_entry
              var Icon = config.icon
              return (
                <div
                  key={activity.id}
                  className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-gray-950/50 rounded-lg overflow-hidden"
                >
                  <Icon className={'w-3.5 h-3.5 sm:w-4 sm:h-4 ' + config.color + ' flex-shrink-0'} />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-xs sm:text-sm truncate">{activity.title}</p>
                  </div>
                  <span className="text-[10px] sm:text-[11px] text-gray-600 flex-shrink-0">{formatRelativeTime(activity.created_at)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── 9. Suggested Next Steps ── */}
      <div className="mb-5">
        <SuggestedNextSteps
          savedCount={stats?.saved.total || 0}
          caseFileCount={hub.totalCaseFiles}
          artifactCount={hub.totalArtifacts}
          constellationEntries={stats?.constellation.totalEntries || 0}
          tierName={tierName}
          smallestCaseFile={smallestCaseFile}
        />
      </div>

      {/* ── 10. Account Footer ── */}
      <div className="pt-4 border-t border-gray-800/50">
        <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500 flex-wrap">
          {tierName && <TierBadge tier={tierName} size="sm" />}
          {stats?.subscription && (
            <>
              <span>{'\u00B7'}</span>
              <span className="truncate">{stats.subscription.usage.reports_submitted + '/' + (stats.subscription.limits.reports_per_month === 0 ? '\u221E' : stats.subscription.limits.reports_per_month) + ' reports'}</span>
              <span className="hidden sm:inline">{'\u00B7'}</span>
              <span className="hidden sm:inline">{stats.subscription.usage.reports_saved + '/' + (stats.subscription.limits.saved_reports_max === 0 ? '\u221E' : stats.subscription.limits.saved_reports_max) + ' saved'}</span>
            </>
          )}
          <Link
            href="/dashboard/subscription"
            className="text-purple-400 hover:text-purple-300 flex items-center gap-1 ml-auto flex-shrink-0 transition-colors"
          >
            {'Manage '}
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {tierName && tierName === 'free' && (
          <div className="mt-4">
            <UpgradeCard currentTier={tierName} variant="compact" />
          </div>
        )}
      </div>

      {/* Dashboard Feature Tour */}
      {showDashboardTour && (
        <DashboardTour onComplete={function() { setShowDashboardTour(false) }} />
      )}
    </DashboardLayout>
  )
}
