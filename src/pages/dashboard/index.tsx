/**
 * Dashboard Overview Page — Research Hub Mission Control
 *
 * Mobile-first redesign (Session 13 Phase 3):
 * - Welcome hero with single prominent CTA on mobile
 * - Netflix-style horizontal card rows for case files (MobileCardRow)
 * - Horizontal scroll metric pills (not wrapping grid) on mobile
 * - Compact activity feed
 * - Constellation preview with "View Map" overlay
 * - <style jsx global> migrated to globals.css
 *
 * Layout: Hero + CTAs → Research Hub Summary (case files + recent artifacts) →
 *         AI Insights banner → Constellation Mini-Map → Activity Feed →
 *         Metric Pills → Suggested Explorations → Usage Footer
 */

import React, { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/router'
import dynamic from 'next/dynamic'
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
  FolderOpen,
  Plus,
  Globe,
  Zap,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import { UpgradeCard } from '@/components/dashboard/UpgradeCard'
import { TierBadge } from '@/components/dashboard/TierBadge'
import ResearchStreak from '@/components/dashboard/ResearchStreak'
import DashboardTour, { hasDashboardTourCompleted } from '@/components/dashboard/DashboardTour'
import { MobileCardRow, MobileCardRowItem } from '@/components/mobile/MobileCardRow'
var ConstellationMapV2 = dynamic(
  function() { return import('@/components/dashboard/ConstellationMapV2') },
  { ssr: false }
)
import { useSubscription } from '@/lib/hooks/useSubscription'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { supabase } from '@/lib/supabase'
import { getSuggestedExplorations } from '@/lib/constellation-data'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'
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
  var { data: personalization } = usePersonalization()
  var [stats, setStats] = useState<DashboardStats | null>(null)
  var [userMapData, setUserMapData] = useState<UserMapData | null>(null)
  var [loading, setLoading] = useState(true)
  var [error, setError] = useState<string | null>(null)
  var [showDashboardTour, setShowDashboardTour] = useState(false)

  useEffect(function() {
    if (!loading && stats && !hasDashboardTourCompleted()) {
      var timer = setTimeout(function() { setShowDashboardTour(true) }, 800)
      return function() { clearTimeout(timer) }
    }
  }, [loading, stats])

  useEffect(function() {
    var fetchData = async function() {
      try {
        var sessionResult = await supabase.auth.getSession()
        var session = sessionResult.data.session
        if (!session) { router.push('/login'); return }

        var headers = { 'Authorization': 'Bearer ' + session.access_token }
        var [statsResp, mapResp] = await Promise.all([
          fetch('/api/user/stats', { headers: headers }),
          fetch('/api/constellation/user-map', { headers: headers }).catch(function() { return null }),
        ])

        if (!statsResp.ok) throw new Error('Failed to fetch stats')
        var statsData = await statsResp.json()
        setStats(statsData)

        if (mapResp && mapResp.ok) {
          var mapData = await mapResp.json()
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

  var handleSelectEntry = useCallback(function(entry: EntryNode | null) {
    if (entry) {
      router.push('/dashboard/constellation?entry=' + entry.id)
    }
  }, [router])

  if (loading || subscriptionLoading) {
    return (
      <DashboardLayout title="Dashboard">
        <div className="space-y-4">
          <div className="h-16 bg-gray-900 rounded-xl animate-pulse" />
          <div className="h-10 bg-gray-900 rounded-xl animate-pulse w-48" />
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="h-32 bg-gray-900 rounded-xl animate-pulse" />
            <div className="h-32 bg-gray-900 rounded-xl animate-pulse" />
            <div className="h-32 bg-gray-900 rounded-xl animate-pulse" />
          </div>
          <div className="h-48 bg-gray-900 rounded-xl animate-pulse" />
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
  var userInterests = personalization?.interested_categories || []
  var suggestions = hasEntries ? getSuggestedExplorations(userInterests as PhenomenonCategory[], 3) : []
  var hub = stats?.researchHub || { totalArtifacts: 0, totalCaseFiles: 0, activeInsights: 0, recentArtifacts: [], caseFiles: [] }

  return (
    <DashboardLayout title="Dashboard">
      {/* ── A. Hero: Welcome + Smart CTAs ── */}
      {/* Mobile: stacked with single prominent CTA. Desktop: side-by-side */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
        <div className="min-w-0">
          <h2 className="text-lg sm:text-2xl font-bold text-white truncate">
            {'Welcome back' + (stats?.profile.display_name ? ', ' + stats.profile.display_name : '')}
          </h2>
          <p className="text-gray-500 text-xs sm:text-sm mt-0.5 truncate">
            {hasArtifacts
              ? hub.totalArtifacts + ' artifact' + (hub.totalArtifacts !== 1 ? 's' : '') + ' across ' + hub.totalCaseFiles + ' case file' + (hub.totalCaseFiles !== 1 ? 's' : '')
              : 'Start building your research hub'}
          </p>
        </div>
        {/* Mobile: single full-width CTA. Desktop: two buttons inline */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <Link
            href="/dashboard/research-hub"
            className="flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-sm transition-colors w-full sm:w-auto"
          >
            <Sparkles className="w-4 h-4" />
            Research Hub
          </Link>
          <Link
            href="/explore"
            className="hidden sm:flex items-center gap-2 px-4 py-2 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm transition-colors"
          >
            <Compass className="w-4 h-4" />
            Explore
          </Link>
        </div>
      </div>

      {/* ── B. Research Streak ── */}
      <div className="mb-5">
        <ResearchStreak compact />
      </div>

      {/* ── C. Research Hub Summary (THE CENTERPIECE) ── */}
      {hasArtifacts ? (
        <div className="mb-5 overflow-hidden">
          {/* Case Files — Mobile: horizontal scroll cards. Desktop: grid */}
          {hub.caseFiles.length > 0 && (
            <div className="mb-4">
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
                          <p className="text-sm font-medium text-white truncate">
                            {cf.title}
                          </p>
                          <p className="text-xs text-gray-500 mt-1">
                            {cf.artifact_count + ' artifact' + (cf.artifact_count !== 1 ? 's' : '')}
                          </p>
                        </Link>
                      </MobileCardRowItem>
                    )
                  })}
                </MobileCardRow>
              </div>

              {/* Desktop: grid layout (unchanged from original) */}
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
                </div>
              </div>
            </div>
          )}

          {/* Recent Artifacts — Mobile: horizontal scroll. Desktop: grid */}
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
                          <p className="text-sm font-medium text-white truncate">
                            {artifact.title}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            {verdictDot && (
                              <span className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', verdictDot)} />
                            )}
                            <span className="text-xs text-gray-500">
                              {formatRelativeTime(artifact.created_at)}
                            </span>
                          </div>
                        </div>
                      </div>
                    </Link>
                  </MobileCardRowItem>
                )
              })}
            </MobileCardRow>
          </div>

          {/* Desktop: grid layout for artifacts */}
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
                        <p className="text-sm font-medium text-white group-hover:text-cyan-300 truncate transition-colors">
                          {artifact.title}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          {verdictDot && (
                            <span className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', verdictDot)} />
                          )}
                          <span className="text-xs text-gray-500">
                            {formatRelativeTime(artifact.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
          </div>
        </div>
      ) : (
        /* Empty state — first time user */
        <div className="mb-5 p-6 sm:p-8 bg-gray-900 border border-gray-800 rounded-xl text-center">
          <div className="w-14 h-14 sm:w-16 sm:h-16 mx-auto mb-4 rounded-full bg-indigo-500/10 flex items-center justify-center">
            <Sparkles className="w-7 h-7 sm:w-8 sm:h-8 text-indigo-400" />
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-white mb-2">Your Research Hub is ready</h3>
          <p className="text-gray-400 text-sm max-w-md mx-auto mb-5">
            Save URLs from YouTube, Reddit, news sites, or log Paradocs reports. Organize evidence into case files, draw connections, and build theories.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
            <Link
              href="/dashboard/research-hub"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-medium transition-colors w-full sm:w-auto justify-center"
            >
              <Plus className="w-4 h-4" />
              Add Your First Artifact
            </Link>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-gray-700 hover:border-gray-600 text-gray-300 hover:text-white rounded-lg text-sm transition-colors w-full sm:w-auto justify-center"
            >
              <Compass className="w-4 h-4" />
              Browse Reports
            </Link>
          </div>
        </div>
      )}

      {/* ── D. AI Insights Banner ── */}
      {hub.activeInsights > 0 && (
        <Link
          href="/dashboard/research-hub"
          className="mb-5 flex items-center gap-3 p-3 sm:p-4 bg-cyan-950/30 border border-cyan-800/50 rounded-xl hover:border-cyan-700/60 transition-colors group overflow-hidden"
        >
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
        </Link>
      )}

      {/* ── E. Constellation Mini-Map ── */}
      {/* Mobile: slightly shorter (200px via globals.css). Overlay always right-aligned */}
      {hasEntries && userMapData && (
        <div className="mb-5 rounded-xl overflow-hidden border border-gray-800 relative">
          <div className="dashboard-constellation-wrap">
            <ConstellationMapV2
              userMapData={userMapData}
              onSelectEntry={handleSelectEntry}
              selectedEntryId={null}
            />
          </div>
          <div className="absolute bottom-0 left-0 right-0 sm:left-auto bg-gradient-to-l from-gray-950 via-gray-950/90 to-transparent pl-3 sm:pl-10 pr-3 py-2.5 rounded-bl-lg pointer-events-none">
            <div className="flex items-center gap-2 sm:gap-3 pointer-events-auto flex-wrap justify-end">
              <span className="text-lg">{stats && stats.constellation ? stats.constellation.rankIcon : ''}</span>
              <span className="text-xs sm:text-sm font-medium text-white truncate">{stats && stats.constellation ? stats.constellation.rank : ''}</span>
              <span className="text-xs text-gray-500 hidden sm:inline">
                {'\u00B7 ' + (stats && stats.constellation ? stats.constellation.totalEntries : 0) + ' ' + ((stats && stats.constellation ? stats.constellation.totalEntries : 0) === 1 ? 'star' : 'stars')}
              </span>
              <Link
                href="/dashboard/constellation"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium rounded-lg transition-colors"
              >
                {'View Map '}
                <ArrowRight className="w-3.5 h-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ── F. Research Activity (compact on mobile) ── */}
      {stats?.research_activity && stats.research_activity.length > 0 && (
        <div className="mb-5 p-3 sm:p-4 bg-gray-900 rounded-xl border border-gray-800">
          <div className="flex items-center justify-between mb-2 sm:mb-3">
            <h3 className="text-sm font-semibold text-white">Research Activity</h3>
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

      {/* ── G. Research Snapshot (metric pills) ── */}
      {/* Mobile: horizontal scroll (no wrapping). Desktop: flex-wrap */}
      <div className="mb-5">
        <div className="flex gap-1.5 sm:gap-2 overflow-x-auto sm:overflow-x-visible sm:flex-wrap scrollbar-hide touch-pan-x pb-1 sm:pb-0">
          <Link
            href="/dashboard/research-hub"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-gray-900 border border-gray-800 hover:border-indigo-500/30 rounded-full text-xs sm:text-sm transition-colors group flex-shrink-0"
          >
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-white font-medium">{hub.totalArtifacts}</span>
            <span className="text-gray-500 group-hover:text-gray-400">Artifacts</span>
          </Link>
          <Link
            href="/dashboard/constellation"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-xs sm:text-sm transition-colors group flex-shrink-0"
          >
            <Star className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-white font-medium">{stats?.constellation.totalEntries || 0}</span>
            <span className="text-gray-500 group-hover:text-gray-400">Stars</span>
          </Link>
          <Link
            href="/dashboard/constellation"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-xs sm:text-sm transition-colors group flex-shrink-0"
          >
            <Link2 className="w-3.5 h-3.5 text-green-400" />
            <span className="text-white font-medium">{stats?.constellation.totalConnections || 0}</span>
            <span className="text-gray-500 group-hover:text-gray-400">Connections</span>
          </Link>
          <Link
            href="/dashboard/journal"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-xs sm:text-sm transition-colors group flex-shrink-0"
          >
            <BookOpen className="w-3.5 h-3.5 text-blue-400" />
            <span className="text-white font-medium">{stats?.journal.totalEntries || 0}</span>
            <span className="text-gray-500 group-hover:text-gray-400">Journal</span>
          </Link>
          <Link
            href="/dashboard/saved"
            className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3.5 py-1.5 sm:py-2 bg-gray-900 border border-gray-800 hover:border-purple-500/30 rounded-full text-xs sm:text-sm transition-colors group flex-shrink-0"
          >
            <Bookmark className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-white font-medium">{stats?.saved.total || 0}</span>
            <span className="text-gray-500 group-hover:text-gray-400">Saved</span>
          </Link>
        </div>
      </div>

      {/* ── H. Suggested Explorations ── */}
      {suggestions.length > 0 && (
        <div className="mb-5">
          <h3 className="text-sm font-semibold text-white mb-3">Suggested Explorations</h3>
          {/* Mobile: horizontal scroll. Desktop: grid */}
          <div className="sm:hidden">
            <MobileCardRow
              cardWidthPercent={80}
              minCardWidth={240}
              maxCardWidth={300}
            >
              {suggestions.map(function(suggestion) {
                var config = CATEGORY_CONFIG[suggestion.category as keyof typeof CATEGORY_CONFIG]
                return (
                  <MobileCardRowItem
                    key={suggestion.category}
                    widthPercent={80}
                    minWidth={240}
                    maxWidth={300}
                  >
                    <Link
                      href={'/explore?category=' + suggestion.category}
                      className="block p-3.5 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-500/30 transition-all h-full"
                    >
                      <div className="flex items-center gap-2.5 mb-1.5">
                        <span className="text-lg">{config?.icon || '\u2728'}</span>
                        <span className="text-sm font-medium text-white">
                          {config?.label || suggestion.category}
                        </span>
                      </div>
                      <p className="text-xs text-gray-500 line-clamp-2">{suggestion.reason}</p>
                    </Link>
                  </MobileCardRowItem>
                )
              })}
            </MobileCardRow>
          </div>
          <div className="hidden sm:grid grid-cols-3 gap-2.5">
            {suggestions.map(function(suggestion) {
              var config = CATEGORY_CONFIG[suggestion.category as keyof typeof CATEGORY_CONFIG]
              return (
                <Link
                  key={suggestion.category}
                  href={'/explore?category=' + suggestion.category}
                  className="group p-3.5 bg-gray-900 border border-gray-800 rounded-xl hover:border-purple-500/30 transition-all"
                >
                  <div className="flex items-center gap-2.5 mb-1.5">
                    <span className="text-lg">{config?.icon || '\u2728'}</span>
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

      {/* ── I. Account & Usage (compact footer) ── */}
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
