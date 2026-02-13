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
  const [streak, setStreak] = useState<{ current_streak: number; longest_streak: number; total_active_days: number } | null>(null)
  const [journalCount, setJournalCount] = useState(0)
  const [statsLoading, setStatsLoading] = useState(true)

  const userInterests = personalization?.interested_categories || []

  // Load category stats + streak + journal count
  useEffect(() => {
    async function loadStats() {
      setStatsLoading(true)
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return

        // Get report counts per category (parallel)
        const [categoryCountsResult, streakResult, journalResult] = await Promise.all([
          // Report counts per category
          supabase
            .from('reports')
            .select('category', { count: 'exact', head: false })
            .eq('status', 'approved'),
          // User streak
          Promise.resolve(
            supabase
              .from('user_streaks' as any)
              .select('current_streak, longest_streak, total_active_days')
              .eq('user_id', session.user.id)
              .single()
          ).then(r => r as any).catch(() => ({ data: null })),
          // Journal entry count
          Promise.resolve(
            supabase
              .from('journal_entries' as any)
              .select('*', { count: 'exact', head: true })
              .eq('user_id', session.user.id)
          ).then(r => r as any).catch(() => ({ count: 0 })),
        ])

        // Process category counts
        if (categoryCountsResult.data) {
          const countMap = new Map<string, number>()
          categoryCountsResult.data.forEach((r: any) => {
            countMap.set(r.category, (countMap.get(r.category) || 0) + 1)
          })

          // Get new reports this week
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
            userJournalEntries: 0, // TODO: per-category journal counts
          }))

          setStats(categoryStats)
        }

        if (streakResult?.data) {
          setStreak(streakResult.data)
        }

        setJournalCount(journalResult?.count || 0)
      } catch (err) {
        console.error('Error loading constellation stats:', err)
      } finally {
        setStatsLoading(false)
      }
    }

    loadStats()
  }, [])

  // Toggle interest for a category
  const handleToggleInterest = useCallback(async (category: PhenomenonCategory) => {
    const current = userInterests
    const updated = current.includes(category)
      ? current.filter(c => c !== category)
      : [...current, category]

    await updateInterests(updated)
  }, [userInterests, updateInterests])

  // Suggested explorations based on current interests
  const suggestions = getSuggestedExplorations(userInterests, 3)

  return (
    <DashboardLayout title="My Constellation">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* Interests count */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Stars className="w-3.5 h-3.5" />
              Active Interests
            </div>
            <div className="text-2xl font-bold text-white">{userInterests.length}</div>
            <div className="text-gray-500 text-xs">of 10 fields</div>
          </div>

          {/* Research streak */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <Flame className="w-3.5 h-3.5 text-orange-400" />
              Research Streak
            </div>
            <div className="text-2xl font-bold text-white">
              {streak?.current_streak || 0}
            </div>
            <div className="text-gray-500 text-xs">
              {streak?.current_streak === 1 ? 'day' : 'days'} consecutive
            </div>
          </div>

          {/* Journal entries */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <BookOpen className="w-3.5 h-3.5 text-blue-400" />
              Journal Entries
            </div>
            <div className="text-2xl font-bold text-white">{journalCount}</div>
            <div className="text-gray-500 text-xs">research notes</div>
          </div>

          {/* Trending this week */}
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
            <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-400" />
              New This Week
            </div>
            <div className="text-2xl font-bold text-white">
              {stats.reduce((sum, s) => sum + s.trendingCount, 0)}
            </div>
            <div className="text-gray-500 text-xs">reports added</div>
          </div>
        </div>

        {/* Main constellation area */}
        <div className="relative bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden" style={{ minHeight: '500px' }}>
          {/* The map */}
          <div className="w-full" style={{ height: '60vh', minHeight: '500px' }}>
            <ConstellationMap
              userInterests={userInterests}
              stats={stats}
              onNodeClick={setSelectedCategory}
              selectedNode={selectedCategory}
            />
          </div>

          {/* No interests prompt */}
          {!personalLoading && !hasInterests && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-950/80 backdrop-blur-sm z-10">
              <div className="text-center max-w-md px-6">
                <Stars className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                <h2 className="text-white text-xl font-bold mb-2">Build Your Research Universe</h2>
                <p className="text-gray-400 text-sm mb-6">
                  Select the phenomena you&apos;re interested in to light up your constellation.
                  Each star represents a field of study, and we&apos;ll show you how they connect.
                </p>
                <Link
                  href="/dashboard/settings"
                  className="inline-flex items-center gap-2 px-6 py-3 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium transition-colors"
                >
                  Choose Your Interests
                </Link>
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
          />

          {/* Legend (bottom-left) */}
          <div className="absolute bottom-4 left-4 bg-gray-900/90 backdrop-blur-sm border border-gray-800 rounded-lg px-3 py-2 text-xs space-y-1.5">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary-400 shadow-[0_0_6px_rgba(139,92,246,0.5)]" />
              <span className="text-gray-300">Your interests</span>
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

        {/* Suggested explorations */}
        {suggestions.length > 0 && (
          <div>
            <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-4">
              <Compass className="w-5 h-5 text-amber-400" />
              Suggested Explorations
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                    {/* Connection strength indicator */}
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

        {/* How it works */}
        <div className="bg-gray-900/50 border border-gray-800 rounded-xl p-6">
          <h3 className="text-white font-semibold flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-gray-400" />
            How Your Constellation Works
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-primary-400 font-medium mb-1">Bright Stars</p>
              <p className="text-gray-400">Fields you&apos;re actively following. Click to see reports, trends, and connections.</p>
            </div>
            <div>
              <p className="text-amber-400 font-medium mb-1">Connections</p>
              <p className="text-gray-400">Lines between stars show how phenomena relate. Stronger connections glow brighter.</p>
            </div>
            <div>
              <p className="text-gray-300 font-medium mb-1">Dim Stars</p>
              <p className="text-gray-400">Unexplored fields. Click to learn about them and add them to your research universe.</p>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
