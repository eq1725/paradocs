'use client'

import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import {
  Stars,
  Flame,
  BookOpen,
  TrendingUp,
  Compass,
  Info,
  Trophy,
  Star,
  Tag,
  Link2,
  Sparkles,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X as XIcon,
  Lightbulb,
  Share2,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import ConstellationMap from '@/components/dashboard/ConstellationMap'
import ConstellationMapV2 from '@/components/dashboard/ConstellationMapV2'
import ConstellationPanel from '@/components/dashboard/ConstellationPanel'
import NodeDetailPanel from '@/components/dashboard/NodeDetailPanel'
import ConnectionDrawer, { ConnectionData } from '@/components/dashboard/ConnectionDrawer'
import TheoryPanel, { TheoryData } from '@/components/dashboard/TheoryPanel'
import ShareConstellation from '@/components/dashboard/ShareConstellation'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { ConstellationStats, getSuggestedExplorations, getNode } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

// Verdict display config
const VERDICT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  compelling: { icon: '✦', color: 'text-amber-400', label: 'Compelling' },
  inconclusive: { icon: '◐', color: 'text-blue-400', label: 'Inconclusive' },
  skeptical: { icon: '⊘', color: 'text-gray-400', label: 'Skeptical' },
  needs_info: { icon: '?', color: 'text-purple-400', label: 'Need More Info' },
}

// Explorer rank configuration (new system)
const RANKS = [
  { name: 'Stargazer', minEntries: 0, icon: '🔭', color: 'text-gray-400', desc: 'Log your first entries' },
  { name: 'Field Researcher', minEntries: 3, icon: '📋', color: 'text-blue-400', desc: '3+ entries with notes' },
  { name: 'Pattern Seeker', minEntries: 10, icon: '🔍', color: 'text-purple-400', desc: '10+ entries, 5+ tags, connections' },
  { name: 'Cartographer', minEntries: 25, icon: '🗺️', color: 'text-amber-400', desc: '25+ entries across 6+ categories' },
  { name: 'Master Archivist', minEntries: 50, icon: '📜', color: 'text-red-400', desc: '50+ entries, 8+ categories, 10+ connections' },
]

export interface EntryNode {
  id: string
  reportId: string
  name: string
  slug: string
  category: string
  imageUrl: string | null
  locationName: string | null
  eventDate: string | null
  summary: string | null
  note: string
  verdict: string
  tags: string[]
  loggedAt: string
  updatedAt: string
}

export interface UserMapData {
  entryNodes: EntryNode[]
  categoryStats: Record<string, { entries: number; verdicts: Record<string, number> }>
  tagConnections: Array<{ tag: string; entryIds: string[] }>
  trail: Array<{ entryId: string; reportId: string; category: string; timestamp: string }>
  userConnections?: ConnectionData[]
  userTheories?: TheoryData[]
  stats: {
    totalEntries: number
    totalPhenomena: number
    categoriesExplored: number
    totalCategories: number
    uniqueTags: number
    notesWritten: number
    connectionsFound: number
    drawnConnections?: number
    theoryCount?: number
    currentStreak: number
    longestStreak: number
    rank: string
    rankLevel: number
  }
}

export default function ConstellationPage() {
  const router = useRouter()
  const {
    data: personalization,
    loading: personalLoading,
    updateInterests,
    hasInterests,
  } = usePersonalization()

  const [selectedCategory, setSelectedCategory] = useState<PhenomenonCategory | null>(null)
  const [stats, setStats] = useState<ConstellationStats[]>([])
  const [userMapData, setUserMapData] = useState<UserMapData | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [connectionDrawerOpen, setConnectionDrawerOpen] = useState(false)
  const [theoryPanelOpen, setTheoryPanelOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [userToken, setUserToken] = useState('')
  const [isProfilePublic, setIsProfilePublic] = useState(false)
  const [displayName, setDisplayName] = useState('')
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<EntryNode | null>(null)
  const [guideCollapsed, setGuideCollapsed] = useState(true) // default collapsed, will resolve on mount

  // Persist guide collapsed state in localStorage
  useEffect(() => {
    const dismissed = localStorage.getItem('paradocs_constellation_guide_dismissed')
    if (dismissed === 'true') {
      setGuideCollapsed(true)
    } else {
      setGuideCollapsed(false)
    }
  }, [])

  // Auto-collapse for experienced users (10+ entries)
  useEffect(() => {
    const totalEntries = userMapData?.stats?.totalEntries || 0
    if (totalEntries >= 10) {
      const hasSeenAutoCollapse = localStorage.getItem('paradocs_constellation_guide_auto_collapsed')
      if (!hasSeenAutoCollapse) {
        setGuideCollapsed(true)
        localStorage.setItem('paradocs_constellation_guide_dismissed', 'true')
        localStorage.setItem('paradocs_constellation_guide_auto_collapsed', 'true')
      }
    }
  }, [userMapData])

  const handleDismissGuide = useCallback(() => {
    setGuideCollapsed(true)
    localStorage.setItem('paradocs_constellation_guide_dismissed', 'true')
  }, [])

  const handleExpandGuide = useCallback(() => {
    setGuideCollapsed(false)
    localStorage.removeItem('paradocs_constellation_guide_dismissed')
  }, [])

  const userInterests = personalization?.interested_categories || []

  // Reload user map data (used after creating connections/theories)
  const reloadUserMap = useCallback(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.access_token) return
      const result = await fetch('/api/constellation/user-map', {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      }).then(r => r.json()).catch(() => null)
      if (result) setUserMapData(result)
    } catch (err) {
      console.error('Error reloading user map:', err)
    }
  }, [])

  // Load category stats (global) + personal constellation data
  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Store token for child components
        setUserToken(session.access_token)

        // Fetch profile info for sharing
        const { data: profile } = await supabase
          .from('profiles')
          .select('display_name, constellation_public')
          .eq('id', session.user.id)
          .single()
        if (profile) {
          setDisplayName(profile.display_name || session.user.email?.split('@')[0] || '')
          setIsProfilePublic(profile.constellation_public || false)
        }

        // Parallel: global category counts + user map data
        const [categoryCountsResult, userMapResult] = await Promise.all([
          supabase
            .from('reports')
            .select('category', { count: 'exact', head: false })
            .eq('status', 'approved'),
          fetch('/api/constellation/user-map', {
            headers: { 'Authorization': `Bearer ${session.access_token}` },
          }).then(r => r.json()).catch(() => null),
        ])

        // Process global category counts
        if (categoryCountsResult.data) {
          const countMap = new Map<string, number>()
          categoryCountsResult.data.forEach((r: any) => {
            countMap.set(r.category, (countMap.get(r.category) || 0) + 1)
          })

          const weekAgo = new Date()
          weekAgo.setDate(weekAgo.getDate() - 7)
          const { data: recentReports } = await supabase
            .from('reports')
            .select('category')
            .eq('status', 'approved')
            .gte('created_at', weekAgo.toISOString())

          const trendingMap = new Map<string, number>()
          if (recentReports) {
            recentReports.forEach((r: any) => {
              trendingMap.set(r.category, (trendingMap.get(r.category) || 0) + 1)
            })
          }

          const categoryStats: ConstellationStats[] = [
            'ufos_aliens', 'cryptids', 'ghosts_hauntings', 'psychic_phenomena',
            'consciousness_practices', 'psychological_experiences', 'biological_factors',
            'perception_sensory', 'religion_mythology', 'esoteric_practices', 'combination'
          ].map(cat => ({
            category: cat as PhenomenonCategory,
            reportCount: countMap.get(cat) || 0,
            trendingCount: trendingMap.get(cat) || 0,
            userJournalEntries: userMapResult?.categoryStats?.[cat]?.entries || 0,
          }))

          setStats(categoryStats)
        }

        if (userMapResult) {
          setUserMapData(userMapResult)
        }
      } catch (err) {
        console.error('Error loading constellation stats:', err)
      } finally {
        setStatsLoading(false)
      }
    }

    loadStats()
  }, [])

  const handleToggleInterest = useCallback(async (category: PhenomenonCategory) => {
    const current = userInterests
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category]
    await updateInterests(updated)
  }, [userInterests, updateInterests])

  const suggestions = getSuggestedExplorations(userInterests, 3)
  const mapStats = userMapData?.stats
  const currentRank = RANKS.find(r => r.name === mapStats?.rank) || RANKS[0]
  const nextRank = RANKS[Math.min((currentRank ? RANKS.indexOf(currentRank) : 0) + 1, RANKS.length - 1)]
  const progressToNext = mapStats
    ? Math.min(100, Math.round((mapStats.totalEntries / nextRank.minEntries) * 100))
    : 0

  return (
    <DashboardLayout title="My Constellation">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Explorer Rank Banner */}
        <div className="bg-gradient-to-r from-gray-900 via-gray-900 to-primary-900/20 border border-gray-800 rounded-2xl p-4 sm:p-6">
          <div className="flex items-center gap-4">
            <div className="text-3xl sm:text-4xl">{currentRank.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={classNames('font-bold text-lg sm:text-xl', currentRank.color)}>
                  {currentRank.name}
                </span>
                <Trophy className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-gray-500 text-xs sm:text-sm">
                {mapStats?.totalEntries || 0} entries logged across {mapStats?.categoriesExplored || 0} categories
              </p>
              {/* Progress bar to next rank */}
              {currentRank !== RANKS[RANKS.length - 1] && nextRank.minEntries > 0 && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Next: {nextRank.icon} {nextRank.name}</span>
                    <span>{mapStats?.totalEntries || 0}/{nextRank.minEntries} entries</span>
                  </div>
                  <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-primary-600 to-primary-400 rounded-full transition-all duration-500"
                      style={{ width: `${progressToNext}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* How Your Constellation Works - Collapsible Guide */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl overflow-hidden transition-all duration-300">
          {guideCollapsed ? (
            <button
              onClick={handleExpandGuide}
              className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-900/80 transition-colors group"
            >
              <div className="flex items-center gap-2 text-gray-400 text-sm">
                <Info className="w-4 h-4" />
                <span className="font-medium">How Your Constellation Works</span>
              </div>
              <ChevronDown className="w-4 h-4 text-gray-500 group-hover:text-gray-300 transition-colors" />
            </button>
          ) : (
            <div className="p-4 sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold flex items-center gap-2 text-sm sm:text-base">
                  <Info className="w-4 h-4 text-gray-400" />
                  How Your Constellation Works
                </h3>
                <button
                  onClick={handleDismissGuide}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-300 transition-colors px-2 py-1 rounded-lg hover:bg-gray-800"
                  title="Dismiss guide"
                >
                  <span className="hidden sm:inline">Got it</span>
                  <XIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-purple-500/20 text-purple-400 flex items-center justify-center text-xs font-bold shrink-0">1</span>
                    <p className="text-purple-400 font-medium">Log Entries</p>
                  </div>
                  <p className="text-gray-400 pl-8">Browse reports, tap the <Star className="w-3 h-3 inline text-purple-400" /> Log button, and add your verdict, notes, and tags. Each entry becomes a star.</p>
                  {mapStats && mapStats.totalEntries > 0 && (
                    <div className="pl-8 mt-1.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Done - {mapStats.totalEntries} logged</span></div>
                  )}
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-green-500/20 text-green-400 flex items-center justify-center text-xs font-bold shrink-0">2</span>
                    <p className="text-green-400 font-medium">Draw Connections</p>
                  </div>
                  <p className="text-gray-400 pl-8">Spot a pattern between two entries? Use the Draw Connection button to link them and describe the relationship you see.</p>
                  {(mapStats?.drawnConnections || 0) > 0 && (
                    <div className="pl-8 mt-1.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Done - {mapStats?.drawnConnections} drawn</span></div>
                  )}
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center text-xs font-bold shrink-0">3</span>
                    <p className="text-amber-400 font-medium">Build Theories</p>
                  </div>
                  <p className="text-gray-400 pl-8">Group related entries and connections into a theory with a written thesis. Name your hypothesis and track supporting evidence.</p>
                  {(mapStats?.theoryCount || 0) > 0 && (
                    <div className="pl-8 mt-1.5"><span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-400">Done - {mapStats?.theoryCount} created</span></div>
                  )}
                </div>
                <div className="relative">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold shrink-0">4</span>
                    <p className="text-blue-400 font-medium">Share & Rank Up</p>
                  </div>
                  <p className="text-gray-400 pl-8">Share your constellation publicly, export as an image, or copy a link. Progress from Stargazer to Master Archivist as you explore.</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Star className="w-3.5 h-3.5 text-purple-400" />
              Entries Logged
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.totalEntries || 0}</div>
            <div className="text-gray-500 text-xs">of {mapStats?.totalPhenomena || 592} phenomena</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Compass className="w-3.5 h-3.5 text-blue-400" />
              Categories
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.categoriesExplored || 0}</div>
            <div className="text-gray-500 text-xs">of {mapStats?.totalCategories || 11} explored</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Tag className="w-3.5 h-3.5 text-amber-400" />
              Tags Created
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.uniqueTags || 0}</div>
            <div className="text-gray-500 text-xs">unique research tags</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Link2 className="w-3.5 h-3.5 text-green-400" />
              Connections
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">
              {(mapStats?.connectionsFound || 0) + (mapStats?.drawnConnections || 0)}
            </div>
            <div className="text-gray-500 text-xs">
              {mapStats?.drawnConnections ? `${mapStats.drawnConnections} drawn · ` : ''}
              {mapStats?.connectionsFound || 0} via tags
            </div>
          </div>
        </div>

        {/* Phase 2/3: Action Buttons - always visible */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => mapStats && mapStats.totalEntries > 0 ? setConnectionDrawerOpen(true) : null}
            disabled={!mapStats || mapStats.totalEntries < 2}
            title={!mapStats || mapStats.totalEntries < 2 ? 'Log at least 2 entries to draw connections' : 'Draw a connection between entries'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-green-500/40 text-gray-300 hover:text-green-400 disabled:opacity-40 disabled:hover:border-gray-700 disabled:hover:text-gray-300 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all"
          >
            <Link2 className="w-4 h-4" />
            Draw Connection
            {!mapStats || mapStats.totalEntries < 2 ? (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-700 text-gray-500">2+ entries</span>
            ) : null}
          </button>
          <button
            onClick={() => mapStats && mapStats.totalEntries > 0 ? setTheoryPanelOpen(true) : null}
            disabled={!mapStats || mapStats.totalEntries === 0}
            title={!mapStats || mapStats.totalEntries === 0 ? 'Log entries first to build theories' : 'Create and manage your theories'}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-amber-500/40 text-gray-300 hover:text-amber-400 disabled:opacity-40 disabled:hover:border-gray-700 disabled:hover:text-gray-300 disabled:cursor-not-allowed rounded-xl text-sm font-medium transition-all"
          >
            <Lightbulb className="w-4 h-4" />
            Theories
            {(mapStats?.theoryCount || 0) > 0 && (
              <span className="text-xs px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-400">
                {mapStats?.theoryCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setShareOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-900 border border-gray-700 hover:border-purple-500/40 text-gray-300 hover:text-purple-400 rounded-xl text-sm font-medium transition-all"
          >
            <Share2 className="w-4 h-4" />
            Share
          </button>
        </div>

        {/* Main constellation area — V2 interactive star map */}
        <div className="relative bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
          <ConstellationMapV2
            userMapData={userMapData}
            onSelectEntry={setSelectedEntry}
            selectedEntryId={selectedEntry?.id}
          />

          {/* Node detail slide-out panel */}
          {selectedEntry && (
            <NodeDetailPanel
              entry={selectedEntry}
              userMapData={userMapData}
              onClose={() => setSelectedEntry(null)}
              onTagClick={(tag) => {
                // Could filter/highlight by tag in future
                setSelectedEntry(null)
              }}
              onEntryClick={(entryId) => {
                const entry = userMapData?.entryNodes.find(e => e.id === entryId)
                if (entry) setSelectedEntry(entry)
              }}
            />
          )}

          {/* Category panel (from suggested explorations) */}
          <ConstellationPanel
            category={selectedCategory}
            onClose={() => setSelectedCategory(null)}
            userInterests={userInterests}
            onToggleInterest={handleToggleInterest}
            stats={stats}
            userMapData={userMapData}
          />
        </div>

        {/* Recently Logged Entries */}
        {userMapData && userMapData.entryNodes.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
              <Star className="w-5 h-5 text-purple-400" />
              Your Research Log
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {userMapData.entryNodes.slice(0, 6).map(entry => {
                const vc = VERDICT_CONFIG[entry.verdict] || VERDICT_CONFIG.needs_info
                return (
                  <Link
                    key={entry.id}
                    href={`/report/${entry.slug}`}
                    className="flex items-start gap-3 bg-gray-900 border border-gray-800 hover:border-primary-500/30 rounded-xl p-3 transition-all group"
                  >
                    {entry.imageUrl ? (
                      <img
                        src={entry.imageUrl}
                        alt={entry.name}
                        className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5"
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center shrink-0 mt-0.5">
                        <Stars className="w-4 h-4 text-gray-600" />
                      </div>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-gray-200 text-sm font-medium group-hover:text-white transition-colors truncate">
                        {entry.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs mt-0.5">
                        <span className={vc.color}>{vc.icon} {vc.label}</span>
                      </div>
                      {entry.note && (
                        <p className="text-gray-500 text-xs mt-1 line-clamp-1">{entry.note}</p>
                      )}
                      {entry.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {entry.tags.slice(0, 3).map(tag => (
                            <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-400">
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-primary-400 transition-colors shrink-0 mt-1" />
                  </Link>
                )
              })}
            </div>
          </div>
        )}

        {/* Tag Connections */}
        {userMapData && userMapData.tagConnections.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-green-400" />
              Your Connections
              <span className="text-gray-500 text-sm font-normal">({userMapData.tagConnections.length} found)</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {userMapData.tagConnections.slice(0, 4).map(conn => {
                const connectedEntries = userMapData.entryNodes.filter(e => conn.entryIds.includes(e.id))
                return (
                  <div
                    key={conn.tag}
                    className="bg-gray-900 border border-gray-800 rounded-xl p-3"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 font-medium">
                        #{conn.tag}
                      </span>
                      <span className="text-gray-500 text-xs">{conn.entryIds.length} entries</span>
                    </div>
                    <div className="space-y-1">
                      {connectedEntries.slice(0, 3).map(entry => (
                        <Link
                          key={entry.id}
                          href={`/report/${entry.slug}`}
                          className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          <span className={VERDICT_CONFIG[entry.verdict]?.color || 'text-gray-400'}>
                            {VERDICT_CONFIG[entry.verdict]?.icon || '?'}
                          </span>
                          <span className="truncate">{entry.name}</span>
                        </Link>
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* User-Drawn Connections (Phase 2) */}
        {userMapData?.userConnections && userMapData.userConnections.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
              <Link2 className="w-5 h-5 text-green-400" />
              Your Drawn Connections
              <span className="text-gray-500 text-sm font-normal">({userMapData.userConnections.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {userMapData.userConnections.slice(0, 6).map(conn => {
                const entryA = userMapData.entryNodes.find(e => e.id === conn.entryAId)
                const entryB = userMapData.entryNodes.find(e => e.id === conn.entryBId)
                return (
                  <div key={conn.id} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-gray-200 truncate">{entryA?.name || 'Entry'}</span>
                      <Link2 className="w-3 h-3 text-green-500 shrink-0" />
                      <span className="text-gray-200 truncate">{entryB?.name || 'Entry'}</span>
                    </div>
                    {conn.annotation && (
                      <p className="text-gray-500 text-xs mt-1 line-clamp-2">{conn.annotation}</p>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* User Theories (Phase 2) */}
        {userMapData?.userTheories && userMapData.userTheories.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
              <Lightbulb className="w-5 h-5 text-amber-400" />
              Your Theories
              <span className="text-gray-500 text-sm font-normal">({userMapData.userTheories.length})</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {userMapData.userTheories.slice(0, 4).map(theory => (
                <div key={theory.id} className="bg-gray-900 border border-gray-800 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="text-white font-medium text-sm">{theory.title}</h3>
                    {theory.is_public && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-400 shrink-0">Public</span>
                    )}
                  </div>
                  {theory.thesis && (
                    <p className="text-gray-400 text-xs mt-1 line-clamp-2">{theory.thesis}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
                    <span>{theory.entry_ids?.length || 0} entries</span>
                    <span>{theory.connection_ids?.length || 0} connections</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Suggested explorations */}
        {suggestions.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3 sm:mb-4">
              <Compass className="w-5 h-5 text-amber-400" />
              Suggested Explorations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
              {suggestions.map(suggestion => {
                const node = getNode(suggestion.category)
                if (!node) return null
                return (
                  <button
                    key={suggestion.category}
                    onClick={() => setSelectedCategory(suggestion.category)}
                    className="bg-gray-900 border border-gray-800 hover:border-primary-500/30 rounded-xl p-4 text-left transition-all group"
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-2xl">{node.icon}</span>
                      <div>
                        <div className="text-white font-medium group-hover:text-primary-300 transition-colors">{node.label}</div>
                        <div className="text-gray-500 text-xs">{suggestion.reason}</div>
                      </div>
                    </div>
                    <p className="text-gray-400 text-sm line-clamp-2">{node.description}</p>
                  </button>
                )
              })}
            </div>
          </div>
        )}

      </div>

      {/* Phase 2: Connection Drawer Modal */}
      {userToken && (
        <ConnectionDrawer
          isOpen={connectionDrawerOpen}
          entries={userMapData?.entryNodes || []}
          existingConnections={userMapData?.userConnections || []}
          userToken={userToken}
          onClose={() => setConnectionDrawerOpen(false)}
          onConnectionCreated={reloadUserMap}
          onConnectionDeleted={reloadUserMap}
        />
      )}

      {/* Phase 2: Theory Panel Modal */}
      {userToken && (
        <TheoryPanel
          isOpen={theoryPanelOpen}
          entries={userMapData?.entryNodes || []}
          connections={userMapData?.userConnections || []}
          theories={userMapData?.userTheories || []}
          userToken={userToken}
          onClose={() => setTheoryPanelOpen(false)}
          onTheoryChanged={reloadUserMap}
        />
      )}

      {/* Phase 3: Share Constellation Modal */}
      {userToken && (
        <ShareConstellation
          isOpen={shareOpen}
          svgRef={svgRef}
          stats={{
            totalEntries: mapStats?.totalEntries || 0,
            categoriesExplored: mapStats?.categoriesExplored || 0,
            uniqueTags: mapStats?.uniqueTags || 0,
            connectionsFound: (mapStats?.connectionsFound || 0) + (mapStats?.drawnConnections || 0),
            theoriesCount: mapStats?.theoryCount || 0,
            rank: mapStats?.rank || 'Stargazer',
            rankLevel: mapStats?.rankLevel || 1,
          }}
          username={displayName}
          isProfilePublic={isProfilePublic}
          userToken={userToken}
          onClose={() => setShareOpen(false)}
          onTogglePublic={async (pub) => {
            setIsProfilePublic(pub)
          }}
        />
      )}
    </DashboardLayout>
  )
}
