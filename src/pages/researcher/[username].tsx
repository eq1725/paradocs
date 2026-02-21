import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  Star, Compass, Tag, Link2, Lightbulb, Trophy, Lock, ArrowLeft,
  ChevronDown, ChevronRight, Globe,
} from 'lucide-react'
import ConstellationMap from '@/components/dashboard/ConstellationMap'
import { PhenomenonCategory } from '@/lib/database.types'
import { classNames } from '@/lib/utils'

const VERDICT_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  compelling: { icon: '✦', color: 'text-amber-400', label: 'Compelling' },
  inconclusive: { icon: '◐', color: 'text-blue-400', label: 'Inconclusive' },
  skeptical: { icon: '⊘', color: 'text-gray-400', label: 'Skeptical' },
  needs_info: { icon: '?', color: 'text-purple-400', label: 'Need More Info' },
}

const RANKS: Record<string, { icon: string; color: string }> = {
  'Stargazer': { icon: '🔭', color: 'text-gray-400' },
  'Field Researcher': { icon: '📋', color: 'text-blue-400' },
  'Pattern Seeker': { icon: '🔍', color: 'text-purple-400' },
  'Cartographer': { icon: '🗺️', color: 'text-amber-400' },
  'Master Archivist': { icon: '📜', color: 'text-red-400' },
}

interface PublicProfileData {
  profile: {
    displayName: string
    avatarUrl: string | null
    joinedAt: string
    isPublic: boolean
  }
  stats: {
    totalEntries: number
    categoriesExplored: number
    uniqueTags: number
    connectionsDrawn: number
    theoriesCreated: number
    rank: string
    rankLevel: number
    verdictCounts: Record<string, number>
    topCategories: Array<{ category: string; count: number }>
  }
  entryNodes: any[]
  connections: any[]
  theories: Array<{
    id: string
    title: string
    thesis: string
    entryIds: string[]
    connectionIds: string[]
    createdAt: string
    updatedAt: string
  }>
  tagConnections: Array<{ tag: string; entryIds: string[] }>
  private?: boolean
}

export default function ResearcherProfile() {
  const router = useRouter()
  const { username } = router.query
  const [data, setData] = useState<PublicProfileData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedTheory, setExpandedTheory] = useState<string | null>(null)

  useEffect(() => {
    if (!username) return
    async function load() {
      setLoading(true)
      try {
        const resp = await fetch(`/api/constellation/public-profile?username=${encodeURIComponent(username as string)}`)
        if (resp.status === 404) {
          setError('Researcher not found')
          return
        }
        const json = await resp.json()
        setData(json)
      } catch {
        setError('Failed to load profile')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [username])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-gray-500">Loading researcher profile...</div>
      </div>
    )
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="text-gray-500 text-lg mb-4">{error || 'Profile not found'}</div>
          <Link href="/explore" className="text-primary-400 hover:text-primary-300">
            ← Back to Explore
          </Link>
        </div>
      </div>
    )
  }

  if (data.private) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <Lock className="w-12 h-12 text-gray-600 mx-auto mb-4" />
          <h1 className="text-white text-xl font-bold mb-2">
            {data.profile.displayName}&apos;s Constellation
          </h1>
          <p className="text-gray-500 mb-4">This researcher&apos;s profile is private.</p>
          <Link href="/explore" className="text-primary-400 hover:text-primary-300">
            ← Back to Explore
          </Link>
        </div>
      </div>
    )
  }

  const { profile, stats, entryNodes, theories, tagConnections } = data
  const rankInfo = RANKS[stats.rank] || RANKS['Stargazer']

  // Build user map data for constellation rendering
  const userMapData = {
    entryNodes: entryNodes.map((e: any) => ({
      ...e,
      note: '', // Don't show private notes on public profile
      updatedAt: e.loggedAt,
    })),
    categoryStats: {} as Record<string, { entries: number; verdicts: Record<string, number> }>,
    tagConnections,
    trail: entryNodes
      .slice()
      .sort((a: any, b: any) => new Date(a.loggedAt).getTime() - new Date(b.loggedAt).getTime())
      .map((e: any) => ({
        entryId: e.id,
        reportId: e.reportId,
        category: e.category,
        timestamp: e.loggedAt,
      })),
    stats: {
      totalEntries: stats.totalEntries,
      totalPhenomena: 888,
      categoriesExplored: stats.categoriesExplored,
      totalCategories: 11,
      uniqueTags: stats.uniqueTags,
      notesWritten: 0,
      connectionsFound: tagConnections.length,
      currentStreak: 0,
      longestStreak: 0,
      rank: stats.rank,
      rankLevel: stats.rankLevel,
    },
  }

  // Build category stats
  entryNodes.forEach((e: any) => {
    const cat = e.category || 'combination'
    if (!userMapData.categoryStats[cat]) {
      userMapData.categoryStats[cat] = { entries: 0, verdicts: {} }
    }
    userMapData.categoryStats[cat].entries++
    userMapData.categoryStats[cat].verdicts[e.verdict] =
      (userMapData.categoryStats[cat].verdicts[e.verdict] || 0) + 1
  })

  // Compute user interests from categories they've logged
  const userInterests = stats.topCategories
    .map(c => c.category as PhenomenonCategory)

  const ogDescription = `${stats.rank} on ParaDocs — ${stats.totalEntries} phenomena logged across ${stats.categoriesExplored} categories. ${stats.theoriesCreated} original theories.`

  return (
    <>
      <Head>
        <title>{profile.displayName}&apos;s Constellation | ParaDocs</title>
        <meta name="description" content={ogDescription} />
        <meta property="og:title" content={`${profile.displayName}'s Constellation | ParaDocs`} />
        <meta property="og:description" content={ogDescription} />
        <meta property="og:type" content="profile" />
        <meta property="og:url" content={`https://beta.discoverparadocs.com/researcher/${username}`} />
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Header */}
        <div className="border-b border-gray-800 bg-gray-950/80 backdrop-blur-sm sticky top-0 z-20">
          <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
            <Link href="/" className="text-primary-400 font-bold text-lg">Paradocs.</Link>
            <Link href="/explore" className="text-gray-400 hover:text-white text-sm flex items-center gap-1">
              <ArrowLeft className="w-4 h-4" /> Explore Reports
            </Link>
          </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
          {/* Profile header */}
          <div className="flex items-center gap-4">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="" className="w-16 h-16 rounded-full border-2 border-gray-700" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-gray-800 flex items-center justify-center border-2 border-gray-700">
                <Star className="w-7 h-7 text-gray-600" />
              </div>
            )}
            <div>
              <h1 className="text-2xl font-bold text-white">{profile.displayName}</h1>
              <div className="flex items-center gap-3 mt-1">
                <span className={classNames('font-medium', rankInfo.color)}>
                  {rankInfo.icon} {stats.rank}
                </span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500 text-sm">
                  Joined {new Date(profile.joinedAt).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </span>
              </div>
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {[
              { icon: Star, label: 'Logged', value: stats.totalEntries, color: 'text-purple-400' },
              { icon: Compass, label: 'Categories', value: `${stats.categoriesExplored}/11`, color: 'text-blue-400' },
              { icon: Tag, label: 'Tags', value: stats.uniqueTags, color: 'text-amber-400' },
              { icon: Link2, label: 'Connections', value: stats.connectionsDrawn, color: 'text-cyan-400' },
              { icon: Lightbulb, label: 'Theories', value: stats.theoriesCreated, color: 'text-amber-400' },
            ].map(s => (
              <div key={s.label} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                <div className="flex items-center gap-1.5 text-gray-400 text-xs mb-1">
                  <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                  {s.label}
                </div>
                <div className="text-xl font-bold text-white">{s.value}</div>
              </div>
            ))}
          </div>

          {/* Constellation map */}
          <div className="bg-gray-950 border border-gray-800 rounded-2xl overflow-hidden">
            <div className="w-full" style={{ height: 'clamp(300px, 50vh, 550px)' }}>
              <ConstellationMap
                userInterests={userInterests}
                stats={[]}
                selectedNode={null}
                userMapData={userMapData}
              />
            </div>
            {/* Legend */}
            <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-800 text-xs text-gray-500 flex-wrap">
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400" /> Compelling</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-400" /> Inconclusive</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400" /> Skeptical</span>
              <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-purple-400" /> Need More Info</span>
            </div>
          </div>

          {/* Verdict distribution */}
          {Object.keys(stats.verdictCounts).length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="text-white font-semibold text-sm mb-3">Verdict Distribution</h2>
              <div className="flex gap-3 flex-wrap">
                {Object.entries(stats.verdictCounts).map(([verdict, count]) => {
                  const vc = VERDICT_CONFIG[verdict]
                  if (!vc) return null
                  const pct = Math.round((count / stats.totalEntries) * 100)
                  return (
                    <div key={verdict} className="flex items-center gap-2">
                      <span className={vc.color}>{vc.icon}</span>
                      <span className="text-gray-300 text-sm">{vc.label}</span>
                      <span className="text-gray-500 text-sm">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Theories */}
          {theories.length > 0 && (
            <div>
              <h2 className="text-white font-semibold text-lg flex items-center gap-2 mb-3">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                Research Theories
              </h2>
              <div className="space-y-3">
                {theories.map(theory => {
                  const isExpanded = expandedTheory === theory.id
                  const theoryEntries = entryNodes.filter((e: any) => theory.entryIds.includes(e.id))
                  return (
                    <div key={theory.id} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                      <button
                        onClick={() => setExpandedTheory(isExpanded ? null : theory.id)}
                        className="w-full flex items-start gap-3 p-4 text-left hover:bg-gray-800/50 transition-colors"
                      >
                        {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-500 mt-0.5" /> : <ChevronRight className="w-4 h-4 text-gray-500 mt-0.5" />}
                        <div className="flex-1">
                          <div className="text-white font-medium">{theory.title}</div>
                          <div className="text-gray-500 text-xs mt-0.5">
                            {theory.entryIds.length} supporting entries
                          </div>
                        </div>
                      </button>
                      {isExpanded && (
                        <div className="px-4 pb-4 pl-11">
                          {theory.thesis && (
                            <p className="text-gray-300 text-sm mb-3">{theory.thesis}</p>
                          )}
                          {theoryEntries.length > 0 && (
                            <div className="space-y-1">
                              {theoryEntries.map((e: any) => {
                                const vc = VERDICT_CONFIG[e.verdict] || VERDICT_CONFIG.needs_info
                                return (
                                  <Link
                                    key={e.id}
                                    href={`/report/${e.slug}`}
                                    className="flex items-center gap-2 text-xs text-gray-400 hover:text-white transition-colors"
                                  >
                                    <span className={vc.color}>{vc.icon}</span>
                                    <span className="truncate">{e.name}</span>
                                  </Link>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top categories */}
          {stats.topCategories.length > 0 && (
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
              <h2 className="text-white font-semibold text-sm mb-3">Most Active Categories</h2>
              <div className="space-y-2">
                {stats.topCategories.map(({ category, count }) => {
                  const pct = Math.round((count / stats.totalEntries) * 100)
                  return (
                    <div key={category} className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm capitalize w-40 truncate">
                        {category.replace(/_/g, ' ')}
                      </span>
                      <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary-500 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-gray-500 text-xs w-12 text-right">{count}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="text-center py-8 border-t border-gray-800">
            <p className="text-gray-500 text-sm mb-3">
              Build your own constellation on ParaDocs
            </p>
            <Link
              href="/explore"
              className="inline-flex items-center gap-2 px-6 py-2.5 bg-primary-600 hover:bg-primary-500 text-white rounded-lg font-medium text-sm transition-colors"
            >
              Start Exploring
            </Link>
          </div>
        </div>
      </div>
    </>
  )
}
