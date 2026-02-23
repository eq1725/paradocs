'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Search, ArrowRight, MapPin, TrendingUp, Users, FileText, Compass, Map as MapIcon, BarChart3, Sparkles, Eye, ChevronRight, Send, Globe, Shield, MessageCircle } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonType } from '@/lib/database.types'
import { Phenomenon } from '@/lib/services/phenomena.service'
import { CATEGORY_CONFIG } from '@/lib/constants'
import ReportCard from '@/components/ReportCard'
import { TrendingPatternsWidget } from '@/components/patterns'
import { hasCompletedOnboarding } from '@/components/OnboardingTour'

const DEFAULT_STATS = { total: 258000, thisMonth: 1000, locations: 14 }
const STATS_CACHE_KEY = 'paradocs_homepage_stats'

function getCachedStats() {
  if (typeof window === 'undefined') return DEFAULT_STATS
  try {
    const cached = localStorage.getItem(STATS_CACHE_KEY)
    if (cached) {
      const parsed = JSON.parse(cached)
      if (parsed.total > 0) return parsed
    }
  } catch (e) {}
  return DEFAULT_STATS
}

function setCachedStats(stats: { total: number; thisMonth: number; locations: number }) {
  if (typeof window === 'undefined') return
  try { localStorage.setItem(STATS_CACHE_KEY, JSON.stringify(stats)) } catch (e) {}
}

// Animated count-up hook
function useCountUp(target: number, duration: number = 2000, start: boolean = true) {
  const [count, setCount] = useState(0)
  const startTime = useRef<number | null>(null)
  const rafId = useRef<number>(0)

  useEffect(() => {
    if (!start || target <= 0) return
    startTime.current = null
    
    function animate(timestamp: number) {
      if (!startTime.current) startTime.current = timestamp
      const progress = Math.min((timestamp - startTime.current) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      setCount(Math.floor(eased * target))
      if (progress < 1) rafId.current = requestAnimationFrame(animate)
    }
    
    rafId.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(rafId.current)
  }, [target, duration, start])

  return count
}

// Ghost card preview data type
interface PreviewCard {
  title: string
  location: string
  phenomenon: string
  category: string
  slug: string
  teaser: string
}

// Cinematic spotlight story
interface SpotlightStory {
  id: string
  title: string
  slug: string
  teaser: string
  location: string
  eventDate: string
  witnessCount: number
  hasEvidence: boolean
  hasMedia: boolean
  category: string
  phenomenon: string
  imageUrl: string | null
  imageCaption: string | null
}

export default function Home() {
  const [featuredReports, setFeaturedReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [recentReports, setRecentReports] = useState<(Report & { phenomenon_type?: PhenomenonType })[]>([])
  const [featuredPhenomena, setFeaturedPhenomena] = useState<Phenomenon[]>([])
  const [stats, setStats] = useState(DEFAULT_STATS)
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [showTourCTA, setShowTourCTA] = useState(false)
  const [statsVisible, setStatsVisible] = useState(false)
  const [previewCards, setPreviewCards] = useState<PreviewCard[]>([])
  const [activePreview, setActivePreview] = useState(0)
  const [spotlightStories, setSpotlightStories] = useState<SpotlightStory[]>([])
  const [spotlightImageLoaded, setSpotlightImageLoaded] = useState(false)
  const [emailInput, setEmailInput] = useState('')
  const [emailSubmitting, setEmailSubmitting] = useState(false)
  const [emailSuccess, setEmailSuccess] = useState(false)
  const [userCount, setUserCount] = useState(0)
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({})
  const statsRef = useRef<HTMLDivElement>(null)

  const animatedTotal = useCountUp(stats.total, 2500, statsVisible)
  const animatedLocations = useCountUp(stats.locations, 1800, statsVisible)
  c