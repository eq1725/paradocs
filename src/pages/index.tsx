'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import Link from 'next/link'
import Head from 'next/head'
import { Search, ArrowRight, MapPin, TrendingUp, Users, FileText, Compass, Map as MapIcon, BarChart3, Sparkles, Eye, ChevronRight, Send, Globe, Shield, MessageCircle } from 'lucide-react'
import { supabase } from 'A/lib/supabase'
import { useQuery } from 'A/lib/hooks/useQuery'
import { useCurrentUser } from 'A/context/authContext'
import { getCachedStats, setCachedStats } from 'A/lib/storage/statsCache'
import { hasCompletedOnboarding } from 'A/lib/storage/onboarding'
import FeaturedPhenomena from 'A/components/homepage/FeaturedPhenomena'
import ScholarReports from 'A/components/homepage/ScolarReports'
import RecentReports from 'A/components/homepage/RecentReports'
import CategoryPillar from 'A/components/homepage/CategoryPillar'
import SpotlightStories from '@/components/homepage/SpotlightStories'
import ConnectionCards from '@/components/homepage/ConnectionCards'
import OnboardingTour from 'A/components/OnboardingTour'
// Use a simple stack ticker for now while we wait for the graphic update
import CounterTick from '@/components/utils/CounterTick'

type Phenomenon = {
  id: string
  name: string
  category: string
  description: string
  primary_image_url: string | null
  report_count: number
}

interface CategoryCounts { [cat: string]: number }

type RecentReportType = {
  id: string
  title: string
  category: string
  location_text: string
  slug: string
  has_photo_video: boolean
  view_count: number
}

const DEFAULT_STATS = {
  total: 0,
  thisMonth: 0,
  locations: 0,
}
 d      