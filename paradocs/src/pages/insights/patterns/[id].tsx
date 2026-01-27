import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import Layout from '@/components/Layout'
import { InsightNarrative, Pattern } from '@/components/patterns'
import { ArrowLeft, MapPin, Calendar, Loader2, AlertCircle } from 'lucide-react'

const TYPE_LABELS: Record<string, string> = {
    geographic_cluster: 'Geographic Cluster',
    temporal_anomaly: 'Temporal Anomaly',
    flap_wave: 'Flap Wave',
    characteristic_correlation: 'Characteristic Correlation',
    seasonal_pattern: 'Seasonal Pattern'
}

interface PatternReport {
    id: string
    title: string
    slug: string
    event_date: string
    location_description: string
}

export default function PatternDetailPage() {
    const router = useRouter()
    const { id } = router.query
    const [pattern, setPattern] = useState<Pattern | null>(null)
    const [reports, setReports] = useState<PatternReport[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

  useEffect(() => {
        if (!id || typeof id !== 'string') return
        async function fetchPattern() {
                setLoading(true)
                setError(null)
                try {
                          const response = await fetch(`/api/patterns/${id}`)
                          if (!response.ok) throw new Error('Pattern not found')
                          const data = await response.json()
                          setPattern(data.pattern)
                          setReports(data.reports || [])
                } catch (err) {
                          setError(err instanceof Error ? err.message : 'Failed to load pattern')
                } finally {
                          setLoading(false)
                }
        }
        fetchPattern()
  }, [id])

  const formatDate = (dateStr: string) => new Date(dateStr).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

  if (loading) {
        return <Layout><div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 text-primary-400 animate-spin" /></div>div></Layout>Layout>
          }
          
            if (error || !pattern) {
                  return (
                          <Layout>
                                  <div className="py-20 text-center">
                                            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                                            <h1 className="text-xl font-bold text-white mb-2">Pattern Not Found</h1>h1>
                                            <p className="text-gray-400 mb-6">{error || 'Unable to load pattern details'}</p>p>
                                            <Link href="/insights" className="inline-flex items-center gap-2 text-primary-400 hover:text-primary-300">
                                                        <ArrowLeft className="w-4 h-4" /> Back to Insights
                                            </Link>Link>
                                  </div>div>
                          </Layout>Layout>
                        )
            }
  
    return (
          <Layout>
                <Head>
                        <title>{pattern.ai_title || TYPE_LABELS[pattern.pattern_type]} | ParaDocs Insights</title>title>
                </Head>Head>
                <div className="py-8">
                        <Link href="/insights" className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6 transition-colors">
                                  <ArrowLeft className="w-4 h-4" /> Back to Insights
                        </Link>Link>
                        <div className="glass-card p-6 mb-6">
                                  <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium mb-3 ${pattern.status === 'active' ? 'bg-green-500/20 text-green-400' : pattern.status === 'emerging' ? 'bg-amber-500/20 text-amber-400' : 'bg-gray-500/20 text-gray-400'}`}>
                                    {pattern.status.charAt(0).toUpperCase() + pattern.status.slice(1)}
                                  </span>span>
                                  <h1 className="text-2xl md:text-3xl font-display font-bold text-white">{pattern.ai_title || TYPE_LABELS[pattern.pattern_type]}</h1>h1>
                                  <p className="text-gray-400 mt-2">{pattern.ai_summary || `A ${pattern.pattern_type.replace(/_/g, ' ')} containing ${pattern.report_count} reports.`}</p>p>
                                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6 pt-6 border-t border-gray-700/50">
                                              <div className="text-center"><p className="text-2xl font-bold text-white">{pattern.report_count}</p>p><p className="text-sm text-gray-400">Reports</p>p></div>div>
                                              <div className="text-center"><p className="text-2xl font-bold text-white">{Math.round(pattern.confidence_score * 100)}%</p>p><p className="text-sm text-gray-400">Confidence</p>p></div>div>
                                              <div className="text-center"><p className="text-2xl font-bold text-white">{Math.round(pattern.significance_score * 100)}%</p>p><p className="text-sm text-gray-400">Significance</p>p></div>div>
                                              <div className="text-center"><p className="text-2xl font-bold text-white">{pattern.categories?.length || 0}</p>p><p className="text-sm text-gray-400">Categories</p>p></div>div>
                                  </div>div>
                        </div>div>
                        <div className="grid lg:grid-cols-3 gap-6">
                                  <div className="lg:col-span-2 space-y-6">
                                              <InsightNarrative patternId={pattern.id} />
                                              <div className="glass-card p-6">
                                                            <h2 className="text-lg font-display font-semibold text-white mb-4">Associated Reports ({reports.length})</h2>h2>
                                                {reports.length === 0 ? <p className="text-gray-400">No reports linked to this pattern yet.</p>p> : (
                                                              <div className="space-y-3">
                                                                {reports.slice(0, 10).map((report) => (
                                <Link key={report.id} href={`/report/${report.slug}`} className="block glass-card p-4 hover:scale-[1.01] transition-transform">
                                                      <h3 className="font-medium text-white">{report.title}</h3>h3>
                                                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-400">
                                                                              <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{report.location_description || 'Unknown location'}</span>span>
                                                        {report.event_date && <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(report.event_date)}</span>span>}
                                                      </div>div>
                                </Link>Link>
                              ))}
                                                              </div>div>
                                                            )}
                                              </div>div>
                                  </div>div>
                                  <div className="glass-card p-6">
                                              <h2 className="text-lg font-display font-semibold text-white mb-4">Pattern Details</h2>h2>
                                              <dl className="space-y-3 text-sm">
                                                            <div className="flex justify-between"><dt className="text-gray-400">Type</dt>dt><dd className="text-white">{TYPE_LABELS[pattern.pattern_type]}</dd>dd></div>div>
                                                            <div className="flex justify-between"><dt className="text-gray-400">First Detected</dt>dt><dd className="text-white">{formatDate(pattern.first_detected_at)}</dd>dd></div>div>
                                                            <div className="flex justify-between"><dt className="text-gray-400">Last Updated</dt>dt><dd className="text-white">{formatDate(pattern.last_updated_at)}</dd>dd></div>div>
                                              </dl>dl>
                                  </div>div>
                        </div>div>
                </div>div>
          </Layout>Layout>
        )
}</Layout>
