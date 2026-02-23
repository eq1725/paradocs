'use client'

import React, { useEffect, useState, useCallback } from 'react'
import Head from 'next/head'
import Link from 'next/link'
import { Search, Grid3X3, List, ChevronRight, ChevronDown, ChevronUp, AlertTriangle, MapPin, Tag } from 'lucide-react'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames } from '@/lib/utils'

interface QuickFacts {
  origin?: string
  first_documented?: string
  classification?: string
  danger_level?: string
  typical_encounter?: string
  evidence_types?: string
  active_period?: string
  notable_feature?: string
  cultural_significance?: string
}

interface Phenomenon {
  id: string
  name: string
  slug: string
  category: string
  icon: string
  ai_summary: string | null
  report_count: number
  primary_image_url: string | null
  aliases: string[]
  ai_quick_facts?: QuickFacts | null
}

// Category-specific gradient backgrounds for entries without images
const CATEGORY_GRADIENTS: Record<string, string> = {
  cryptids: 'from-emerald-950 via-gray-900 to-gray-950',
  ufos_aliens: 'from-indigo-950 via-gray-900 to-gray-950',
  ghosts_hauntings: 'from-slate-900 via-purple-950/50 to-gray-950',
  psychic_phenomena: 'from-violet-950 via-gray-900 to-gray-950',
  consciousness_practices: 'from-amber-950/80 via-gray-900 to-gray-950',
  psychological_experiences: 'from-cyan-950 via-gray-900 to-gray-950',
  biological_factors: 'from-rose-950 via-gray-900 to-gray-950',
  perception_sensory: 'from-orange-950 via-gray-900 to-gray-950',
  religion_mythology: 'from-yellow-950/80 via-gray-900 to-gray-950',
  esoteric_practices: 'from-fuchsia-950 via-gray-900 to-gray-950',
  combination: 'from-teal-950 via-gray-900 to-gray-950',
}

const DANGER_COLORS: Record<string, { bg: string; text: string }> = {
  'Low': { bg: 'bg-green-900/60', text: 'text-green-400' },
  'Moderate': { bg: 'bg-yellow-900/60', text: 'text-yellow-400' },
  'High': { bg: 'bg-orange-900/60', text: 'text-orange-400' },
  'Extreme': { bg: 'bg-red-900/60', text: 'text-red-400' },
  'Unknown': { bg: 'bg-gray-800/60', text: 'text-gray-400' },
  'Varies': { bg: 'bg-purple-900/60', text: 'text-purple-400' },
}

type ViewMode = 'grid' | 'list'

const CATEGORY_ORDER = [
  'cryptids',
  'ufos_aliens',
  'ghosts_hauntings',
  'psychic_phenomena',
  'consciousness_practices',
  'psychological_experiences',
  'biological_factors',
  'perception_sensory',
  'religion_mythology',
  'esoteric_practices',
  'combination',
]

export default function PhenomenaPage() {
  const [phenomena, setPhenomena] = useState<Phenomenon[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | 'all'>('all')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set())

  function toggleCategory(cat: string) {
    setCollapsedCategories(prev => {
      const next = new Set(prev)
      if (next.has(cat)) {
        next.delete(cat)
      } else {
        next.add(cat)
      }
      return next
    })
  }

  function expandAll() {
    setCollapsedCategories(new Set())
  }

  function collapseAll() {
    setCollapsedCategories(new Set(CATEGORY_ORDER))
  }

  useEffect(() => {
    loadPhenomena()
  }, [])

  async function loadPhenomena() {
    try {
      const res = await fetch('/api/phenomena')
      const data = await res.json()
      setPhenomena(data.phenomena || [])
    } catch (error) {
      console.error('Error loading phenomena:', error)
    } finally {
      setLoading(false)
    }
  }

  // Filter and group phenomena
  const filteredPhenomena = phenomena.filter(p => {
    const matchesSearch = searchQuery === '' ||
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.aliases?.some(a => a.toLowerCase().includes(searchQuery.toLowerCase())) ||
      p.ai_summary?.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesCategory = selectedCategory === 'all' || p.category === selectedCategory

    return matchesSea