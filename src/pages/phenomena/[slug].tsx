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
  Image,
  Video,
  Play,
  ZoomIn,
} from 'lucide-react'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'
import AskTheUnknown from '@/components/AskTheUnknown'

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
  image_gallery: GalleryItem[] | null
  ai_quick_facts?: {
    origin?: string
    first_documented?: string
    classification?: string
    danger_level?: string
    typical_encounter?: string
    evidence_types?: string
    active_period?: string
    notable_feature?: string
    cultural_significance?: string
  } | null
}

interface GalleryItem {
  url: string
  thumbnail_url?: string
  type: 'image' | 'video' | 'illustration'
  caption?: string
  source?: string
  source_url?: string
  license?: string
  width?: number
  height?: number
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
  const [activeTab, setActiveTab] = useState<'overview' | 'history' | 'media' | 'reports'>('overview')
  const [lightboxImage, setLightboxImage] = useState<{ url: string; caption?: string; source?: string } | null>(null)

  useEffect(() => {
    if (slug && typeof slug === 'string') {
      loadPhenomenon(slug)
    }
  }, [slug])

  // ESC key closes lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setLightboxImage(null)
    }
    if (lightboxImage) {
      document.addEventListener('keydown', handleKeyDown)
      document.body.style.overflow = 'hidden'
    }
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
    }
  }, [lightboxImage])

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
                loading="lazy"
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

            <div className="flex flex-col md:flex-row gap-6 md:gap-8 items-start">
              {/* Icon/Image */}
              <div className="w-24 h-24 sm:w-32 sm:h-32 flex items-center justify-center bg-gray-800/50 rounded-2xl border border-gray-700 shrink-0">
                {phenomenon.primary_image_url ? (
                  <img
                    src={phenomenon.primary_image_url}
                    alt={phenomenon.name}
                    className="w-full h-full object-cover rounded-2xl"
                    referrerPolicy="no-referrer"
                    loading="lazy"
                  />
                ) : (
                  <span className="text-5xl sm:text-7xl">{phenomenon.icon || config?.icon}</span>
                )}
              </div>

              {/* Title & Meta */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className={classNames(
                    'px-3 py-1 rounded-full text-xs sm:text-sm',
                    config?.bgColor || 'bg-gray-800',
                    config?.color || 'text-gray-400'
                  )}>
                    {config?.label}
                  </span>
                </div>

                <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-white mb-3">
                  {phenomenon.name}
                </h1>

                {phenomenon.aliases && phenomenon.aliases.length > 0 && (
                  <p className="text-gray-400 mb-4 text-sm sm:text-base">
                    Also known as: {phenomenon.aliases.join(', ')}
                  </p>
                )}

                {phenomenon.ai_summary && (
                  <p className="text-base sm:text-lg text-gray-300 max-w-3xl">
                    {phenomenon.ai_summary}
                  </p>
                )}

                {/* Stats */}
                <div className="flex flex-wrap gap-3 sm:gap-6 mt-4 sm:mt-6 text-xs sm:text-sm text-gray-400">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4" />
                    <span>{phenomenon.report_count} reports</span>
                  </div>
                  {phenomenon.first_reported_date && (
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4" />
                      <span className="hidden sm:inline">First reported: </span>
                      <span>{new Date(phenomenon.first_reported_date).toLocaleDateString()}</span>
                    </div>
                  )}
                  {phenomenon.primary_regions && phenomenon.primary_regions.length > 0 && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      <span>{phenomenon.primary_regions.slice(0, 2).join(', ')}</span>
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
            <nav className="flex gap-4 sm:gap-8 overflow-x-auto scrollbar-hide">
              <button
                onClick={() => setActiveTab('overview')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base',
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
                  'py-4 border-b-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base',
                  activeTab === 'history'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                History
              </button>
              <button
                onClick={() => setActiveTab('media')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base',
                  activeTab === 'media'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                Media {phenomenon.image_gallery && phenomenon.image_gallery.length > 0 ? `(${phenomenon.image_gallery.length})` : ''}
              </button>
              <button
                onClick={() => setActiveTab('reports')}
                className={classNames(
                  'py-4 border-b-2 font-medium transition-colors whitespace-nowrap text-sm sm:text-base',
                  activeTab === 'reports'
                    ? 'border-purple-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-white'
                )}
              >
                Reports ({reports.length})
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

                    {/* AI-Generated Quick Facts */}
                    {phenomenon.ai_quick_facts && (
                      <>
                        <div className="border-t border-gray-700 my-2" />

                        {phenomenon.ai_quick_facts.origin && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">📍</span> Origin
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.origin}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.classification && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">🔬</span> Classification
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.classification}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.first_documented && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">📜</span> First Documented
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.first_documented}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.danger_level && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">⚠️</span> Danger Level
                            </dt>
                            <dd className={classNames(
                              'text-sm mt-1 font-medium',
                              phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('high') || phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('dangerous')
                                ? 'text-red-400'
                                : phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('moderate') || phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('caution')
                                  ? 'text-yellow-400'
                                  : phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('low') || phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('benign') || phenomenon.ai_quick_facts.danger_level.toLowerCase().includes('harmless')
                                    ? 'text-green-400'
                                    : 'text-gray-300'
                            )}>
                              {phenomenon.ai_quick_facts.danger_level}
                            </dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.typical_encounter && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">👁️</span> Typical Encounter
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.typical_encounter}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.evidence_types && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">📝</span> Evidence
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.evidence_types}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.active_period && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">⏳</span> Active Period
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.active_period}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.notable_feature && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">⭐</span> Notable Feature
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.notable_feature}</dd>
                          </div>
                        )}

                        {phenomenon.ai_quick_facts.cultural_significance && (
                          <div>
                            <dt className="text-sm text-gray-400 flex items-center gap-1.5">
                              <span className="text-xs">🌍</span> Cultural Significance
                            </dt>
                            <dd className="text-white text-sm mt-1">{phenomenon.ai_quick_facts.cultural_significance}</dd>
                          </div>
                        )}
                      </>
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
                            {report.event_date && ` â¢ ${new Date(report.event_date).toLocaleDateString()}`}
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

          {activeTab === 'media' && (
            <div>
              {phenomenon.image_gallery && phenomenon.image_gallery.length > 0 ? (
                <div className="space-y-8">
                  {/* Images Section */}
                  {phenomenon.image_gallery.filter(item => item.type !== 'video').length > 0 && (
                    <section>
                      <h2 className="flex items-center gap-3 text-xl font-semibold text-white mb-6">
                        <span className="text-purple-400"><Image className="w-5 h-5" /></span>
                        Images & Illustrations
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {phenomenon.image_gallery.filter(item => item.type !== 'video').map((item, i) => (
                          <button
                            key={i}
                            onClick={() => setLightboxImage({ url: item.url, caption: item.caption, source: item.source })}
                            className="group block bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all text-left cursor-pointer"
                          >
                            <div className="relative aspect-video bg-gray-800">
                              <img
                                src={item.thumbnail_url || item.url}
                                alt={item.caption || phenomenon.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                loading="lazy"
                              />
                              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                <ZoomIn className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                              </div>
                            </div>
                            {item.caption && (
                              <div className="p-3">
                                <p className="text-sm text-gray-300 line-clamp-2">{item.caption}</p>
                                {item.source && (
                                  <p className="text-xs text-gray-500 mt-1">Source: {item.source}</p>
                                )}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                    </section>
                  )}

                  {/* Videos Section */}
                  {phenomenon.image_gallery.filter(item => item.type === 'video').length > 0 && (
                    <section>
                      <h2 className="flex items-center gap-3 text-xl font-semibold text-white mb-6">
                        <span className="text-purple-400"><Video className="w-5 h-5" /></span>
                        Videos & Documentaries
                      </h2>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {phenomenon.image_gallery.filter(item => item.type === 'video').map((item, i) => {
                          const youtubeId = item.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&]+)/)?.[1]
                          return (
                            <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
                              {youtubeId ? (
                                <div className="aspect-video">
                                  <iframe
                                    src={`https://www.youtube.com/embed/${youtubeId}`}
                                    title={item.caption || phenomenon.name}
                                    className="w-full h-full"
                                    allowFullScreen
                                    loading="lazy"
                                  />
                                </div>
                              ) : (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block relative aspect-video bg-gray-800"
                                >
                                  {item.thumbnail_url && (
                                    <img src={item.thumbnail_url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                                  )}
                                  <div className="absolute inset-0 flex items-center justify-center">
                                    <Play className="w-12 h-12 text-white/80" />
                                  </div>
                                </a>
                              )}
                              {item.caption && (
                                <div className="p-3">
                                  <p className="text-sm text-gray-300 line-clamp-2">{item.caption}</p>
                                  {item.source && (
                                    <p className="text-xs text-gray-500 mt-1">{item.source}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    </section>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Image className="w-12 h-12 text-gray-600 mx-auto mb-4" />
                  <p className="text-gray-400">No media gallery available for this phenomenon yet.</p>
                  <p className="text-gray-500 text-sm mt-2">Media will be added as research continues.</p>
                </div>
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
                              <span className={credConfig.color}>{credConfig.label}</span>
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
      <AskTheUnknown
        context={{
          type: 'phenomenon',
          name: phenomenon.name,
          category: phenomenon.category,
          description: phenomenon.ai_description || phenomenon.ai_summary || '',
          reportCount: phenomenon.report_count
        }}
      />

      {/* Image Lightbox Modal */}
      {lightboxImage && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-5xl max-h-[90vh] w-full flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 text-white/70 hover:text-white text-sm flex items-center gap-1 transition-colors"
            >
              Press ESC or click outside to close
            </button>
            <img
              src={lightboxImage.url}
              alt={lightboxImage.caption || phenomenon.name}
              className="max-w-full max-h-[80vh] object-contain rounded-lg"
              referrerPolicy="no-referrer"
            />
            {(lightboxImage.caption || lightboxImage.source) && (
              <div className="mt-4 text-center max-w-2xl">
                {lightboxImage.caption && (
                  <p className="text-white text-sm">{lightboxImage.caption}</p>
                )}
                {lightboxImage.source && (
                  <p className="text-gray-500 text-xs mt-1">Source: {lightboxImage.source}</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
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
