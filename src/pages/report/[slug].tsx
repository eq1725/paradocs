// Report detail page - updated Jan 29, 2026
import React, { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import {
  MapPin, Calendar, Clock, Users, Eye, Star,
  ThumbsUp, ThumbsDown, MessageCircle, Share2, Bookmark, BookOpen,
  Award, AlertTriangle, Check, ChevronRight, ChevronDown
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { ReportWithDetails, CommentWithUser } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG } from '@/lib/constants'
import type { ContentType } from '@/lib/database.types'
import { formatDate, formatRelativeDate, classNames, estimateReadingTime } from '@/lib/utils'
import RelatedReports from '@/components/RelatedReports'
import { logActivity } from '@/lib/services/streak.service'
import MediaGallery from '@/components/MediaGallery'
const LogToConstellation = dynamic(
  () => import('@/components/LogToConstellation'),
  { ssr: false }
)
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
  () => import('@/components/reports/AcademicObservationPanel'),
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
  const slug = propSlug || router.query.slug

  const [report, setReport] = useState<ReportWithDetails | null>(initialReport || null)
  const [scrollProgress, setScrollProgress] = useState(0)
  const [comments, setComments] = useState<CommentWithUser[]>(initialComments || [])
  const [media, setMedia] = useState<any[]>(initialMedia || [])
  const [loading, setLoading] = useState(!initialReport && !fetchError)
  cons