import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Layout from '@/components/Layout'
import { supabase } from '@/lib/supabase'
import type { User } from '@supabase/supabase-js'

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

export default function AdminDashboard() {
  const router = useRouter()
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [dataSources, setDataSources] = useState<DataSource[]>([])
  const [recentJobs, setRecentJobs] = useState<IngestionJob[]>([])
  const [ingesting, setIngesting] = useState<string | null>(null)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  // Get user session
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

      // Check if user is admin
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

    // Load data sources
    const { data: sources } = await supabase
      .from('data_sources')
      .select('*')
      .order('name')

    if (sources) {
      setDataSources(sources)
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

      // Get the current session to include the access token
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
        loadData() // Refresh data
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

  return (
    <Layout>
      <Head>
        <title>Admin Dashboard - ParaDocs</title>
      </Head>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold">Admin Dashboard</h1>
          <button
            onClick={() => triggerIngestion()}
            disabled={ingesting !== null}
            className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
          >
            {ingesting === 'all' ? (
              <span className="flex items-center gap-2">
                <span className="animate-spin">⟳</span> Running All...
              </span>
            ) : (
              '🚀 Run All Ingestion'
            )}
          </button>
        </div>

        {message && (
          <div className={`mb-6 p-4 rounded-lg ${
            message.type === 'success' ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* Data Sources */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold mb-4">Data Sources</h2>
          <div className="bg-gray-800/50 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="text-left p-4">Source</th>
                  <th className="text-left p-4">Adapter</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Last Sync</th>
                  <th className="text-left p-4">Records</th>
                  <th className="text-left p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {dataSources.map(source => (
                  <tr key={source.id} className="border-t border-gray-700">
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
                        className={`px-3 py-1 rounded text-sm ${
                          source.is_active
                            ? 'bg-green-500/20 text-green-300'
                            : 'bg-gray-600/50 text-gray-400'
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
                      <span className="text-green-400">{source.total_records || 0}</span>
                      {source.error_count > 0 && (
                        <span className="text-red-400 ml-2">({source.error_count} errors)</span>
                      )}
                    </td>
                    <td className="p-4">
                      {source.adapter_type && (
                        <button
                          onClick={() => triggerIngestion(source.id)}
                          disabled={ingesting !== null}
                          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white px-3 py-1 rounded text-sm"
                        >
                          {ingesting === source.id ? '⟳' : '▶'} Run
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Recent Jobs */}
        <section>
          <h2 className="text-xl font-semibold mb-4">Recent Ingestion Jobs</h2>
          <div className="bg-gray-800/50 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="text-left p-4">Source</th>
                  <th className="text-left p-4">Status</th>
                  <th className="text-left p-4">Started</th>
                  <th className="text-left p-4">Found</th>
                  <th className="text-left p-4">Inserted</th>
                  <th className="text-left p-4">Error</th>
                </tr>
              </thead>
              <tbody>
                {recentJobs.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-400">
                      No ingestion jobs yet. Click "Run All Ingestion" to start.
                    </td>
                  </tr>
                ) : (
                  recentJobs.map(job => (
                    <tr key={job.id} className="border-t border-gray-700">
                      <td className="p-4">{job.data_sources?.name || 'Unknown'}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded text-sm ${
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
                      <td className="p-4">{job.records_found}</td>
                      <td className="p-4 text-green-400">{job.records_inserted}</td>
                      <td className="p-4 text-sm text-red-400 max-w-xs truncate">
                        {job.error_message || '-'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </Layout>
  )
}
