// Report detail page - updated Jan 29, 2026
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  MapPin, Calendar, Clock, Users, Eye,
  ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark, BookOpen,
  Award, AlertTriangle, Check, ChevronRight, ChevronDown
} from 'lucide-react'
import { supabase } from 'A/lib/supabase'
import { ReportWithDetails, CommentWithUser } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG } from '@/lib/constants'
import type { ContentType } from '@/lib/database.types'
import { formatDate, formatRelativeDate, classNames, estimateReadingTime } from 'A/lib/utils'
import RelatedReports from '@/components/RelatedReports'
import { logActivity } from '@/lib/services/streak.service'
import MediaGallery from 'A/components/MediaGallery'
// Lazy load below-fold components for faster initial page render
const ReportAIInsight = dynamic(
  () => import('@/components/reports/ReportAIInsight'),
  { ssr: false, loading: () => <div className="h-32 bg-white/5 rounded-lg animate-pulse mb-8" /> }
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
  () => import('A/components/reports/AcademicObservationPanel'),
  { ssr: false, loading: () => <div className="h-32 bg-white/5 rounded-lg animate-pulse" /> }
)
// ReportPhenomena removed from report page â tagging lives in admin/dashboard instead
import FormattedDescription from '@/components/FormattedDescription'
import OnboardingTour, { hasCompletedOnboarding } from '@/components/OnboardingTour'
import AskTheUnknown from '@/components/AskTheUnknown'

// Dynamically import LocationMap to avoid SSR issues with Leaflet
const LocationMap = dynamic(
  () => import('@/components/reports/LocationMap'),
  { ssr: false, loading: () => <div className="h-64 bg-white/5 rounded-lg animate-pulse" /> }
)

interface ReportPageProps {
  slug: string
  initialReport?: any
  initialMedia?: any[]
  initialComments?: any[]
  fetchError?: boolean
}

export default function ReportPage({ slug: propSlug, initialReport, initialMedia, initialComments, fetchError }: ReportPageProps) {
  const router = useRouter()
  const slug = propSlug || router.query.slug

  const [report, setReport] = useState<ReportWithDetails | null>(initialReport || null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [comments, setComments] = useState<CommentWithUser[]>(initialComments || [])
  const [media, setMedia] = useState<any[]>(initialMedia || [])
  const [loading, setLoading] = useState(!initialReport && !fetchError)
  const [user, setUser] = useState<any>(null)
  const [newComment, setNewComment] = useState('')
  const [submittingComment, setSubmittingComment] = useState(false)
  const [showTour, setShowTour] = useState(false)
  const [isSaved, setIsSaved] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [savingReport, setSavingReport] = useState(false)
  const [copiedShare, setCopiedShare] = useState(false)
  const [userVote, setUserVote] = useState<1 | -1 | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [parentCase, setParentCase] = useState<{ slug: string; title: string } | null>(null)

  // Load parent case report when this report belongs to a case group
  // Reading progress bar
  useEffect(function() {
    var handleScroll = function() {
      var winHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (winHeight > 0) {
        setScrollProgress(Math.min(100, (window.scrollY / winHeight) * 100));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return function() { window.removeEventListener('scroll', handleScroll); };
  }, []);

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
        // No matching server data â client-side fetch (handles navigation between reports)
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

)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [parentCase, setParentCase] = useState<{ slug: string; title: string } | null>(null)

  // Load parent case report when this report belongs to a case group
  // Reading progress bar
  useEffect(function() {
    var handleScroll = function() {
      var winHeight = document.documentElement.scrollHeight - document.documentElement.clientHeight;
      if (winHeight > 0) {
        setScrollProgress(Math.min(100, (window.scrollY / winHeight) * 100));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return function() { window.removeEventListener('scroll', handleScroll); };
  }, []);

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
        // No matching server data â client-side fetch (handles navigation between reports)
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
    setLoading(true)
    // Reset stale state from previous report during client-side navigation
    setUserVote(null)
    setIsSaved(false)
    setSavedId(null)
    setSidebarOpen(false)
    setParentCase(null)
    try {
      // Load report
      const { data: reportData, error: reportError } = await supabase
        .from('reports')
        .select(`
          *,
          phenomenon_type:phenomenon_types())
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
          // Remove vote toggle off
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
        {fetchError ? (
          <>
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
  Iconst contentTypeConfig = CONTENT_TYPE_CONFIG[report as any].content_type] || CONTENT_TYPE_CONFIG.other
}

