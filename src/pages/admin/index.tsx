import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import StatsCard from '@/components/admin/StatsCard'
import ActivityFeed from '@/components/admin/ActivityFeed'
import SourceHealthGrid from '@/components/admin/SourceHealthGrid'
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from 'recharts'

interface DataSource {
  id: string
  name: string
  slug: string
  adapter_type: string | null
  is_active: boolean
  last_synced_at: string | null
  total_records: number
  success_count: number
  error_count: number
  last_error: string | null
}

interface IngestionJob {
  id: string
  source_id: string
  status: string
  started_at: string | null
  completed_at: string | null
  records_found: number
  records_inserted: number
  records_updated: number
  records_skipped: number
  error_message: string | null
  created_at: string
  data_sources?: { name: string }
}

interface DashboardStats {
  totalReports: number
  reportsToday: number
  activeSources: number
  totalSources: number
  healthStatus: 'healthy' | 'warning' | 'critical'
  sourceBreakdown: Record<string, number>
  ingestionHistory: Array<{ date: string; count: number }>
}

interface UserData {
  id: string
  username: string
  displayName: string | null
  email: string | null
  avatarUrl: string | null
  role: string
  reputationScore: number
  reportsSubmitted: number
  reportsApproved: number
  createdAt: string
  updatedAt: string
}

interface DashboardData {
  users: {
    total: number
    today: number
    thisWeek: number
    thisMonth: number
    byRole: Record<string, number>
    list: UserData[]
  }
  content: {
    totalReports: number
    reportsToday: number
    reportsThisWeek: number
    reportsThisMonth: number
    byCategory: Record<string, number>
    byStatus: Record<string, number>
    pendingReview: number
    approved: number
    rejected: number
    flagged: number
  }
  activity: {
    totalComments: number
    commentsToday: number
    commentsThisWeek: number
    totalVotes: number
    votesToday: number
    votesThisWeek: number
    dailyActivity: Array<{ date: string; reports: number; users: number; comments: number }>
    topContributors: Array<{
      id: string
      username: string
      displayName: string
      avatarUrl: string | null
      reportCount: number
      role: string
    }>
  }
}

const CATEGORY_COLORS: Record<string, string> = {
  ufos_aliens: '#22c55e',
  cryptids: '#f59e0b',
  ghosts_hauntings: '#a855f7',
  psychic_phenomena: '#ec4899',
  consciousness_practices: '#6366f1',
  psychological_experiences: '#f43f5e',
  biological_factors: '#14b8a6',
  perception_sensory: '#06b6d4',
  religion_mythology: '#eab308',
  esoteric_practices: '#8b5cf6',
  combination: '#64748b',
}

const STATUS_COLORS: Record<string, string> = {
  pending: '#f59e0b',
  approved: '#22c55e',
  rejected: '#ef4444',
  flagged: '#f97316',
  archived: '#6b7280',
}

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [recentJobs, setRecentJobs] = useState<IngestionJob[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'users' | 'content' | 'activity' | 'sources' | 'jobs'>('overview')
  const [analyzingPatterns, setAnalyzingPatterns] = useState(false)
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [userSearch, setUserSearch] = useState('')
  const [patternResult, setPatternResult] = useState<{
    success: boolean
    message: string
    details?: {
      duration: number
      categoriesAnalyzed: number
      newPatterns: number
      updatedPatterns: number
    }
  } | null>(null)

  useEffect(() => {
    async function getUser() {
      const { data: { session } } = await supabase.auth.getSession()
      setUser(session?.user ?? null)
      setAuthLoading(false)
    }
    getUser()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null)
    })

    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function checkAdmin() {
      if (!user) {
        if (!authLoading) {
          router.push('/login?redirect=/admin')
        }
        return
      }

      // Restrict access to specific email only
      if (user.email !== 'williamschaseh@gmail.com') {
        router.push('/')
        return
      }

      // Also verify admin role as secondary check
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (profile?.role !== 'admin') {
        router.push('/')
        return
      }

      setIsAdmin(true)
      loadData()
    }

    checkAdmin()
  }, [user, authLoading, router])

  async function loadData() {
    setLoading(true)

    // Load stats
    try {
      const statsRes = await fetch('/api/admin/stats')
      const statsData = await statsRes.json()
      setStats(statsData)
      setDataSources(statsData.sources || [])
    } catch (error) {
      console.error('Failed to load stats:', error)
    }

    // Load dashboard data (users, content, activity)
    try {
      const dashboardRes = await fetch('/api/admin/dashboard')
      const dashboardData = await dashboardRes.json()
      setDashboardData(dashboardData)
    } catch (error) {
      console.error('Failed to load dashboard data:', error)
    }

    // Load recent jobs
    const { data: jobs } = await supabase
      .from('ingestion_jobs')
      .select('*, data_sources(name)')
      .order('created_at', { ascending: false })
      .limit(20)

    if (jobs) {
      setRecentJobs(jobs)
    }

    setLoading(false)
  }

  async function triggerIngestion(sourceId?: string) {
    setIngesting(sourceId || 'all')
    setMessage(null)

    try {
      const url = sourceId
        ? `/api/admin/ingest?source=${sourceId}`
        : '/api/admin/ingest'

      const { data: { session } } = await supabase.auth.getSession()

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session?.access_token && {
            'Authorization': `Bearer ${session.access_token}`
          })
        },
        credentials: 'include'
      })

      const data = await response.json()

      if (response.ok) {
        setMessage({
          type: 'success',
          text: `Ingestion complete! Found: ${data.totalRecordsFound}, Inserted: ${data.totalRecordsInserted}, Updated: ${data.totalRecordsUpdated}`
        })
        loadData()
      } else {
        setMessage({
          type: 'error',
          text: data.error || 'Ingestion failed'
        })
      }
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Network error'
      })
    } finally {
      setIngesting(null)
    }
  }

  async function toggleSource(sourceId: string, currentlyActive: boolean) {
    const { error } = await supabase
      .from('data_sources')
      .update({ is_active: !currentlyActive })
      .eq('id', sourceId)

    if (!error) {
      loadData()
    }
  }

  async function triggerPatternAnalysis() {
    setAnalyzingPatterns(true)
    setPatternResult(null)

    try {
      const response = await fetch('/api/admin/trigger-pattern-analysis', {
        method: 'POST'
      })

      const data = await response.json()

      if (response.ok && data.success) {
        setPatternResult({
          success: true,
          message: 'Pattern analysis completed successfully!',
          details: {
            duration: data.result?.duration || 0,
            categoriesAnalyzed: data.result?.categoriesProcessed || 0,
            newPatterns: data.result?.newPatterns || 0,
            updatedPatterns: data.result?.updatedPatterns || 0
          }
        })
      } else {
        setPatternResult({
          success: false,
          message: data.error || 'Pattern analysis failed'
        })
      }
    } catch (error) {
      setPatternResult({
        success: false,
        message: error instanceof Error ? error.message : 'Network error'
      })
    } finally {
      setAnalyzingPatterns(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="flex justify-center items-center min-h-[50vh]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
      </div>
    )
  }

  if (!isAdmin) {
    return null
  }

  const healthIndicator = stats?.healthStatus === 'healthy' ? '🟢' :
                          stats?.healthStatus === 'warning' ? '🟡' : '🔴'

  return (
    <>
      <Head>
        <title>Command Center - Paradocs</title>
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              Ingestion Command Center
              <span className="text-2xl">{healthIndicator}</span>
            </h1>
            <p className="text-gray-400 mt-1">
              Monitor and control data ingestion across all sources
            </p>
          </div>
          <button
            onClick={() => triggerIngestion()}
            disabled={ingesting !== null}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-green-500/20"
          >
            {ingesting === 'all' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⟳</span> Running All Sources...
              </span>
            ) : (
              '🚀 Run All Ingestion'
            )}
          </button>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'bg-red-500/20 text-red-300 border border-red-500/30'
          }`}>
            {message.text}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-700 overflow-x-auto scrollbar-hide">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'users', label: 'Users', icon: '👥' },
            { id: 'content', label: 'Content', icon: '📚' },
            { id: 'activity', label: 'Activity', icon: '📈' },
            { id: 'sources', label: 'Sources', icon: '🔌' },
            { id: 'jobs', label: 'Jobs', icon: '📋' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
              className={`px-4 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap ${
                activeTab === tab.id
                  ? 'text-green-400 border-green-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
          <Link
            href="/admin/ab-testing"
            className="px-4 py-3 font-medium transition-colors border-b-2 -mb-px whitespace-nowrap text-gray-400 border-transparent hover:text-purple-400 hover:border-purple-400"
          >
            <span className="mr-2">🧪</span>
            A/B Testing
          </Link>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Reports"
                value={stats?.totalReports || 0}
                icon="📚"
                color="green"
              />
              <StatsCard
                title="Ingested Today"
                value={stats?.reportsToday || 0}
                icon="📥"
                color="blue"
              />
              <StatsCard
                title="Active Sources"
                value={`${stats?.activeSources || 0} / ${stats?.totalSources || 0}`}
                subtitle="sources enabled"
                icon="🔌"
                color="purple"
              />
              <StatsCard
                title="System Health"
                value={stats?.healthStatus === 'healthy' ? 'All Good' : stats?.healthStatus === 'warning' ? 'Check Sources' : 'Issues Detected'}
                icon={healthIndicator}
                color={stats?.healthStatus === 'healthy' ? 'green' : stats?.healthStatus === 'warning' ? 'orange' : 'red'}
              />
            </div>

            {/* Two Column Layout: Source Health + Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <SourceHealthGrid
                sources={dataSources}
                onToggle={toggleSource}
                onRunIngestion={triggerIngestion}
                ingesting={ingesting}
              />
              <ActivityFeed maxItems={15} refreshInterval={30000} />
            </div>

            {/* Pattern Analysis Section */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold flex items-center gap-2">
                    <span>🔮</span> Emergent Pattern Analysis
                  </h2>
                  <p className="text-gray-400 text-sm mt-1">
                    Analyze all reports to detect temporal anomalies and regional concentrations.
                    Runs automatically daily at 7 AM UTC.
                  </p>
                </div>
                <button
                  onClick={triggerPatternAnalysis}
                  disabled={analyzingPatterns}
                  className="bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-lg shadow-purple-500/20"
                >
                  {analyzingPatterns ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⟳</span> Analyzing...
                    </span>
                  ) : (
                    '🔬 Run Pattern Analysis'
                  )}
                </button>
              </div>

              {/* Pattern Analysis Result */}
              {patternResult && (
                <div className={`mt-4 p-4 rounded-lg ${
                  patternResult.success
                    ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                    : 'bg-red-500/20 text-red-300 border border-red-500/30'
                }`}>
                  <div className="font-medium">{patternResult.message}</div>
                  {patternResult.details && (
                    <div className="mt-2 text-sm grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <span className="text-gray-400">Duration:</span>{' '}
                        <span className="font-mono">{patternResult.details.duration.toFixed(1)}s</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Categories:</span>{' '}
                        <span className="font-mono">{patternResult.details.categoriesAnalyzed}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">New Patterns:</span>{' '}
                        <span className="font-mono text-green-400">+{patternResult.details.newPatterns}</span>
                      </div>
                      <div>
                        <span className="text-gray-400">Updated:</span>{' '}
                        <span className="font-mono text-blue-400">{patternResult.details.updatedPatterns}</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Users Tab */}
        {activeTab === 'users' && dashboardData && (
          <div className="space-y-6">
            {/* User Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Users"
                value={dashboardData.users.total}
                icon="👥"
                color="blue"
              />
              <StatsCard
                title="New Today"
                value={dashboardData.users.today}
                icon="🆕"
                color="green"
              />
              <StatsCard
                title="This Week"
                value={dashboardData.users.thisWeek}
                icon="📅"
                color="purple"
              />
              <StatsCard
                title="This Month"
                value={dashboardData.users.thisMonth}
                icon="📆"
                color="orange"
              />
            </div>

            {/* Users by Role */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-lg font-semibold mb-4">Users by Role</h3>
                <div className="space-y-3">
                  {Object.entries(dashboardData.users.byRole).map(([role, count]) => (
                    <div key={role} className="flex justify-between items-center">
                      <span className="capitalize text-gray-300">{role}</span>
                      <span className="font-mono text-white bg-gray-700 px-3 py-1 rounded">{count}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="lg:col-span-2 bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-lg font-semibold mb-4">Top Contributors</h3>
                <div className="space-y-3">
                  {dashboardData.activity.topContributors.slice(0, 5).map((contributor, index) => (
                    <div key={contributor.id} className="flex items-center gap-3">
                      <span className="text-gray-500 w-6">{index + 1}.</span>
                      <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">
                        {contributor.avatarUrl ? (
                          <img src={contributor.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          contributor.username?.charAt(0).toUpperCase() || '?'
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="font-medium">{contributor.displayName || contributor.username}</div>
                        <div className="text-xs text-gray-400">@{contributor.username}</div>
                      </div>
                      <span className="text-green-400 font-mono">{contributor.reportCount} reports</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* User List */}
            <div className="bg-gray-800/50 rounded-lg border border-gray-700/50">
              <div className="p-4 border-b border-gray-700 flex items-center gap-4">
                <h3 className="text-lg font-semibold">All Users</h3>
                <input
                  type="text"
                  placeholder="Search users..."
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  className="flex-1 max-w-xs bg-gray-700 border-none rounded-lg px-4 py-2 text-sm"
                />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-700/50">
                    <tr>
                      <th className="text-left p-4">User</th>
                      <th className="text-left p-4">Role</th>
                      <th className="text-left p-4">Reports</th>
                      <th className="text-left p-4">Reputation</th>
                      <th className="text-left p-4">Joined</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardData.users.list
                      .filter(user =>
                        !userSearch ||
                        user.username?.toLowerCase().includes(userSearch.toLowerCase()) ||
                        user.displayName?.toLowerCase().includes(userSearch.toLowerCase()) ||
                        user.email?.toLowerCase().includes(userSearch.toLowerCase())
                      )
                      .slice(0, 50)
                      .map(user => (
                        <tr key={user.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                          <td className="p-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-gray-700 flex items-center justify-center text-sm">
                                {user.avatarUrl ? (
                                  <img src={user.avatarUrl} alt="" className="w-8 h-8 rounded-full" />
                                ) : (
                                  user.username?.charAt(0).toUpperCase() || '?'
                                )}
                              </div>
                              <div>
                                <div className="font-medium">{user.displayName || user.username}</div>
                                <div className="text-xs text-gray-400">{user.email || `@${user.username}`}</div>
                              </div>
                            </div>
                          </td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${
                              user.role === 'admin' ? 'bg-red-500/20 text-red-300' :
                              user.role === 'moderator' ? 'bg-purple-500/20 text-purple-300' :
                              user.role === 'contributor' ? 'bg-blue-500/20 text-blue-300' :
                              'bg-gray-600/50 text-gray-300'
                            }`}>
                              {user.role}
                            </span>
                          </td>
                          <td className="p-4">
                            <span className="text-green-400">{user.reportsSubmitted}</span>
                            {user.reportsApproved > 0 && (
                              <span className="text-gray-400 text-sm"> ({user.reportsApproved} approved)</span>
                            )}
                          </td>
                          <td className="p-4 font-mono">{user.reputationScore}</td>
                          <td className="p-4 text-sm text-gray-400">
                            {new Date(user.createdAt).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* Content Tab */}
        {activeTab === 'content' && dashboardData && (
          <div className="space-y-6">
            {/* Content Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Total Reports"
                value={dashboardData.content.totalReports}
                icon="📚"
                color="green"
              />
              <StatsCard
                title="Pending Review"
                value={dashboardData.content.pendingReview}
                icon="⏳"
                color="orange"
              />
              <StatsCard
                title="Approved"
                value={dashboardData.content.approved}
                icon="✅"
                color="green"
              />
              <StatsCard
                title="Flagged"
                value={dashboardData.content.flagged}
                icon="🚩"
                color="red"
              />
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Reports by Category */}
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-lg font-semibold mb-4">Reports by Category</h3>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={Object.entries(dashboardData.content.byCategory).map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }))}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                      <XAxis dataKey="name" tick={{ fill: '#9ca3af', fontSize: 10 }} angle={-45} textAnchor="end" height={80} />
                      <YAxis tick={{ fill: '#9ca3af' }} />
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                      <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Reports by Status */}
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-lg font-semibold mb-4">Reports by Status</h3>
                <div className="h-64 flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(dashboardData.content.byStatus).map(([name, value]) => ({ name, value }))}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {Object.entries(dashboardData.content.byStatus).map(([name]) => (
                          <Cell key={name} fill={STATUS_COLORS[name] || '#6b7280'} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>

            {/* Category Breakdown Table */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
              <h3 className="text-lg font-semibold mb-4">Category Breakdown</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {Object.entries(dashboardData.content.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([category, count]) => (
                    <div key={category} className="bg-gray-700/30 rounded-lg p-4">
                      <div className="text-2xl font-bold" style={{ color: CATEGORY_COLORS[category] || '#9ca3af' }}>
                        {count}
                      </div>
                      <div className="text-sm text-gray-400 capitalize mt-1">
                        {category.replace(/_/g, ' ')}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        )}

        {/* Activity Tab */}
        {activeTab === 'activity' && dashboardData && (
          <div className="space-y-6">
            {/* Activity Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatsCard
                title="Reports This Week"
                value={dashboardData.content.reportsThisWeek}
                icon="📝"
                color="green"
              />
              <StatsCard
                title="Comments This Week"
                value={dashboardData.activity.commentsThisWeek}
                icon="💬"
                color="blue"
              />
              <StatsCard
                title="Votes This Week"
                value={dashboardData.activity.votesThisWeek}
                icon="👍"
                color="purple"
              />
              <StatsCard
                title="New Users This Week"
                value={dashboardData.users.thisWeek}
                icon="👤"
                color="orange"
              />
            </div>

            {/* Activity Chart */}
            <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
              <h3 className="text-lg font-semibold mb-4">Daily Activity (Last 30 Days)</h3>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dashboardData.activity.dailyActivity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: '#9ca3af', fontSize: 10 }}
                      tickFormatter={(value) => new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                    />
                    <YAxis tick={{ fill: '#9ca3af' }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#1f2937', border: '1px solid #374151' }}
                      labelFormatter={(value) => new Date(value).toLocaleDateString()}
                    />
                    <Line type="monotone" dataKey="reports" name="Reports" stroke="#22c55e" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="users" name="New Users" stroke="#6366f1" strokeWidth={2} dot={false} />
                    <Line type="monotone" dataKey="comments" name="Comments" stroke="#f59e0b" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Activity Feed */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-gray-800/50 rounded-lg p-6 border border-gray-700/50">
                <h3 className="text-lg font-semibold mb-4">Today&apos;s Summary</h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                    <span className="text-gray-300">Reports Submitted</span>
                    <span className="font-mono text-green-400 text-xl">{dashboardData.content.reportsToday}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                    <span className="text-gray-300">Comments Posted</span>
                    <span className="font-mono text-blue-400 text-xl">{dashboardData.activity.commentsToday}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                    <span className="text-gray-300">Votes Cast</span>
                    <span className="font-mono text-purple-400 text-xl">{dashboardData.activity.votesToday}</span>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-gray-700/30 rounded-lg">
                    <span className="text-gray-300">New Users</span>
                    <span className="font-mono text-orange-400 text-xl">{dashboardData.users.today}</span>
                  </div>
                </div>
              </div>

              <ActivityFeed maxItems={10} refreshInterval={30000} />
            </div>
          </div>
        )}

        {/* Sources Tab */}
        {activeTab === 'sources' && (
          <section>
            <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
              <table className="w-full">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="text-left p-4">Source</th>
                    <th className="text-left p-4">Adapter</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Last Sync</th>
                    <th className="text-left p-4">Records</th>
                    <th className="text-left p-4">Errors</th>
                    <th className="text-left p-4">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {dataSources.map(source => (
                    <tr key={source.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                      <td className="p-4">
                        <div className="font-medium">{source.name}</div>
                        <div className="text-sm text-gray-400">{source.slug}</div>
                      </td>
                      <td className="p-4">
                        <code className="text-sm bg-gray-700 px-2 py-1 rounded">
                          {source.adapter_type || 'none'}
                        </code>
                      </td>
                      <td className="p-4">
                        <button
                          onClick={() => toggleSource(source.id, source.is_active)}
                          className={`px-3 py-1 rounded text-sm font-medium ${
                            source.is_active
                              ? 'bg-green-500/20 text-green-300 hover:bg-green-500/30'
                              : 'bg-gray-600/50 text-gray-400 hover:bg-gray-600'
                          }`}
                        >
                          {source.is_active ? '✓ Active' : 'Inactive'}
                        </button>
                      </td>
                      <td className="p-4 text-sm text-gray-400">
                        {source.last_synced_at
                          ? new Date(source.last_synced_at).toLocaleString()
                          : 'Never'}
                      </td>
                      <td className="p-4">
                        <span className="text-green-400 font-medium">{(source.total_records || 0).toLocaleString()}</span>
                      </td>
                      <td className="p-4">
                        {source.error_count > 0 ? (
                          <span className="text-red-400">{source.error_count}</span>
                        ) : (
                          <span className="text-gray-500">0</span>
                        )}
                      </td>
                      <td className="p-4">
                        {source.adapter_type && (
                          <button
                            onClick={() => triggerIngestion(source.id)}
                            disabled={ingesting !== null}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-4 py-1.5 rounded text-sm font-medium"
                          >
                            {ingesting === source.id ? (
                              <span className="flex items-center gap-1">
                                <span className="animate-spin">⟳</span>
                              </span>
                            ) : (
                              '▶ Run'
                            )}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Jobs Tab */}
        {activeTab === 'jobs' && (
          <section>
            <div className="bg-gray-800/50 rounded-lg overflow-hidden border border-gray-700/50">
              <table className="w-full">
                <thead className="bg-gray-700/50">
                  <tr>
                    <th className="text-left p-4">Source</th>
                    <th className="text-left p-4">Status</th>
                    <th className="text-left p-4">Started</th>
                    <th className="text-left p-4">Duration</th>
                    <th className="text-left p-4">Found</th>
                    <th className="text-left p-4">Inserted</th>
                    <th className="text-left p-4">Updated</th>
                    <th className="text-left p-4">Error</th>
                  </tr>
                </thead>
                <tbody>
                  {recentJobs.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-400">
                        No ingestion jobs yet. Click &quot;Run All Ingestion&quot; to start.
                      </td>
                    </tr>
                  ) : (
                    recentJobs.map(job => {
                      const duration = job.started_at && job.completed_at
                        ? Math.round((new Date(job.completed_at).getTime() - new Date(job.started_at).getTime()) / 1000)
                        : null

                      return (
                        <tr key={job.id} className="border-t border-gray-700 hover:bg-gray-700/30 transition-colors">
                          <td className="p-4 font-medium">{job.data_sources?.name || 'Unknown'}</td>
                          <td className="p-4">
                            <span className={`px-2 py-1 rounded text-sm font-medium ${
                              job.status === 'completed' ? 'bg-green-500/20 text-green-300' :
                              job.status === 'failed' ? 'bg-red-500/20 text-red-300' :
                              job.status === 'running' ? 'bg-yellow-500/20 text-yellow-300' :
                              'bg-gray-600/50 text-gray-400'
                            }`}>
                              {job.status}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-gray-400">
                            {job.started_at ? new Date(job.started_at).toLocaleString() : '-'}
                          </td>
                          <td className="p-4 text-sm text-gray-400">
                            {duration !== null ? `${duration}s` : '-'}
                          </td>
                          <td className="p-4">{job.records_found}</td>
                          <td className="p-4 text-green-400">{job.records_inserted}</td>
                          <td className="p-4 text-blue-400">{job.records_updated}</td>
                          <td className="p-4 text-sm text-red-400 max-w-xs truncate" title={job.error_message || ''}>
                            {job.error_message || '-'}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  )
}
