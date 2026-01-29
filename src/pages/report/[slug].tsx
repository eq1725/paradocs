// Report detail page - updated Jan 29, 2026
import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  ArrowLeft, MapPin, Calendar, Clock, Users, Eye,
  ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark,
  Award, ExternalLink, AlertTriangle
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ReportWithDetails, CommentWithUser } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG } from '@/lib/constants'
import { formatDate, formatRelativeDate, classNames } from '@/lib/utils'
import RelatedReports from '@/components/RelatedReports'
import ReportAIInsight from '@/components/reports/ReportAIInsight'
import PatternConnections from '@/components/reports/PatternConnections'

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
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)

  useEffect(() => {
    if (slug) {
      loadReport()
      checkUser()
    }
  }, [slug])

  async function checkUser() {
    const { data: { session } } = await supabase.auth.getSession()
    setUser(session?.user || null)
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

      // Increment view count
      await supabase
        .from('reports')
        .update({ view_count: reportData.view_count + 1 })
        .eq('id', reportData.id)

      setReport({ ...reportData, view_count: reportData.view_count + 1 })
      setComments(commentsData || [])
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
      // Check existing vote
      const { data: existing } = await supabase
        .from('votes')
        .select('*')
        .eq('user_id', user.id)
        .eq('report_id', report.id)
        .single()

      if (existing) {
        // Remove vote if same type, otherwise update
        if (existing.vote_type === voteType) {
          await supabase.from('votes').delete().eq('id', existing.id)
        } else {
          await supabase.from('votes').update({ vote_type: voteType }).eq('id', existing.id)
        }
      } else {
        // Create new vote
        await supabase.from('votes').insert({
          user_id: user.id,
          report_id: report.id,
          vote_type: voteType,
        })
      }

      // Reload report to get updated counts
      loadReport()
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

  return (
    <>
      <Head>
        <title>{report.title} - ParaDocs</title>
        <meta name="description" content={report.summary} />
      </Head>

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="lg:flex lg:gap-8">
          {/* Main content */}
          <article className="flex-1 max-w-4xl">
        {/* Back link */}
        <Link
          href="/explore"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to explore
        </Link>

        {/* Header */}
        <header className="mb-8">
          <div className="flex flex-wrap items-center gap-3 mb-4">
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

          <h1 className="text-3xl md:text-4xl font-display font-bold text-white mb-4">
            {report.title}
          </h1>

          <p className="text-lg text-gray-300 mb-6">
            {report.summary}
          </p>

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
          </div>
        </header>

        {/* Main content */}
        <div className="glass-card p-6 md:p-8 mb-8">
          <div className="prose prose-invert max-w-none">
            <div className="whitespace-pre-wrap text-gray-300 leading-relaxed">
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

          {/* Tags */}
          {report.tags && report.tags.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2">
              {report.tags.map((tag, i) => (
                <Link
                  key={i}
                  href={`/search?q=${encodeURIComponent(tag)}`}
                  className="px-3 py-1 rounded-full text-xs bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white"
                >
                  #{tag}
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Sidebar info */}
        <div className="grid md:grid-cols-3 gap-6 mb-8">
          {/* Credibility */}
          <div className="glass-card p-5">
            <h4 className="text-sm text-gray-400 mb-2">Credibility</h4>
            <div className={classNames(
              'text-lg font-medium',
              credibilityConfig.color
            )}>
              {credibilityConfig.label}
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {credibilityConfig.description}
            </p>
          </div>

          {/* Source */}
          <div className="glass-card p-5">
            <h4 className="text-sm text-gray-400 mb-2">Source</h4>
            <div className="text-lg font-medium text-white">
              {report.source_type === 'user_submission' ? 'User Submission' : report.source_type}
            </div>
            {report.source_url && (
              <a
                href={report.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-400 hover:text-primary-300 flex items-center gap-1 mt-1"
              >
                View source <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          {/* Submitted */}
          <div className="glass-card p-5">
            <h4 className="text-sm text-gray-400 mb-2">Submitted</h4>
            <div className="text-lg font-medium text-white">
              {formatRelativeDate(report.created_at)}
            </div>
            {report.submitter && !report.anonymous_submission && (
              <p className="text-xs text-gray-500 mt-1">
                by @{report.submitter.username}
              </p>
            )}
          </div>
        </div>

        {/* AI Analysis Section */}
        <ReportAIInsight reportSlug={slug as string} className="mb-8" />

        {/* Location Intelligence Map */}
        {report.latitude && report.longitude && (
          <LocationMap
            reportSlug={slug as string}
            reportTitle={report.title}
            latitude={report.latitude}
            longitude={report.longitude}
            className="mb-8"
          />
        )}

        {/* Actions bar */}
        <div className="flex items-center justify-between py-4 border-y border-white/10 mb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => handleVote(1)}
              disabled={!user}
              className="flex items-center gap-2 text-gray-400 hover:text-green-400 disabled:opacity-50"
            >
              <ThumbsUp className="w-5 h-5" />
              <span>{report.upvotes}</span>
            </button>
            <button
              onClick={() => handleVote(-1)}
              disabled={!user}
              className="flex items-center gap-2 text-gray-400 hover:text-red-400 disabled:opacity-50"
            >
              <ThumbsDown className="w-5 h-5" />
              <span>{report.downvotes}</span>
            </button>
            <span className="flex items-center gap-2 text-gray-400">
              <Eye className="w-5 h-5" />
              <span>{report.view_count}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn btn-ghost text-sm">
              <Bookmark className="w-4 h-4" />
              Save
            </button>
            <button className="btn btn-ghost text-sm">
              <Share2 className="w-4 h-4" />
              Share
            </button>
          </div>
        </div>

        {/* Comments */}
        <section>
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
          <aside className="lg:w-80 flex-shrink-0 mt-8 lg:mt-0">
            <div className="lg:sticky lg:top-8 space-y-6">
              <RelatedReports
                reportId={report.id}
                category={report.category}
                phenomenonTypeId={report.phenomenon_type_id}
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
