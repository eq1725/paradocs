'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import {
  ArrowLeft,
  Calendar,
  MapPin,
  FileText,
  History,
  Fingerprint,
  Lightbulb,
  BookOpen,
  ExternalLink,
  Eye,
  ThumbsUp,
} from 'lucide-react'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface Phenomenon {
  id: string
  name: string
  slug: string
  aliases: string[]
  category: string
  icon: string
  ai_summary: string | null
  ai_description: string | null
  ai_history: string | null
  ai_characteristics: string | null
  ai_notable_sightings: string | null
  ai_theories: string | null
  ai_cultural_impact: string | null
  ai_generated_at: string | null
  report_count: number
  primary_image_url: string | null
  first_reported_date: string | null
  last_reported_date: string | null
  primary_regions: string[]
}

interface RelatedReport {
  id: string
  title: string
  slug: string
  summary: string
  category: string
  location_name: string
  country: string
  event_date: string
  credibility: string
  view_count: number
  match_confidence: number
}

export default function PhenomenonPage() {
  const router = useRouter()
  const { slug } = router.query

  const [phenomenon, setPhenomenon] = useState<Phenomenon | null>(null)
  const [reports, setReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'reports'>('overview')

  useEffect(() => {
    if (slug && typeof slug === 'string') {
      loadPhenomenon(slug)
    }
  }, [slug])

  async function loadPhenomenon(phenomenonSlug: string) {
    try {
      const res = await fetch(`/api/phenomena/${phenomenonSlug}`)
      if (!res.ok) {
        router.push('/phenomena')
        return
      }
      const data = await res.json()
      setPhenomenon(data.phenomenon)
      setReports(data.reports || [])
    } catch (error) {
      console.error('Error loading phenomenon:', error)
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
      </div>
    )
  }

  if (!phenomenon) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-400 text-lg mb-4">Phenomenon not found</p>
          <Link href="/phenomena" className="text-purple-400 hover:text-purple-300">
            Return to Encyclopedia
          </Link>
        </div>
      </div>
    )
  }

  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]

  return (
    <>
      <Head>
        <title>{phenomenon.name} - Phenomena Encyclopedia - Paradocs</title>
        <meta name="description" content={phenomenon.ai_summary || `Learn about ${phenomenon.name} in our paranormal phenomena encyclopedia.`} />
      </Head>

      <div className="min-h-screen bg-gray-950">
        {/* Hero Section */}
        <div className="relative bg-gradient-to-b from-gray-900 to-gray-950 border-b border-gray-800">
          {/* Background Image Overlay */}
          {phenomenon.primary_image_url && (
            <div className="absolute inset-0 overflow-hidden">
              <img
                src={phenomenon.primary_image_url}
                alt=""
                className="w-full h-full object-cover opacity-10"
                referrerPolicy="no-referrer"
                crossOrigin="anonymous"
              />
            </div>
          )}

          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Back Link */}
            <Link
              href="/phenomena"
              className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors mb-6"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Encyclopedia
            </Link>

            <div className="flex flex-col md:flex-row gap-8 items-start">
              {/* Icon/Image */}
              <div className="w-32 h-32 flex items-center justify-center bg-gray-800/50 rounded-2xl border border-gray-700">
                {phenomenon.primary_image_url ? (
                  <img
                    src={phenomenon.primary_image_url}
                    alt={phenomenon.name}
                    className="w-full h-full object-cover rounded-2xl"
                    referrerPolicy="no-referrer"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <span className="text-7xl">{phenomenon.icon || config?.icon}</span>
                )}
              </div>

              {/* Title & Meta */}
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className={classNames(
                    'px-3 py-1 rounded-full text-sm',
                    config?.bgClass || 'bg-gray-800',
                    config?.textClass || 'text-gray-400'
                  )}>
                    {config?.label}
                  </span>
                </div>

                <h1 className="text-4xl md:text-5xl font-bold text-white mb-3">
                  {phenomenon.name}
                </h1>

                {phenomenon.aliases && phenomenon.aliases.length > 0 && (
                  <p className="text-gray-400 mb-4">
                    Also known as: {phenomenon.aliases.join(', ')}
                  </p>
                )}

                {phenomenon.ai_summary && (
                  <p className="text-lg text-gray-300 max-w-3xl">
                    {phenomenon.ai_summary}
                  </p>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-6 mt-6 text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>{phenomenon.report_count} related reports</span>
                  </div>
                  {phenomenon.first_reported_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span>First reported: {new Date(phenomenon.first_reported_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {phenomenon.primary_regions && phenomenon.primary_regions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{phenomenon.primary_regions.slice(0, 3).join(', ')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="sticky top-0 z-10 bg-gray-900/95 backdrop-blur-sm border-b border-gray-800">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <nav className="flex gap-8">
              <button
                onClick={() => setActiveTab('overview')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors',
                  activeTab === 'overview'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('history')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors',
                  activeTab === 'history'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                History & Details
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors',
                  activeTab === 'reports'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                Related Reports ({reports.length})
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main Content */}
              <div className="lg:col-span-2 space-y-8">
                {/* Description */}
                {phenomenon.ai_description && (
                  <ContentSection
                    icon={<BookOpen className="w-5 h-5" />}
                    title="Description"
                    content={phenomenon.ai_description}
                  />
                )}

                {/* Characteristics */}
                {phenomenon.ai_characteristics && (
                  <ContentSection
                    icon={<Fingerprint className="w-5 h-5" />}
                    title="Characteristics"
                    content={phenomenon.ai_characteristics}
                  />
                )}

                {/* Theories */}
                {phenomenon.ai_theories && (
                  <ContentSection
                    icon={<Lightbulb className="w-5 h-5" />}
                    title="Theories & Explanations"
                    content={phenomenon.ai_theories}
                  />
                )}
              </div>

              {/* Sidebar */}
              <div className="space-y-6">
                {/* Quick Stats Card */}
                <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-white mb-4">Quick Facts</h3>
                  <dl className="space-y-4">
                    <div>
                      <dt className="text-sm text-gray-400">Category</dt>
                      <dd className="text-white flex items-center gap-2 mt-1">
                        <span>{config?.icon}</span>
                        {config?.label}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-sm text-gray-400">Total Reports</dt>
                      <dd className="text-2xl font-bold text-purple-400">{phenomenon.report_count}</dd>
                    </div>
                    {phenomenon.first_reported_date && (
                      <div>
                        <dt className="text-sm text-gray-400">First Reported</dt>
                        <dd className="text-white">{new Date(phenomenon.first_reported_date).toLocaleDateString()}</dd>
                      </div>
                    )}
                    {phenomenon.last_reported_date && (
                      <div>
                        <dt className="text-sm text-gray-400">Most Recent</dt>
                        <dd className="text-white">{new Date(phenomenon.last_reported_date).toLocaleDateString()}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                {/* Recent Reports */}
                {reports.length > 0 && (
                  <div className="bg-gray-900 border border-gray-800 rounded-xl p-6">
                    <h3 className="text-lg font-semibold text-white mb-4">Recent Reports</h3>
                    <div className="space-y-3">
                      {reports.slice(0, 5).map(report => (
                        <Link
                          key={report.id}
                          href={`/report/${report.slug}`}
                          className="block p-3 bg-gray-800/50 rounded-lg hover:bg-gray-800 transition-colors"
                        >
                          <h4 className="text-sm text-white font-medium line-clamp-1">{report.title}</h4>
                          <p className="text-xs text-gray-400 mt-1">
                            {report.location_name || report.country || 'Unknown location'}
                            {report.event_date && ` • ${new Date(report.event_date).toLocaleDateString()}`}
                          </p>
                        </Link>
                      ))}
                    </div>
                    {reports.length > 5 && (
                      <button
                        onClick={() => setActiveTab('reports')}
                        className="mt-4 text-sm text-purple-400 hover:text-purple-300 flex items-center gap-1"
                      >
                        View all {reports.length} reports
                        <ExternalLink className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="max-w-3xl space-y-8">
              {/* History */}
              {phenomenon.ai_history && (
                <ContentSection
                  icon={<History className="w-5 h-5" />}
                  title="Historical Background"
                  content={phenomenon.ai_history}
                />
              )}

              {/* Notable Sightings */}
              {phenomenon.ai_notable_sightings && (
                <ContentSection
                  icon={<Eye className="w-5 h-5" />}
                  title="Notable Sightings"
                  content={phenomenon.ai_notable_sightings}
                />
              )}

              {/* Cultural Impact */}
              {phenomenon.ai_cultural_impact && (
                <ContentSection
                  icon={<BookOpen className="w-5 h-5" />}
                  title="Cultural Impact"
                  content={phenomenon.ai_cultural_impact}
                />
              )}

            </div>
          )}

          {activeTab === 'reports' && (
            <div>
              <p className="text-gray-400 mb-6">
                Showing {reports.length} reports related to {phenomenon.name}
              </p>

              {reports.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-400">No reports linked to this phenomenon yet.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {reports.map(report => {
                    const credConfig = CREDIBILITY_CONFIG[report.credibility as keyof typeof CREDIBILITY_CONFIG]
                    return (
                      <Link
                        key={report.id}
                        href={`/report/${report.slug}`}
                        className="block bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-purple-500/50 transition-all"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <h3 className="text-white font-medium line-clamp-2">{report.title}</h3>
                          {report.match_confidence >= 0.8 && (
                            <span className="text-xs px-2 py-0.5 bg-green-900/50 text-green-400 rounded">
                              High match
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 line-clamp-2 mb-3">{report.summary}</p>
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>{report.location_name || report.country || 'Unknown'}</span>
                          <div className="flex items-center gap-3">
                            {credConfig && (
                              <span className={credConfig.textClass}>{credConfig.label}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {report.view_count}
                            </span>
                          </div>
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

function ContentSection({
  icon,
  title,
  content,
}: {
  icon: React.ReactNode
  title: string
  content: string
}) {
  return (
    <section className="bg-gray-900 border border-gray-800 rounded-xl p-6">
      <h2 className="flex items-center gap-3 text-xl font-semibold text-white mb-4">
        <span className="text-purple-400">{icon}</span>
        {title}
      </h2>
      <div className="prose prose-invert prose-gray max-w-none">
        {content.split('\n\n').map((paragraph, i) => (
          <p key={i} className="text-gray-300 leading-relaxed mb-4 last:mb-0">
            {paragraph}
          </p>
        ))}
      </div>
    </section>
  )
}
