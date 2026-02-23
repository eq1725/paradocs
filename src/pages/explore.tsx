'use client'

import React, { useEffect, useState, useCallback, useRef } from 'react'
import { useRouter } from 'next/router'
import Head from 'next/head'
import { Search, SlidersHorizontal, X, ChevronDown, Sparkles, ArrowRight, TrendingUp, MapPin, Heart, Clock, ChevronLeft, ChevronRight as ChevronRightIcon } from 'lucide-react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType, PhenomenonCategory, CredibilityLevel, ContentType } from '@/lib/database.types'
import { CATEGORY_CONFIG, CREDIBILITY_CONFIG, CONTENT_TYPE_CONFIG, COUNTRIES } from '@/lib/constants'
import CategoryFilter from '@/components/CategoryFilter'
import SubcategoryFilter from '@/components/SubcategoryFilter'
import ReportCard from '@/components/ReportCard'
import { classNames } from '@/lib/utils'
import AskTheUnknown from '@/components/AskTheUnknown'
import WelcomeOnboarding, { hasCompletedWelcome } from '@/components/WelcomeOnboarding'

interface FeedReport {
  id: string
  title: string
  slug: string
  summary: string | null
  category: string
  country: string | null
  city: string | null
  state_province: string | null
  event_date: string | null
  credibility: string | null
  upvotes: number
  view_count: number
  comment_count: number
  created_at: string
  phenomenon_type?: { name: string; category: string; slug: string } | null
}

interface FeedSection {
  id: string
  title: string
  subtitle: string
  reports: FeedReport[]
}

type SortOption = 'newest' | 'oldest' | 'popular' | 'most_viewed'

export default function ExplorePage() {
  const router = useRouter()
  const [reports, setReports] = useState<Partial<Report>[]>([])
  const [showWelcome, setShowWelcome] = useState(false)

  useEffect(() => {
    if (!hasCompletedWelcome()) setShowWelcome(true)
  }, [])
  const [loading, setLoading] = useState(true)

  // Feed state
  const [feedSections, setFeedSections] = useState<FeedSection[]>([])
  const [feedLoading, setFeedLoading] = useState(true)
  const [activeView, setActiveView] = useState<'feed' | 'browse'>('feed')

  const [showFilters, setShowFilters] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [baselineCount, setBaselineCount] = useState(0)
  const [page, setPage] = useState(1)
  const perPage = 12

  useEffect(() => {
    async function fetchTotalCount() {
      try {
        const res = await fetch('/api/public/stats')
        if (res.ok) {
          const data = await res.json()
          setBaselineCount(data.total || 0)
          setTotalCount(data.total || 0)
        }
      } catch (_e) {
        setBaselineCount(0)
      }
    }
    fetchTotalCount()
  }, [])

  // Filters
  const [category, setCategory] = useState<PhenomenonCategory | 'all'>('all')
  const [selectedCategories, setSelectedCategories] = useState<PhenomenonCategory[]>([])
  const [selectedTypes, setSelectedTypes] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [country, setCountry] = useState('')
  const [credibility, setCredibility] = useState<CredibilityLevel | ''>('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [sort, setSort] = useState<SortOption>('newest')
  const [hasEvidence, setHasEvidence] = useState(false)
  const [hasMedia, setHasMedia] = useState(false)
  const [featured, setFeatured] = useState(false)
  const [contentType, setContentType] = useState<ContentType | 'all' | 'primary'>('primary') // 'primary' = experiencer + historical + research

  // Restore filter state from URL on mount/navigation
  const [initialized, setInitialized] = useState(false)
  useEffect(() => {
    if (router.isReady) {
      const { category: cat, q, country: c, credibility: cred, featured: feat, sort: s, contentType: ct, page: p } = router.query
      if (cat && typeof cat === 'string') setCategory(cat as PhenomenonCategory)
      if (q && typeof q === 'string') setSearchQuery(q)
      if (c && typeof c === 'string') setCountry(c)
      if (cred && typeof cred === 'string') setCredibility(cred as Cre