'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/router'
import {
  Stars,
  Flame,
  BookOpen,
  TrendingUp,
  Compass,
  Info,
  Trophy,
  Eye,
  Bookmark,
  Sparkles,
  ChevronRight,
} from 'lucide-react'
import { DashboardLayout } from '@/components/dashboard/DashboardLayout'
import ConstellationMap from '@/components/dashboard/ConstellationMap'
import ConstellationPanel from '@/components/dashboard/ConstellationPanel'
import { usePersonalization } from '@/lib/hooks/usePersonalization'
import { supabase } from '@/lib/supabase'
import { PhenomenonCategory } from '@/lib/database.types'
import { ConstellationStats, getSuggestedExplorations, getNode } from '@/lib/constellation-data'
import { classNames } from '@/lib/utils'
import Link from 'next/link'

// Explorer rank configuration
const RANKS = [
  { name: 'Casual Stargazer', minViewed: 0, icon: '🔭', color: 'text-gray-400' },
  { name: 'Amateur Astronomer', minViewed: 10, icon: '🌟', color: 'text-blue-400' },
  { name: 'Seasoned Explorer', minViewed: 50, icon: '🚀', color: 'text-purple-400' },
  { name: 'Master Cartographer', minViewed: 100, icon: '🗺️', color: 'text-amber-400' },
]

interface UserMapData {
  categoryStats: Record<string, { views: number; saves: number; uniquePhenomena: number }>
  phenomenonNodes: Array<{
    id: string
    name: string
    slug: string
    category: string
    imageUrl: string | null
    dangerLevel: string | null
    firstViewed: string
    viewCount: number
    isSaved: boolean
  }>
  trail: Array<{ phenomenonId: string; timestamp: string; category: string }>
  stats: {
    totalViewed: number
    totalPhenomena: number
    categoriesExplored: number
    totalCategories: number
    currentStreak: number
    longestStreak: number
    totalSaved: number
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

  const userInterests = personalization?.interested_categories || []

  // Load category stats (global) + personal constellation data
  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

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
            userJournalEntries: 0,
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
    ? Math.min(100, Math.round((mapStats.totalViewed / nextRank.minViewed) * 100))
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
                {mapStats?.totalViewed || 0} of {mapStats?.totalPhenomena || 592} phenomena discovered
              </p>
              {/* Progress bar to next rank */}
              {currentRank !== RANKS[RANKS.length - 1] && (
                <div className="mt-2">
                  <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                    <span>Next: {nextRank.icon} {nextRank.name}</span>
                    <span>{mapStats?.totalViewed || 0}/{nextRank.minViewed}</span>
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

        {/* Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Eye className="w-3.5 h-3.5" />
              Stars Discovered
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.totalViewed || 0}</div>
            <div className="text-gray-500 text-xs">of {mapStats?.totalPhenomena || 592}</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Compass className="w-3.5 h-3.5 text-purple-400" />
              Categories
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.categoriesExplored || 0}</div>
            <div className="text-gray-500 text-xs">of {mapStats?.totalCategories || 11} touched</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Research Streak
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.currentStreak || 0}</div>
            <div className="text-gray-500 text-xs">{(mapStats?.currentStreak || 0) === 1 ? 'day' : 'days'} consecutive</div>
          </div>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-3 sm:p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Bookmark className="w-3.5 h-3.5 text-blue-400" />
              Saved
            </div>
            <div className="text-xl sm:text-2xl font-bold text-white">{mapStats?.totalSaved || 0}</div>
            <div className="text-gray-500 text-xs">bookmarked</div>
          </div>
        </div>

        {/* Main constellation area */}
        <div className="relative bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
          <div className="w-full" style={{ height: 'clamp(320px, 55vh, 600px)' }}>
            <ConstellationMap
              userInterests={userInterests}
              stats={stats}
              onNodeClick={setSelectedCategory}
              selectedNode={selectedCategory}
              userMapData={userMapData}
            />
          </div>

          {/* Empty state for new users */}
          {!personalLoading && !hasInterests && (!mapStats || mapStats.totalViewed === 0) && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm z-10">
              <div className="text-center max-w-md px-6">
                <Stars className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                <h2 className="text-white text-xl font-bold mb-2">Your Constellation Awaits</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Every phenomenon you discover becomes a star in your personal constellation.
                  Start exploring to watch your research universe grow.
                </p>
                <div className="flex flex-col sm:flex-row gap-3 justify-center">
                  <Link
                    href="/discover"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
                  >
                    <Sparkles className="w-4 h-4" />
                    Start Discovering
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg font-medium transition-colors"
                  >
                    Choose Interests
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Slide-out panel */}
          <ConstellationPanel
            category={selectedCategory}
            onClose={() => setSelectedCategory(null)}
            userInterests={userInterests}
            onToggleInterest={handleToggleInterest}
            stats={stats}
            userMapData={userMapData}
          />

          {/* Legend */}
          <div className="absolute bottom-2 left-2 sm:bottom-4 sm:left-4 bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg px-2 py-1.5 sm:px-3 sm:py-2 text-[10px] sm:text-xs space-y-1 sm:space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary-400 shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
              <span className="text-gray-300">Your interests</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
              <span className="text-gray-400">Discovered phenomena</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-600" />
              <span className="text-gray-500">Unexplored fields</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-px bg-primary-400/40" />
              <span className="text-gray-500">Connected phenomena</span>
            </div>
          </div>
        </div>

        {/* Recently Discovered Trail */}
        {userMapData && userMapData.phenomenonNodes.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
              <Eye className="w-5 h-5 text-primary-400" />
              Recently Discovered
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {userMapData.phenomenonNodes.slice(0, 6).map(p => (
                <Link
                  key={p.id}
                  href={`/report/${p.slug}`}
                  className="flex items-center gap-3 bg-gray-900 border border-gray-800 hover:border-primary-500/30 rounded-xl p-3 transition-all group"
                >
                  {p.imageUrl ? (
                    <img
                      src={p.imageUrl}
                      alt={p.name}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-gray-800 flex items-center justify-center shrink-0">
                      <Stars className="w-4 h-4 text-gray-600" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="text-gray-200 text-sm font-medium group-hover:text-white transition-colors truncate">
                      {p.name}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <span>{p.viewCount}x viewed</span>
                      {p.isSaved && <Bookmark className="w-3 h-3 text-blue-400" />}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-600 group-hover:text-primary-400 transition-colors shrink-0" />
                </Link>
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
                    <div className="flex items-center gap-1.5 mt-3">
                      <span className="text-gray-600 text-xs">Connection:</span>
                      <div className="flex gap-0.5">
                        {[0.3, 0.5, 0.7, 0.9].map((threshold, i) => (
                          <div
                            key={i}
                            className={classNames(
                              'w-2 h-2 rounded-full',
                              suggestion.strength >= threshold ? 'bg-amber-400' : 'bg-gray-800'
                            )}
                          />
                        ))}
                      </div>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* How it works - simplified */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-4 sm:p-6">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3 text-sm sm:text-base">
            <Info className="w-4 h-4 text-gray-400" />
            How Your Constellation Works
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-primary-400 font-medium mb-1">Explore & Discover</p>
              <p className="text-gray-400">Every phenomenon you view becomes a star in your constellation, clustered around its category.</p>
            </div>
            <div>
              <p className="text-amber-400 font-medium mb-1">Watch It Grow</p>
              <p className="text-gray-400">The more you explore, the richer your map becomes. Cross-category connections emerge over time.</p>
            </div>
            <div>
              <p className="text-green-400 font-medium mb-1">Level Up</p>
              <p className="text-gray-400">Discover more phenomena to advance from Casual Stargazer to Master Cartographer.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
