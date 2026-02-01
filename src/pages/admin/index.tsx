import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'
import StatsCard from '@/components/admin/StatsCard'
import ActivityFeed from '@/components/admin/ActivityFeed'
import SourceHealthGrid from '@/components/admin/SourceHealthGrid'

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
  const [activeTab, setActiveTab] = useState<'overview' | 'sources' | 'jobs'>('overview')
  const [analyzingPatterns, setAnalyzingPatterns] = useState(false)
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
      <Layout>
        <div className="flex justify-center items-center min-h-[50vh]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      </Layout>
    )
  }

  if (!isAdmin) {
    return null
  }

  const healthIndicator = stats?.healthStatus === 'healthy' ? '🟢' :
                          stats?.healthStatus === 'warning' ? '🟡' : '🔴'

  return (
    <Layout>
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
        <div className="flex gap-2 mb-6 border-b border-gray-700">
          {[
            { id: 'overview', label: 'Overview', icon: '📊' },
            { id: 'sources', label: 'Sources', icon: '🔌' },
            { id: 'jobs', label: 'Job History', icon: '📋' }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as 'overview' | 'sources' | 'jobs')}
              className={`px-4 py-3 font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-green-400 border-green-400'
                  : 'text-gray-400 border-transparent hover:text-white'
              }`}
            >
              <span className="mr-2">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
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
    </Layout>
  )
}
