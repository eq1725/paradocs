// Report detail page - updated Jan 29, 2026
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  MapPin, Calendar, Clock, Users, Eye,
  ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark,
  Award, AlertTriangle, Check, ChevronRight
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ReportWithDetails, CommentWithUser } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG } from '@/lib/constants'
import type { ContentType } from '@/lib/database.types'
import { formatDate, formatRelativeDate, classNames, estimateReadingTime } from '@/lib/utils'
import RelatedReports from '@/components/RelatedReports'
import MediaGallery from '@/components/MediaGallery'
import ReportAIInsight from '@/components/reports/ReportAIInsight'
import PatternConnections from '@/components/reports/PatternConnections'
import EnvironmentalContext from '@/components/reports/EnvironmentalContext'
import AcademicObservationPanel from '@/components/reports/AcademicObservationPanel'
// ReportPhenomena removed from report page — tagging lives in admin/dashboard instead
import OnboardingTour, { hasCompletedOnboarding } from '@/components/OnboardingTour'

// Dynamically import LocationMap to avoid SSR issues with Leaflet
const LocationMap = dynamic(
  () => import('@/components/reports/LocationMap'),
  { ssr: false, loading: () => <div className="h-64 bg-white/5 rounded-lg animate-pulse" /> }
)

export default function ReportPage() {
  const router = useRouter()
  const { slug } = router.query

  const [report, setReport] = useState<ReportWithDetails | null>(null)
  const [comments, setComments] = useState<CommentWithUser[]>([])
  const [media, setMedia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savingReport, setSavingReport] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [userVote, setUserVote] = useState<1 | -1 | null>(null)

  useEffect(() => {
    if (slug) {
      loadReport()
      checkUser()
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

  async function loadReport() {
    setLoading(true)
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
          // Remove vote — toggle off
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
      loadReport()
    } catch (error) {
      console.error('Error commenting:', error)
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
        }
      }
    } catch (error) {
      console.error('Error saving report:', error)
    } finally {
      setSavingReport(false)
    }
  }

  function handleShare() {
    const url = window.location.href
    navigator.clipboard.writeText(url).then(() => {
      setCopiedShare(true)
      setTimeout(() => setCopiedShare(false), 2000)
    }).catch(() => {
      // Fallback for older browsers
      if (navigator.share) {
        navigator.share({ title: report?.title, url })
      }
    })
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
        <p className="text-gray-400">Report not found</p>
        <Link href="/explore" className="text-primary-400 hover:text-primary-300 mt-4 inline-block">
          Browse all reports
        </Link>
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
        <title>{report.title} - ParaDocs</title>
        <meta name="description" content={report.summary} />
      </Head>

      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
        <div className="lg:flex lg:gap-8">
          {/* Main content */}
          <article className="flex-1 max-w-4xl overflow-hidden">
        {/* Breadcrumb nav */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-400 mb-6 overflow-hidden">
          <Link href="/explore" className="hover:text-white transition-colors shrink-0">
            Explore
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
          <Link
            href={`/explore?category=${report.category}`}
            className="hover:text-white transition-colors shrink-0"
          >
            {categoryConfig.label}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 shrink-0 text-gray-600" />
          <span className="text-gray-500 truncate">{report.title}</span>
        </nav>

        {/* Non-Experiencer Content Notice — only for news/discussion and research content */}
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
            {/* Content Type Badge - shown prominently for non-experiencer content */}
            <span className={classNames(
              'px-3 py-1 rounded-full text-sm font-medium border flex items-center gap-1.5',
              contentTypeConfig.bgColor,
              contentTypeConfig.color,
              contentTypeConfig.borderColor
            )}>
              <span>{contentTypeConfig.icon}</span>
              <span className="hidden sm:inline">{contentTypeConfig.label}</span>
              <span className="sm:hidden">{contentTypeConfig.shortLabel}</span>
            </span>
            <span className={classNames(
              'px-3 py-1 rounded-full text-sm font-medium border',
              categoryConfig.bgColor,
              categoryConfig.color,
              'border-current/30'
            )}>
              {categoryConfig.icon} {categoryConfig.label}
            </span>
            {report.phenomenon_type && (
              <span className="px-3 py-1 rounded-full text-sm bg-white/5 text-gray-300">
                {report.phenomenon_type.name}
              </span>
            )}
            {report.featured && (
              <span className="px-3 py-1 rounded-full text-sm bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                <Award className="w-3 h-3" />
                Featured
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-display font-bold text-white mb-4">
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
            const summaryClean = summaryLower.replace(/\.{2,}$/, '').replace(/…$/, '').trim();
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
                {report.event_time}
              </span>
            )}
            {report.witness_count > 1 && (
              <span className="flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {report.witness_count} witnesses
              </span>
            )}
            {report.description && (
              <span className="flex items-center gap-1.5">
                <Clock className="w-4 h-4" />
                {estimateReadingTime(report.description)} min read
              </span>
            )}
          </div>
        </header>

        {/* Media Gallery */}
        {media.length > 0 && (
          <div className="mb-8" data-tour-step="media">
            <MediaGallery media={media} />
          </div>
        )}

        {/* Main content */}
        <div className="glass-card p-4 sm:p-6 md:p-8 mb-6 sm:mb-8 overflow-hidden" data-tour-step="description">
          <div className="prose prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-gray-300 leading-relaxed break-words">
              {report.description}
            </div>
          </div>

          {/* Evidence section */}
          {(report.has_physical_evidence || report.has_photo_video || report.has_official_report || report.evidence_summary) && (
            <div className="mt-8 pt-8 border-t border-white/10">
              <h3 className="font-medium text-white mb-4">Evidence</h3>
              <div className="flex flex-wrap gap-2 mb-4">
                {report.has_photo_video && (
                  <span className="px-3 py-1 rounded-full text-xs bg-blue-500/20 text-blue-400">
                    Photos/Video Available
                  </span>
                )}
                {report.has_physical_evidence && (
                  <span className="px-3 py-1 rounded-full text-xs bg-green-500/20 text-green-400">
                    Physical Evidence
                  </span>
                )}
                {report.has_official_report && (
                  <span className="px-3 py-1 rounded-full text-xs bg-purple-500/20 text-purple-400">
                    Official Report Filed
                  </span>
                )}
              </div>
              {report.evidence_summary && (
                <p className="text-sm text-gray-400">{report.evidence_summary}</p>
              )}
            </div>
          )}

        </div>

        {/* Tags */}
        {report.tags && report.tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-6 sm:mb-8">
            {report.tags.map((tag, i) => (
              <Link
                key={i}
                href={`/search?q=${encodeURIComponent(tag)}`}
                className="px-3 py-1.5 rounded-full text-xs bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white border border-white/5 transition-colors"
              >
                #{tag}
              </Link>
            ))}
          </div>
        )}

        {/* Info grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-6 sm:mb-8" data-tour-step="info-grid">
          {/* Content Type */}
          <div className="glass-card p-4 sm:p-5">
            <h4 className="text-xs sm:text-sm text-gray-400 mb-2">Content Type</h4>
            <div className={classNames(
              'text-sm sm:text-base font-medium flex items-center gap-1.5',
              contentTypeConfig.color
            )}>
              <span>{contentTypeConfig.icon}</span>
              <span className="truncate">{contentTypeConfig.shortLabel}</span>
            </div>
          </div>

          {/* Credibility */}
          <div className="glass-card p-4 sm:p-5">
            <h4 className="text-xs sm:text-sm text-gray-400 mb-2">Credibility</h4>
            <div className={classNames(
              'text-sm sm:text-base font-medium',
              credibilityConfig.color
            )}>
              {credibilityConfig.label}
            </div>
          </div>

          {/* Source */}
          <div className="glass-card p-4 sm:p-5">
            <h4 className="text-xs sm:text-sm text-gray-400 mb-2">Source</h4>
            <div className="text-sm sm:text-base font-medium text-white truncate">
              {report.source_type === 'user_submission' ? 'User' : (report.source_type || 'Unknown')}
            </div>
          </div>

          {/* Submitted */}
          <div className="glass-card p-4 sm:p-5">
            <h4 className="text-xs sm:text-sm text-gray-400 mb-2">Submitted</h4>
            <div className="text-sm sm:text-base font-medium text-white truncate">
              {formatRelativeDate(report.created_at)}
            </div>
          </div>
        </div>

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
        <div className="grid md:grid-cols-2 gap-6 mb-8" data-tour-step="environmental">
          <EnvironmentalContext reportSlug={slug as string} />
          <AcademicObservationPanel reportSlug={slug as string} />
        </div>

        {/* Actions bar */}
        <div className="sticky bottom-0 z-40 -mx-3 sm:-mx-4 px-3 sm:px-4 py-3 bg-black/80 backdrop-blur-md border-t border-white/10 mb-6 sm:mb-8">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <button
                onClick={() => handleVote(1)}
                disabled={!user}
                className={classNames(
                  'flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 transition-colors',
                  userVote === 1 ? 'text-green-400' : 'text-gray-400 hover:text-green-400'
                )}
              >
                <ThumbsUp className="w-4 h-4 sm:w-5 sm:h-5" fill={userVote === 1 ? 'currentColor' : 'none'} />
                <span className="text-sm">{report.upvotes}</span>
              </button>
              <button
                onClick={() => handleVote(-1)}
                disabled={!user}
                className={classNames(
                  'flex items-center gap-1.5 sm:gap-2 disabled:opacity-50 transition-colors',
                  userVote === -1 ? 'text-red-400' : 'text-gray-400 hover:text-red-400'
                )}
              >
                <ThumbsDown className="w-4 h-4 sm:w-5 sm:h-5" fill={userVote === -1 ? 'currentColor' : 'none'} />
                <span className="text-sm">{report.downvotes}</span>
              </button>
              <span className="flex items-center gap-1.5 sm:gap-2 text-gray-400">
                <Eye className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm">{report.view_count}</span>
              </span>
              <button
                onClick={() => document.getElementById('comments')?.scrollIntoView({ behavior: 'smooth' })}
                className="flex items-center gap-1.5 sm:gap-2 text-gray-400 hover:text-primary-400 transition-colors"
              >
                <MessageCircle className="w-4 h-4 sm:w-5 sm:h-5" />
                <span className="text-sm">{comments.length}</span>
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                disabled={!user || savingReport}
                className={classNames(
                  'btn btn-ghost text-xs sm:text-sm transition-colors',
                  isSaved ? 'text-primary-400' : ''
                )}
              >
                <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
                <span className="hidden sm:inline">{isSaved ? 'Saved' : 'Save'}</span>
              </button>
              <button
                onClick={handleShare}
                className={classNames(
                  'btn btn-ghost text-xs sm:text-sm transition-colors',
                  copiedShare ? 'text-green-400' : ''
                )}
              >
                {copiedShare ? <Check className="w-4 h-4" /> : <Share2 className="w-4 h-4" />}
                <span className="hidden sm:inline">{copiedShare ? 'Copied!' : 'Share'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Comments */}
        <section id="comments">
          <h3 className="text-xl font-display font-semibold text-white mb-6 flex items-center gap-2">
            <MessageCircle className="w-5 h-5" />
            Comments ({comments.length})
          </h3>

          {/* Comment form */}
          {user ? (
            <div className="glass-card p-4 mb-6">
              <textarea
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Share your thoughts..."
                className="w-full h-24 resize-none mb-3"
              />
              <div className="flex justify-end">
                <button
                  onClick={handleComment}
                  disabled={!newComment.trim() || submittingComment}
                  className="btn btn-primary text-sm disabled:opacity-50"
                >
                  {submittingComment ? 'Posting...' : 'Post Comment'}
                </button>
              </div>
            </div>
          ) : (
            <div className="glass-card p-4 mb-6 text-center">
              <p className="text-gray-400">
                <Link href="/login" className="text-primary-400 hover:text-primary-300">
                  Sign in
                </Link>
                {' '}to join the discussion
              </p>
            </div>
          )}

          {/* Comments list */}
          {comments.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No comments yet. Be the first to share your thoughts!
            </p>
          ) : (
            <div className="space-y-4">
              {comments.map((comment) => (
                <div key={comment.id} className="glass-card p-4">
                  <div className="flex items-start gap-3">
                    <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center text-sm font-medium shrink-0">
                      {comment.user?.username?.[0]?.toUpperCase() || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-white text-sm">
                          {comment.user?.display_name || comment.user?.username || 'Anonymous'}
                        </span>
                        <span className="text-xs text-gray-500">
                          {formatRelativeDate(comment.created_at)}
                        </span>
                      </div>
                      <p className="text-gray-300 text-sm whitespace-pre-wrap">
                        {comment.content}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
          </article>

          {/* Sidebar with related reports and patterns */}
          <aside className="lg:w-80 flex-shrink-0 mt-8 lg:mt-0" data-tour-step="sidebar">
            <div className="lg:sticky lg:top-20 space-y-6">
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
  return {
    props: {
      slug: params.slug
    },
    revalidate: 60 // Revalidate every 60 seconds
  }
}
