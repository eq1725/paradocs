// Report detail page - updated Jan 29, 2026
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  MapPin, Calendar, Clock, Users, Eye, Star,
  ThumbsUp, ThumbsDown, Share2, Bookmark, BookOpen,
  Award, AlertTriangle, Check, ChevronRight, ChevronDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ReportWithDetails, CommentWithUser } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG } from '@/lib/constants'
import type { ContentType } from '@/lib/database.types'
import { formatDate, formatRelativeDate, classNames, estimateReadingTime } from '@/lib/utils'
import RelatedReports from '@/components/RelatedReports'
import { logActivity } from '@/lib/services/streak.service'
import { useToast } from '@/components/Toast'
import MediaGallery from '@/components/MediaGallery'
import ReadingProgress from '@/components/ReadingProgress'
import ArticleTableOfContents from '@/components/ArticleTableOfContents'
const LogToConstellation = dynamic(
  () => import('@/components/LogToConstellation'),
  { ssr: false }
)
// Lazy load below-fold components for faster initial page render
const ReportAIInsight = dynamic(
  () => import('@/components/reports/ReportAIInsight'),
  { ssr: false, loading: () => <div className="h-32 bg-white/5 rounded-lg animate-pulse mb-8" /> }
)
const FurtherReading = dynamic(
  () => import('@/components/reports/FurtherReading'),
  { ssr: false }
)
const PatternConnections = dynamic(
  () => import('@/components/reports/PatternConnections'),
  { ssr: false, loading: () => <div className="h-24 bg-white/5 rounded-lg animate-pulse" /> }
)
const ConnectionCards = dynamic(
  () => import('@/components/reports/ConnectionCards'),
  { ssr: false, loading: () => <div className="h-24 bg-white/5 rounded-lg animate-pulse" /> }
)
const EnvironmentalContext = dynamic(
  () => import('@/components/reports/EnvironmentalContext'),
  { ssr: false, loading: () => <div className="h-32 bg-white/5 rounded-lg animate-pulse" /> }
)
const AcademicObservationPanel = dynamic(
  () => import('@/components/reports/AcademicObservationPanel'),
  { ssr: false, loading: () => <div className="h-32 bg-white/5 rounded-lg animate-pulse" /> }
)
// ReportPhenomena removed from report page â tagging lives in admin/dashboard instead
import FormattedDescription from '@/components/FormattedDescription'
import OnboardingTour, { hasCompletedOnboarding } from '@/components/OnboardingTour'
import AskTheUnknown from '@/components/AskTheUnknown'
// Mobile components available but not used here — Layout.tsx provides global nav
// import { MobileHeader, MobileBottomTabs } from '@/components/mobile'

// Dynamically import LocationMap to avoid SSR issues with MapLibre GL (WebGL)
const LocationMap = dynamic(
  () => import('@/components/reports/LocationMap'),
  { ssr: false, loading: () => <div className="h-64 bg-white/5 rounded-lg animate-pulse" /> }
)

// Wrapper that fetches the auth token for LogToConstellation
function LogToConstellationWrapper({ isOpen, onClose, report, onLogged }: {
  isOpen: boolean; onClose: () => void; report: any; onLogged: (entry: any) => void
}) {
  const [token, setToken] = useState('')
  useEffect(() => {
    if (isOpen) {
      supabase.auth.getSession().then(({ data: { session } }) => {
        setToken(session?.access_token || '')
      })
    }
  }, [isOpen])
  if (!token && isOpen) return null
  return (
    <LogToConstellation
      isOpen={isOpen}
      onClose={onClose}
      reportId={report.id}
      reportTitle={report.title}
      reportCategory={report.category}
      userToken={token}
      onLogged={onLogged}
    />
  )
}

interface ReportPageProps {
  slug: string
  initialReport?: any
  initialMedia?: any[]
  initialComments?: any[]
  fetchError?: boolean
}

export default function ReportPage({ slug: propSlug, initialReport, initialMedia, initialComments, fetchError }: ReportPageProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const slug = propSlug || router.query.slug

  const [report, setReport] = useState<ReportWithDetails | null>(initialReport || null)
  const [comments, setComments] = useState<CommentWithUser[]>(initialComments || [])
  const [media, setMedia] = useState<any[]>(initialMedia || [])
  const [loading, setLoading] = useState(!initialReport && !fetchError)
  const [user, setUser] = useState<any>(null)
  // Comment state retained for data compatibility — UI removed from report pages
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savingReport, setSavingReport] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [userVote, setUserVote] = useState<1 | -1 | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [logModalOpen, setLogModalOpen] = useState(false)
  const [isLogged, setIsLogged] = useState(false)
  const [parentCase, setParentCase] = useState<{ slug: string; title: string } | null>(null)
  const [showAllTags, setShowAllTags] = useState(false)
  const [showRationale, setShowRationale] = useState(false)

  // Load parent case report when this report belongs to a case group
  useEffect(() => {
    if (!report || !(report as any).case_group) {
      setParentCase(null)
      return
    }
    // Reset immediately so stale banner doesn't linger during navigation
    setParentCase(null)
    // Find the showcase/parent report in this case group (not ourselves)
    async function loadParentCase() {
      try {
        const { data } = await supabase
          .from('report_links' as any)
          .select('source_report_id')
          .eq('target_report_id', report!.id)
          .eq('link_type', 'witness_account')
          .limit(1) as any
        if (data && data.length > 0) {
          const { data: parentData } = await supabase
            .from('reports')
            .select('slug, title')
            .eq('id', data[0].source_report_id)
            .single()
          if (parentData) {
            setParentCase(parentData)
          }
        }
      } catch {
        // Silently skip if report_links doesn't exist
      }
    }
    loadParentCase()
  }, [report?.id])

  useEffect(() => {
    if (slug) {
      // Check if initialReport matches the current slug â during client-side navigation
      // between report pages, initialReport may hold stale data from the previous page
      const initialMatchesSlug = initialReport && initialReport.slug === slug

      if (initialMatchesSlug) {
        // Data came from server and matches current slug â just load user-specific state
        setReport(initialReport)
        setMedia(initialMedia || [])
        setComments(initialComments || [])
        setLoading(false)
        loadUserState(initialReport.id)
        incrementViewCount(initialReport.id, initialReport.view_count)
        checkUser()
      } else if (!fetchError) {
        // CRITICAL: Clear stale report data IMMEDIATELY before async fetch.
        // Without this, component renders new slug + old report for one frame,
        // crashing child components that receive mismatched props.
        setReport(null)
        setMedia([])
        setComments([])
        setLoading(true)
        setParentCase(null)
        setShowAllTags(false)
        setIsLogged(false)
        // Scroll to top for the new report
        window.scrollTo(0, 0)
        // Then fetch the new report data
        loadReport()
        checkUser()
      }
    }
  }, [slug])

  // Check if onboarding tour should be shown
  useEffect(() => {
    if (!slug || loading || !report) return

    const params = new URLSearchParams(window.location.search)
    const tourRequested = params.get('tour') === 'true'
    const alreadySeen = hasCompletedOnboarding()

    if (tourRequested || (!alreadySeen && slug === 'the-roswell-incident-july-1947-showcase')) {
      // Small delay to let the page fully render before starting tour
      const timer = setTimeout(() => setShowTour(true), 800)
      return () => clearTimeout(timer)
    }
  }, [slug, loading, report])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    const currentUser = session?.user || null
    setUser(currentUser)
    return currentUser
  }

  // Load user-specific state (votes, saved) â called when report data came from server
  async function loadUserState(reportId: string) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const [{ data: voteData }, { data: savedData }] = await Promise.all([
          supabase
            .from('votes')
            .select('vote_type')
            .eq('user_id', session.user.id)
            .eq('report_id', reportId)
            .single(),
          supabase
            .from('saved_reports')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('report_id', reportId)
            .single()
        ])
        setUserVote(voteData?.vote_type as 1 | -1 | null ?? null)
        setIsSaved(!!savedData)
        setSavedId((savedData as any)?.id || null)

        // Check if logged to constellation (non-blocking)
        fetch(`/api/constellation/entries?report_id=${reportId}`, {
          headers: { Authorization: `Bearer ${session.access_token}` }
        })
          .then(r => r.json())
          .then(data => setIsLogged(!!data.entry))
          .catch(() => {})
      }
    } catch (e) {
      // User state is non-critical â fail silently
    }
  }

  // Increment view count â deduplicated per session to avoid inflation
  async function incrementViewCount(reportId: string, currentCount: number) {
    try {
      const viewKey = `viewed_${reportId}`
      if (typeof window !== 'undefined' && sessionStorage.getItem(viewKey)) {
        return // Already counted this session
      }
      await supabase
        .from('reports')
        .update({ view_count: currentCount + 1 })
        .eq('id', reportId)
      setReport(prev => prev ? { ...prev, view_count: currentCount + 1 } : prev)
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(viewKey, '1')
      }
      // Log activity for streak tracking (non-blocking)
      logActivity('view_report', { report_id: reportId }).catch(() => {})
      // Track for constellation map (non-blocking, requires auth)
      supabase.auth.getSession().then(({ data: { session } }) => {
        if (session?.access_token) {
          fetch('/api/activity/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
            body: JSON.stringify({ action_type: 'view', category: report?.category || null, metadata: { report_id: reportId } }),
          }).catch(() => {})
        }
      })
    } catch (e) {
      // Non-critical â fail silently
    }
  }

  async function loadReport() {
    // Capture the slug we're fetching for — if user navigates again before
    // this fetch completes, we must not set state for the stale slug
    const fetchingSlug = slug
    setLoading(true)
    // Reset stale state from previous report during client-side navigation
    setUserVote(null)
    setIsSaved(false)
    setSavedId(null)
    setSidebarOpen(false)
    setShowRationale(false)
    setParentCase(null)
    try {
      // Load report
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select(`
          *,
          phenomenon_type:phenomenon_types(*)
        `)
        .eq('slug', slug)
        .eq('status', 'approved')
        .single()

      if (reportError) throw reportError

      // Stale navigation guard: if user navigated away during fetch, discard results
      if (slug !== fetchingSlug) return

      // Load comments
      const { data: commentsData } = await supabase
        .from('comments')
        .select(`
          *,
          user:profiles(*)
        `)
        .eq('report_id', reportData.id)
        .eq('is_deleted', false)
        .order('created_at', { ascending: true })

      // Load media
      const { data: mediaData } = await supabase
        .from('report_media')
        .select('*')
        .eq('report_id', reportData.id)
        .order('is_primary', { ascending: false })

      // Load user vote and saved state
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        const [{ data: voteData }, { data: savedData }] = await Promise.all([
          supabase
            .from('votes')
            .select('vote_type')
            .eq('user_id', session.user.id)
            .eq('report_id', reportData.id)
            .single(),
          supabase
            .from('saved_reports')
            .select('id')
            .eq('user_id', session.user.id)
            .eq('report_id', reportData.id)
            .single()
        ])
        setUserVote(voteData?.vote_type as 1 | -1 | null ?? null)
        setIsSaved(!!savedData)
        setSavedId(savedData?.id || null)
      } else {
        setUserVote(null)
        setIsSaved(false)
        setSavedId(null)
      }

      // Increment view count
      await supabase
        .from('reports')
        .update({ view_count: reportData.view_count + 1 })
        .eq('id', reportData.id)

      setReport({ ...reportData, view_count: reportData.view_count + 1 })
      setComments(commentsData || [])
      setMedia(mediaData || [])
    } catch (error) {
      console.error('Error loading report:', error)
      router.push('/404')
    } finally {
      setLoading(false)
    }
  }

  async function handleVote(voteType: 1 | -1) {
    if (!user || !report) return

    try {
      const { data: existing } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', user.id)
        .eq('report_id', report.id)
        .single()

      if (existing) {
        if (existing.vote_type === voteType) {
          // Remove vote â toggle off
          await supabase.from('votes').delete().eq('id', existing.id)
          setUserVote(null)
          setReport(prev => prev ? {
            ...prev,
            upvotes: prev.upvotes - (voteType === 1 ? 1 : 0),
            downvotes: prev.downvotes - (voteType === -1 ? 1 : 0),
          } : prev)
        } else {
          // Switch vote
          await supabase.from('votes').update({ vote_type: voteType }).eq('id', existing.id)
          setUserVote(voteType)
          setReport(prev => prev ? {
            ...prev,
            upvotes: prev.upvotes + (voteType === 1 ? 1 : -1),
            downvotes: prev.downvotes + (voteType === -1 ? 1 : -1),
          } : prev)
        }
      } else {
        // New vote
        await supabase.from('votes').insert({
          user_id: user.id,
          report_id: report.id,
          vote_type: voteType,
        })
        setUserVote(voteType)
        setReport(prev => prev ? {
          ...prev,
          upvotes: prev.upvotes + (voteType === 1 ? 1 : 0),
          downvotes: prev.downvotes + (voteType === -1 ? 1 : 0),
        } : prev)
      }
    } catch (error) {
      console.error('Error voting:', error)
      showToast('error', 'Failed to register vote')
    }
  }

  async function handleComment() {
    if (!user || !report || !newComment.trim()) return

    setSubmittingComment(true)
    try {
      await supabase.from('comments').insert({
        report_id: report.id,
        user_id: user.id,
        content: newComment.trim(),
      })
      setNewComment('')
      showToast('success', 'Comment posted')
      loadReport()
    } catch (error) {
      console.error('Error commenting:', error)
      showToast('error', 'Failed to post comment')
    } finally {
      setSubmittingComment(false)
    }
  }

  async function handleSave() {
    if (!user || !report || savingReport) return
    setSavingReport(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return

      if (isSaved && savedId) {
        // Unsave
        await fetch('/api/user/saved', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ saved_id: savedId }),
        })
        setIsSaved(false)
        setSavedId(null)
        showToast('info', 'Report removed from saved')
        // Track unsave for constellation (non-blocking)
        fetch('/api/activity/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action_type: 'unsave', category: report.category, metadata: { report_id: report.id } }),
        }).catch(() => {})
      } else {
        // Save
        const resp = await fetch('/api/user/saved', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ report_id: report.id }),
        })
        const data = await resp.json()
        if (data.success) {
          setIsSaved(true)
          setSavedId(data.saved_id)
          showToast('success', 'Report saved')
          // Track save for constellation (non-blocking)
          fetch('/api/activity/track', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ action_type: 'save', category: report.category, metadata: { report_id: report.id } }),
          }).catch(() => {})
        }
      }
    } catch (error) {
      console.error('Error saving report:', error)
      showToast('error', 'Failed to save report')
    } finally {
      setSavingReport(false)
    }
  }

  function handleShare() {
    var url = window.location.href
    // Use native share sheet on mobile (better UX), clipboard on desktop
    if (navigator.share) {
      navigator.share({ title: report?.title || 'Paradocs', url: url }).catch(function() {})
      return
    }
    navigator.clipboard.writeText(url).then(function() {
      setCopiedShare(true)
      setTimeout(function() { setCopiedShare(false) }, 2000)
      showToast('success', 'Link copied to clipboard')
    }).catch(function() {})
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="skeleton h-8 w-48 mb-4" />
        <div className="skeleton h-12 w-full mb-4" />
        <div className="skeleton h-64 w-full" />
      </div>
    )
  }

  if (!report) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        {fetchError ? (
          <>
            <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-white mb-2">Temporarily Unavailable</h2>
            <p className="text-gray-400 mb-6">We&apos;re experiencing a brief service interruption. This page will be back shortly.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-primary-500 hover:bg-primary-600 text-white rounded-lg transition-colors mr-3"
            >
              Try Again
            </button>
            <Link href="/explore" className="text-primary-400 hover:text-primary-300 inline-block">
              Browse all reports
            </Link>
          </>
        ) : (
          <>
            <p className="text-gray-400">Report not found</p>
            <Link href="/explore" className="text-primary-400 hover:text-primary-300 mt-4 inline-block">
              Browse all reports
            </Link>
          </>
        )}
      </div>
    )
  }

  const categoryConfig = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
  const credibilityConfig = CREDIBILITY_CONFIG[report.credibility]
  const contentTypeConfig = CONTENT_TYPE_CONFIG[(report as any).content_type as ContentType] || CONTENT_TYPE_CONFIG.experiencer_report
  const reportContentType = (report as any).content_type as ContentType | undefined
  const isNonExperiencer = reportContentType && reportContentType !== 'experiencer_report' && reportContentType !== 'historical_case'

  return (
    <>
      <Head>
        <title>{report.title} - Paradocs</title>
        <meta name="description" content={report.summary || report.description?.slice(0, 160)} />

        {/* Open Graph */}
        <meta property="og:type" content="article" />
        <meta property="og:title" content={report.title} />
        <meta property="og:description" content={report.summary || report.description?.slice(0, 160)} />
        <meta property="og:site_name" content="Paradocs" />
        <meta property="og:url" content={`https://beta.discoverparadocs.com/report/${slug}`} />
        {media[0]?.url && <meta property="og:image" content={media[0].url} />}

        {/* Twitter Card */}
        <meta name="twitter:card" content={media[0]?.url ? 'summary_large_image' : 'summary'} />
        <meta name="twitter:title" content={report.title} />
        <meta name="twitter:description" content={report.summary || report.description?.slice(0, 160)} />
        {media[0]?.url && <meta name="twitter:image" content={media[0].url} />}

        {/* Article metadata */}
        {report.event_date && <meta property="article:published_time" content={report.event_date} />}
        <meta property="article:section" content={categoryConfig.label} />
        {report.tags?.map((tag: string, i: number) => (
          <meta key={i} property="article:tag" content={tag} />
        ))}
      </Head>

      <ReadingProgress />

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="lg:flex lg:gap-8">
          {/* Main content */}
          <article className="flex-1 max-w-4xl">
        {/* Mobile: breadcrumb trail */}
        <nav className="flex md:hidden items-center gap-1 mb-3 -ml-1 text-sm overflow-hidden" aria-label="Breadcrumb">
          <button
            onClick={function() { router.back() }}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg shrink-0"
            aria-label="Go back"
          >
            <ChevronRight className="w-4 h-4 rotate-180" />
          </button>
          <Link
            href={'/explore?category=' + report.category}
            className="text-gray-400 hover:text-white transition-colors shrink-0"
          >
            {categoryConfig.label}
          </Link>
          {parentCase && (
            <>
              <ChevronRight className="w-3 h-3 shrink-0 text-gray-600" />
              <Link
                href={'/report/' + parentCase.slug}
                className="text-gray-400 hover:text-white transition-colors truncate"
              >
                Case File
              </Link>
            </>
          )}
        </nav>

        {/* Desktop: full breadcrumb */}
        <nav className="hidden md:flex items-center gap-1.5 text-sm text-gray-400 mb-6 overflow-hidden" aria-label="Breadcrumb">
          <Link href="/explore" className="hover:text-white transition-colors shrink-0">
            Explore
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
          <Link
            href={'/explore?category=' + report.category}
            className="hover:text-white transition-colors shrink-0"
          >
            {categoryConfig.label}
          </Link>
          {parentCase && (
            <>
              <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
              <Link
                href={'/report/' + parentCase.slug}
                className="hover:text-white transition-colors shrink-0"
              >
                {parentCase.title}
              </Link>
            </>
          )}
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
          <span className="text-gray-500 truncate">{report.title}</span>
        </nav>

        {/* Parent Case Banner â link back to main case report */}
        {parentCase && (
          <div className="mb-4 p-3 bg-primary-500/10 border border-primary-500/30 rounded-lg flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-500/20 flex items-center justify-center flex-shrink-0">
              <ChevronRight className="w-4 h-4 text-primary-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-primary-400/70 uppercase tracking-wider font-medium">Part of Case File</p>
              <Link
                href={`/report/${parentCase.slug}`}
                className="text-primary-300 hover:text-primary-200 font-medium transition-colors truncate block"
              >
                {parentCase.title}
              </Link>
            </div>
            <Link
              href={`/report/${parentCase.slug}`}
              className="text-xs text-primary-400 hover:text-primary-300 transition-colors flex items-center gap-1 flex-shrink-0"
            >
              View Case <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Non-Experiencer Content Notice â only for news/discussion and research content */}
        {isNonExperiencer && (
          <div className="mb-6 p-4 bg-gray-800/50 border border-gray-700 rounded-lg flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 font-medium text-sm">
                {contentTypeConfig.label}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {contentTypeConfig.description}. This is not a first-hand experiencer report.
              </p>
            </div>
          </div>
        )}

        {/* Header */}
        <header className="mb-8" data-tour-step="header">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
            {/* Content Type Badge */}
            <span className={classNames(
              'px-3 py-1 rounded-full text-xs sm:text-sm font-medium border flex items-center gap-1.5',
              contentTypeConfig.bgColor,
              contentTypeConfig.color,
              contentTypeConfig.borderColor
            )}>
              <span>{contentTypeConfig.icon}</span>
              <span className="hidden sm:inline">{contentTypeConfig.label}</span>
              <span className="sm:hidden">{contentTypeConfig.shortLabel}</span>
            </span>
            {/* Featured Investigation — editorial distinction for curated showcases */}
            {report.featured && (
              <span className="px-3 py-1 rounded-full text-xs sm:text-sm font-medium border flex items-center gap-1.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                <Star className="w-3 h-3" />
                <span className="hidden sm:inline">Featured Investigation</span>
                <span className="sm:hidden">Featured</span>
              </span>
            )}
            {/* Phenomenon type — show if present and meaningful (not "Notable Case" placeholder) */}
            {report.phenomenon_type && report.phenomenon_type.name !== categoryConfig.label && report.phenomenon_type.name !== 'Notable Case' && (
              <span className={classNames(
                'px-3 py-1 rounded-full text-xs sm:text-sm font-medium border',
                categoryConfig.bgColor,
                categoryConfig.color,
                'border-current/30'
              )}>
                {categoryConfig.icon} {report.phenomenon_type.name}
              </span>
            )}
          </div>

          <h1 className="text-xl sm:text-3xl md:text-4xl font-display font-bold text-white mb-4 leading-tight">
            {report.title}
          </h1>

          {/* Only show summary if it adds value beyond the title AND description */}
          {(() => {
            if (!report.summary) return null;
            const summaryLower = report.summary.trim().toLowerCase();
            const titleLower = (report.title || '').trim().toLowerCase();
            const descLower = (report.description || '').trim().toLowerCase();

            // Don't show if summary starts with title
            if (summaryLower.startsWith(titleLower.slice(0, 30))) return null;

            // Don't show if summary equals description
            if (summaryLower === descLower) return null;

            // Don't show if summary (minus trailing ...) matches start of description
            // This handles truncated summaries like "text here..."
            const summaryClean = summaryLower.replace(/\.{2,}$/, '').replace(/â¦$/, '').trim();
            if (descLower.startsWith(summaryClean.slice(0, 50))) return null;

            // Don't show if first 50 chars match (handles various truncation styles)
            if (summaryLower.slice(0, 50) === descLower.slice(0, 50)) return null;

            return (
              <p className="text-lg text-gray-300 mb-6">
                {report.summary}
              </p>
            );
          })()}

          {/* Meta info */}
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            {report.location_name && (
              <span className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4" />
                {report.location_name}
                {report.country && `, ${report.country}`}
              </span>
            )}
            {report.event_date && (
              <span className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4" />
                {formatDate(report.event_date, 'MMMM d, yyyy')}
                {report.event_date_approximate && ' (approximate)'}
              </span>
            )}
            {report.event_time && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {(() => {
                  // Format "14:00:00" → "2:00 PM", pass through non-standard formats
                  const match = report.event_time.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
                  if (!match) return report.event_time
                  const h = parseInt(match[1], 10)
                  const m = match[2]
                  const period = h >= 12 ? 'PM' : 'AM'
                  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
                  return h12 + ':' + m + ' ' + period
                })()}
              </span>
            )}
            {report.witness_count > 1 && (
              <span className="flex items-center gap-1.5" title={report.witness_count >= 10 ? 'Approximate count based on available records' : report.witness_count + ' documented witnesses'}>
                <Users className="w-4 h-4" />
                {report.witness_count >= 10 ? '~' : ''}{report.witness_count} witnesses{report.witness_count >= 10 ? ' (est.)' : ''}
              </span>
            )}
            {report.description && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {estimateReadingTime(report.description)} min read
              </span>
            )}
          </div>

          {/* Quick actions - Log prominently in header */}
          {user && (
            <div className="flex items-center gap-3 mt-5">
              <button
                onClick={() => setLogModalOpen(true)}
                className={classNames(
                  'inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  isLogged
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                    : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-600/20'
                )}
              >
                <BookOpen className="w-4 h-4" />
                {isLogged ? 'Saved to Research Hub' : 'Save to Research Hub'}
              </button>
              <button
                onClick={handleSave}
                disabled={savingReport}
                className={classNames(
                  'inline-flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
                  isSaved
                    ? 'bg-primary-500/20 text-primary-300 border border-primary-500/30'
                    : 'bg-gray-800 hover:bg-gray-700 text-gray-400'
                )}
              >
                <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
                {isSaved ? 'Saved' : 'Save'}
              </button>
            </div>
          )}
        </header>

        {/* Hero Media Gallery — images only, shown compactly above TOC */}
        {media.length > 0 && (
          <div className="mb-8" data-tour-step="media">
            <MediaGallery media={media} mode="images" />
          </div>
        )}

        {/* Table of Contents — shown for longer articles with multiple sections */}
        {report.description && (
          <ArticleTableOfContents description={report.description} />
        )}

        {/* Main content — optimized reading typography on mobile */}
        <div className="glass-card p-4 sm:p-6 md:p-8 mb-6 sm:mb-8 overflow-hidden" data-tour-step="description">
          <div className="prose prose-invert max-w-prose mx-auto md:max-w-none md:mx-0">
            <FormattedDescription
              text={report.description || ''}
              className="text-gray-300 leading-relaxed break-words text-[16px] md:text-base"
            />
          </div>

          {/* Sources & Documents — external links and embedded videos shown after body text */}
          {media.length > 0 && (
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                <span>Sources & Documents</span>
                <span className="text-xs text-white/30 font-normal">Primary source material</span>
              </h3>
              <MediaGallery media={media} mode="sources" />
            </div>
          )}

          {/* Evidence section — elevated visual treatment for credibility */}
          {(report.has_physical_evidence || report.has_photo_video || report.has_official_report || report.evidence_summary) && (
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="font-medium text-white mb-4 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-400" />
                Evidence & Documentation
              </h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {report.has_photo_video && (
                  <span className="px-3 py-1.5 rounded-lg text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 flex items-center gap-1.5">
                    <Check className="w-3 h-3" />
                    Photos/Video Available
                  </span>
                )}
                {report.has_physical_evidence && (
                  <span className="px-3 py-1.5 rounded-lg text-xs bg-green-500/10 text-green-400 border border-green-500/20 flex items-center gap-1.5">
                    <Check className="w-3 h-3" />
                    Physical Evidence
                  </span>
                )}
                {report.has_official_report && (
                  <span className="px-3 py-1.5 rounded-lg text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center gap-1.5">
                    <Check className="w-3 h-3" />
                    Official Report Filed
                  </span>
                )}
              </div>
              {report.evidence_summary && (
                <p className="text-sm text-gray-300 leading-relaxed">{report.evidence_summary}</p>
              )}
            </div>
          )}

        </div>

        {/* Tags — compact, subtle discovery affordances */}
        {report.tags && report.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-6 sm:mb-8 items-center">
            {(showAllTags ? report.tags : report.tags.slice(0, 8)).map((tag, i) => (
              <Link
                key={i}
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-300 transition-colors"
              >
                #{tag}
              </Link>
            ))}
            {!showAllTags && report.tags.length > 8 && (
              <button
                onClick={function () { setShowAllTags(true) }}
                className="px-2.5 py-1 rounded-full text-[11px] bg-white/[0.04] text-gray-500 hover:bg-white/[0.08] hover:text-gray-400 transition-colors"
              >
                +{report.tags.length - 8} more
              </button>
            )}
          </div>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8" data-tour-step="info-grid">
          {/* Content Type */}
          <div className="glass-card p-3 sm:p-4">
            <h4 className="text-[11px] text-gray-500 mb-1.5 uppercase tracking-wider">Content Type</h4>
            <div className={classNames(
              'text-sm font-medium flex items-center gap-1.5',
              contentTypeConfig.color
            )}>
              <span>{contentTypeConfig.icon}</span>
              <span className="truncate">{contentTypeConfig.shortLabel}</span>
            </div>
          </div>

          {/* Credibility — expandable with rationale */}
          <button
            className="glass-card p-3 sm:p-4 text-left w-full cursor-pointer hover:bg-white/[0.04] transition-colors"
            onClick={() => setShowRationale(!showRationale)}
            aria-expanded={showRationale}
          >
            <h4 className="text-[11px] text-gray-500 mb-1.5 uppercase tracking-wider flex items-center justify-between">
              <span>Credibility</span>
              <ChevronDown className={classNames(
                'w-3 h-3 text-gray-500 transition-transform duration-200',
                showRationale ? 'rotate-180' : ''
              )} />
            </h4>
            <div className={classNames(
              'text-sm font-medium',
              credibilityConfig.color
            )}>
              {credibilityConfig.label}
            </div>
          </button>

          {/* Source Origin */}
          <div className="glass-card p-3 sm:p-4">
            <h4 className="text-[11px] text-gray-500 mb-1.5 uppercase tracking-wider">Source</h4>
            <div className="text-sm font-medium text-white truncate">
              {report.source_type === 'user_submission' ? 'User Submitted' : report.source_type === 'curated' ? 'Editorial' : report.source_type === 'historical_archive' ? 'Historical Archive' : (report.source_type || 'Unknown').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())}
            </div>
          </div>

          {/* Date Added */}
          <div className="glass-card p-3 sm:p-4">
            <h4 className="text-[11px] text-gray-500 mb-1.5 uppercase tracking-wider">Added</h4>
            <div className="text-sm font-medium text-white truncate">
              {new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
            </div>
          </div>
        </div>

        {/* Credibility Rationale — expandable explanation below the info grid */}
        {showRationale && (
          <div className="mb-6 sm:mb-8 -mt-2 sm:-mt-4 glass-card p-4 sm:p-5 border border-white/[0.08]">
            <div className="flex items-start gap-3">
              <AlertTriangle className={classNames('w-4 h-4 mt-0.5 shrink-0', credibilityConfig.color)} />
              <div>
                <h4 className={classNames('text-sm font-medium mb-1.5', credibilityConfig.color)}>
                  Why {credibilityConfig.label}?
                </h4>
                <p className="text-sm text-gray-300 leading-relaxed">
                  {(report as any).credibility_rationale || credibilityConfig.description}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Further Reading — Amazon affiliate book recommendations */}
        <FurtherReading reportId={report.id} />

        {/* AI Analysis Section */}
        <div data-tour-step="ai-insight">
          <ReportAIInsight reportSlug={slug as string} className="mb-8" />
        </div>

        {/* Location Intelligence Map */}
        {report.latitude && report.longitude && (
          <div data-tour-step="location-map">
          <LocationMap
            reportSlug={slug as string}
            reportTitle={report.title}
            latitude={report.latitude}
            longitude={report.longitude}
            className="mb-8"
          />
          </div>
        )}

        {/* Environmental Context & Academic Data - Side by Side on larger screens */}
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 mb-6 sm:mb-8" data-tour-step="environmental">
          <EnvironmentalContext reportSlug={slug as string} />
          <AcademicObservationPanel reportSlug={slug as string} />
        </div>

        {/* Did You Know? Connection Cards — py-1 provides space for hover:scale effect */}
        <div className="py-1 -my-1">
          <ConnectionCards reportSlug={slug as string} caseGroup={(report as any).case_group} className="mb-8 sm:mb-10" />
        </div>

        {/* Combined engagement + CTA block — one cohesive closing section */}
        <div className="mb-4 rounded-xl bg-white/[0.03] border border-white/[0.06] overflow-hidden">
          {/* Engagement actions row */}
          <div className="flex items-center justify-between px-4 py-3">
            {/* Left: Vote buttons */}
            <div className="flex items-center gap-1">
              <div className="flex items-center bg-white/[0.04] rounded-full">
                <button
                  onClick={() => handleVote(1)}
                  disabled={!user}
                  className={classNames(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-l-full transition-all disabled:opacity-40',
                    userVote === 1
                      ? 'text-green-400 bg-green-500/10'
                      : 'text-gray-400 hover:text-green-400 hover:bg-white/[0.04]'
                  )}
                  title="Helpful"
                >
                  <ThumbsUp className="w-3.5 h-3.5" fill={userVote === 1 ? 'currentColor' : 'none'} />
                  {report.upvotes > 0 && <span className="text-xs">{report.upvotes}</span>}
                </button>
                <div className="w-px h-3.5 bg-white/10" />
                <button
                  onClick={() => handleVote(-1)}
                  disabled={!user}
                  className={classNames(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-r-full transition-all disabled:opacity-40',
                    userVote === -1
                      ? 'text-red-400 bg-red-500/10'
                      : 'text-gray-400 hover:text-red-400 hover:bg-white/[0.04]'
                  )}
                  title="Not helpful"
                >
                  <ThumbsDown className="w-3.5 h-3.5" fill={userVote === -1 ? 'currentColor' : 'none'} />
                  {report.downvotes > 0 && <span className="text-xs">{report.downvotes}</span>}
                </button>
              </div>
              {report.view_count > 0 && (
                <span className="hidden sm:flex items-center gap-1 px-2 text-gray-500 text-xs">
                  <Eye className="w-3 h-3" />
                  {report.view_count > 999 ? Math.round(report.view_count / 100) / 10 + 'k' : report.view_count}
                </span>
              )}
            </div>

            {/* Right: Utility actions */}
            <div className="flex items-center gap-0.5">
              {user && (
                <button
                  onClick={() => setLogModalOpen(true)}
                  className={classNames(
                    'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all',
                    isLogged
                      ? 'text-indigo-400 bg-indigo-500/10'
                      : 'text-gray-400 hover:text-indigo-400 hover:bg-white/[0.04]'
                  )}
                  title="Save to Research Hub"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{isLogged ? 'In Hub' : 'Research'}</span>
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!user || savingReport}
                className={classNames(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all disabled:opacity-40',
                  isSaved
                    ? 'text-primary-400 bg-primary-500/10'
                    : 'text-gray-400 hover:text-primary-400 hover:bg-white/[0.04]'
                )}
                title={isSaved ? 'Bookmarked' : 'Bookmark'}
              >
                <Bookmark className="w-3.5 h-3.5" fill={isSaved ? 'currentColor' : 'none'} />
                <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
              </button>
              <button
                onClick={handleShare}
                className={classNames(
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs transition-all',
                  copiedShare ? 'text-green-400 bg-green-500/10' : 'text-gray-400 hover:text-gray-300 hover:bg-white/[0.04]'
                )}
                title="Share"
              >
                {copiedShare ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">{copiedShare ? 'Copied!' : 'Share'}</span>
              </button>
              {user && (
                <Link
                  href={`/dashboard/journal/new?report_id=${report.id}&report_title=${encodeURIComponent(report.title)}&report_slug=${report.slug}&report_category=${report.category}`}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-xs text-gray-400 hover:text-amber-400 hover:bg-white/[0.04] transition-all"
                  title="Write journal entry"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Journal</span>
                </Link>
              )}
            </div>
          </div>
        </div>
          </article>

          {/* Sidebar with related reports and patterns */}
          <aside className="lg:w-80 flex-shrink-0 mt-8 lg:mt-0" data-tour-step="sidebar">
            {/* Mobile: collapsible toggle */}
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="lg:hidden w-full flex items-center justify-between px-4 py-3 glass-card mb-4"
            >
              <span className="text-sm font-medium text-gray-300">Related Reports &amp; Patterns</span>
              <ChevronDown className={classNames(
                'w-4 h-4 text-gray-400 transition-transform',
                sidebarOpen ? 'rotate-180' : ''
              )} />
            </button>

            <div className={classNames(
              'lg:sticky lg:top-20 space-y-6',
              sidebarOpen ? 'block' : 'hidden lg:block'
            )}>
              <RelatedReports
                reportId={report.id}
                category={report.category}
                phenomenonTypeId={report.phenomenon_type_id}
                caseGroup={(report as any).case_group}
                tags={report.tags}
                location={{
                  country: report.country,
                  state_province: report.state_province
                }}
                limit={6}
              />

              {/* Pattern Connections */}
              <PatternConnections reportSlug={slug as string} />

            </div>
          </aside>
        </div>

        {/* Contextual CTA — spans full width across article + sidebar */}
        <div className="mt-6 sm:mt-8 mb-4">
          <div className="relative overflow-hidden rounded-xl border border-purple-500/15 bg-gradient-to-r from-purple-500/[0.04] via-indigo-500/[0.04] to-purple-500/[0.04] p-5 sm:p-6 lg:p-8 text-center">
            <div className="relative">
              {(report as any).content_type === 'historical_case' || (report as any).content_type === 'research_analysis' || (report as any).content_type === 'news_discussion' ? (
                <>
                  <h3 className="text-lg font-semibold text-white mb-1.5">Help build the record</h3>
                  <p className="text-gray-400 text-sm mb-4">Know of additional evidence or witness accounts related to this case?</p>
                  <a
                    href="/submit"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #9000f0, #7a00cc)', boxShadow: '0 2px 12px rgba(144, 0, 240, 0.35)' }}
                  >
                    Contribute Research
                  </a>
                </>
              ) : (
                <>
                  <h3 className="text-lg font-semibold text-white mb-1.5">Have you seen something similar?</h3>
                  <p className="text-gray-400 text-sm mb-4">Your experience could help others understand the unexplained.</p>
                  <a
                    href="/submit"
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white transition-all hover:scale-105"
                    style={{ background: 'linear-gradient(135deg, #9000f0, #7a00cc)', boxShadow: '0 2px 12px rgba(144, 0, 240, 0.35)' }}
                  >
                    Share Your Experience
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Onboarding Tour Overlay */}
      {showTour && (
        <OnboardingTour
          onComplete={() => {
            setShowTour(false)
            // Clean up tour query param if present
            const url = new URL(window.location.href)
            if (url.searchParams.has('tour')) {
              url.searchParams.delete('tour')
              window.history.replaceState({}, '', url.pathname)
            }
          }}
        />
      )}

        <AskTheUnknown
          contextType="report"
          contextId={slug as string}
          contextTitle={report?.title}
        />

        {/* Save to Research Hub Modal */}
        {user && report && (
          <LogToConstellationWrapper
            isOpen={logModalOpen}
            onClose={() => setLogModalOpen(false)}
            report={report}
            onLogged={(entry: any) => setIsLogged(!!entry)}
          />
        )}

    </>
  )
}

// Enable dynamic routes with fallback
export async function getStaticPaths() {
  return {
    paths: [],
    fallback: 'blocking'
  }
}

export async function getStaticProps({ params }: { params: { slug: string } }) {
  try {
    const { createClient } = await import('@supabase/supabase-js')
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    // Fetch report data at build/revalidation time
    const { data: reportData, error: reportError } = await sb
      .from('reports')
      .select(`*, phenomenon_type:phenomenon_types(*)`)
      .eq('slug', params.slug)
      .eq('status', 'approved')
      .single()

    if (reportError || !reportData) {
      return { notFound: true }
    }

    // Fetch media
    const { data: mediaData } = await sb
      .from('report_media')
      .select('*')
      .eq('report_id', (reportData as any).id)
      .order('is_primary', { ascending: false })

    // Fetch comments
    const { data: commentsData } = await sb
      .from('comments')
      .select(`*, user:profiles(*)`)
      .eq('report_id', (reportData as any).id)
      .eq('is_deleted', false)
      .order('created_at', { ascending: true })

    return {
      props: {
        slug: params.slug,
        initialReport: reportData,
        initialMedia: mediaData || [],
        initialComments: commentsData || [],
      },
      revalidate: 120 // Revalidate every 2 minutes
    }
  } catch (error) {
    // If Supabase is down, return a fallback that shows an error state
    // but still allows the page to render from cache if available
    return {
      props: {
        slug: params.slug,
        initialReport: null,
        initialMedia: [],
        initialComments: [],
        fetchError: true,
      },
      revalidate: 30 // Retry sooner when there's an error
    }
  }
}
