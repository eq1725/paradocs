'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { X, TrendingUp, BookOpen, Compass, Plus, Check, ArrowRight, Sparkles, Eye, Star } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { PhenomenonCategory } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import {
  getNode,
  getConnectedCategories,
  ConstellationStats,
} from '@/lib/constellation-data'
import { supabase } from '@/lib/supabase'
import { classNames } from '@/lib/utils'

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

interface ConstellationPanelProps {
  category: PhenomenonCategory | null
  onClose: () => void
  userInterests: PhenomenonCategory[]
  onToggleInterest: (category: PhenomenonCategory) => void
  stats?: ConstellationStats[]
  userMapData?: UserMapData | null
}

interface TrendingReport {
  id: string
  title: string
  slug: string
  upvotes: number
  view_count: number
  created_at: string
}

export default function ConstellationPanel({
  category,
  onClose,
  userInterests,
  onToggleInterest,
  stats = [],
  userMapData,
}: ConstellationPanelProps) {
  const [trendingReports, setTrendingReports] = useState<TrendingReport[]>([])
  const [reportCount, setReportCount] = useState(0)
  const [loading, setLoading] = useState(false)

  const node = category ? getNode(category) : null
  const categoryConfig = category ? CATEGORY_CONFIG[category] : null
  const connections = category ? getConnectedCategories(category) : []
  const isFollowing = category ? userInterests.includes(category) : false
  const catStats = category ? stats.find(s => s.category === category) : null

  // Load trending reports for this category
  useEffect(() => {
    if (!category) return

    async function loadData() {
      setLoading(true)
      try {
        // Get total report count
        const { count } = await supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('category', category!)
          .eq('status', 'approved')

        setReportCount(count || 0)

        // Get trending reports (most upvoted recently)
        const { data } = await supabase
          .from('reports')
          .select('id, title, slug, upvotes, view_count, created_at')
          .eq('category', category!)
          .eq('status', 'approved')
          .order('upvotes', { ascending: false })
          .limit(5)

        setTrendingReports((data as TrendingReport[]) || [])
      } catch (err) {
        console.error('Error loading constellation panel data:', err)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [category])

  return (
    <AnimatePresence>
      {category && node && (
        <motion.div
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 200 }}
          className="absolute top-0 right-0 h-full w-full sm:w-96 bg-gray-900/98 border-l border-gray-800 overflow-y-auto z-20 backdrop-blur-xl"
        >
          {/* Header */}
          <div className="sticky top-0 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{node.icon}</span>
                <div>
                  <h2 className="text-white font-bold text-lg leading-tight">{node.label}</h2>
                  <p className="text-gray-400 text-xs">{reportCount} reports</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Follow/unfollow toggle */}
            <button
              onClick={() => onToggleInterest(category)}
              className={classNames(
                'mt-3 w-full flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-medium transition-all',
                isFollowing
                  ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30 hover:bg-primary-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700 hover:text-white'
              )}
            >
              {isFollowing ? (
                <>
                  <Check className="w-4 h-4" />
                  Following this field
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  Add to my interests
                </>
              )}
            </button>
          </div>

          <div className="p-4 space-y-6">
            {/* Description */}
            <p className="text-gray-300 text-sm leading-relaxed">{node.description}</p>

            {/* Stats row */}
            {catStats && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-white font-bold text-lg">{catStats.reportCount}</div>
                  <div className="text-gray-500 text-xs">Reports</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-green-400 font-bold text-lg flex items-center justify-center gap-1">
                    <TrendingUp className="w-3.5 h-3.5" />
                    {catStats.trendingCount}
                  </div>
                  <div className="text-gray-500 text-xs">This week</div>
                </div>
                <div className="bg-gray-800/50 rounded-lg p-3 text-center">
                  <div className="text-purple-400 font-bold text-lg">{catStats.userJournalEntries}</div>
                  <div className="text-gray-500 text-xs">My notes</div>
                </div>
              </div>
            )}

            {/* Personal Discoveries in this category */}
            {userMapData && category && (() => {
              const catPhenomena = userMapData.phenomenonNodes.filter(p => p.category === category)
              const catStats = userMapData.categoryStats[category]
              if (catPhenomena.length === 0 && !catStats) return null
              return (
                <div>
                  <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
                    <Eye className="w-4 h-4 text-amber-400" />
                    Your Discoveries
                    {catStats && (
                      <span className="text-gray-500 font-normal text-xs ml-auto">
                        {catStats.uniquePhenomena} explored
                      </span>
                    )}
                  </h3>
                  {catPhenomena.length > 0 ? (
                    <div className="space-y-2">
                      {catPhenomena.slice(0, 5).map(p => (
                        <Link
                          key={p.id}
                          href={`/report/${p.slug}`}
                          className="flex items-center gap-3 p-2.5 bg-gray-800/40 hover:bg-gray-800/70 rounded-lg transition-colors group"
                        >
                          {p.imageUrl ? (
                            <img src={p.imageUrl} alt={p.name} className="w-8 h-8 rounded object-cover shrink-0"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                            />
                          ) : (
                            <div className="w-8 h-8 rounded bg-gray-700 flex items-center justify-center shrink-0">
                              <Star className="w-3 h-3 text-gray-500" />
                            </div>
                          )}
                          <div className="min-w-0 flex-1">
                            <div className="text-gray-200 text-sm font-medium group-hover:text-white truncate">{p.name}</div>
                            <div className="text-gray-500 text-xs">
                              {p.viewCount}x viewed
                              {p.isSaved && ' · Saved'}
                            </div>
                          </div>
                        </Link>
                      ))}
                    </div>
                  ) : catStats ? (
                    <p className="text-gray-500 text-sm">{catStats.views} views in this category</p>
                  ) : null}
                </div>
              )
            })()}

            {/* Trending Reports */}
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
                <TrendingUp className="w-4 h-4 text-primary-400" />
                Top Reports
              </h3>
              {loading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-12 bg-gray-800/50 rounded-lg animate-pulse" />
                  ))}
                </div>
              ) : trendingReports.length > 0 ? (
                <div className="space-y-2">
                  {trendingReports.map(report => (
                    <Link
                      key={report.id}
                      href={`/report/${report.slug}`}
                      className="block p-3 bg-gray-800/40 hover:bg-gray-800/70 rounded-lg transition-colors group"
                    >
                      <div className="text-gray-200 text-sm font-medium group-hover:text-white transition-colors line-clamp-1">
                        {report.title}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                        <span>▲ {report.upvotes}</span>
                        <span>{report.view_count} views</span>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No reports in this category yet.</p>
              )}
            </div>

            {/* Connected Phenomena */}
            <div>
              <h3 className="text-white font-semibold text-sm flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-amber-400" />
                Connected Phenomena
              </h3>
              <div className="space-y-3">
                {connections.slice(0, 5).map(conn => {
                  const connNode = getNode(conn.category)
                  if (!connNode) return null
                  const isConnFollowed = userInterests.includes(conn.category)
                  return (
                    <div
                      key={conn.category}
                      className="bg-gray-800/30 border border-gray-800 rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm">{connNode.icon}</span>
                          <span className="text-gray-200 font-medium text-sm">{connNode.label}</span>
                          {isConnFollowed && (
                            <span className="text-xs px-1.5 py-0.5 rounded-full bg-primary-500/20 text-primary-400">Following</span>
                          )}
                        </div>
                        {/* Connection strength dots */}
                        <div className="flex gap-0.5">
                          {[0.3, 0.5, 0.7, 0.9].map((threshold, i) => (
                            <div
                              key={i}
                              className={classNames(
                                'w-1.5 h-1.5 rounded-full',
                                conn.strength >= threshold ? 'bg-primary-400' : 'bg-gray-700'
                              )}
                            />
                          ))}
                        </div>
                      </div>
                      <p className="text-gray-500 text-xs leading-relaxed">{conn.description}</p>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Explore CTA */}
            <Link
              href={`/explore?category=${category}`}
              className="block w-full text-center py-3 px-4 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              <span className="flex items-center justify-center gap-2">
                <Compass className="w-4 h-4" />
                Explore {node.label} Reports
                <ArrowRight className="w-4 h-4" />
              </span>
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
