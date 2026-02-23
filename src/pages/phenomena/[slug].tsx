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

  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONF