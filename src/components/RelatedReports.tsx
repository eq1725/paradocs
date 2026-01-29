'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Layers, MapPin, Calendar, ArrowRight, Sparkles } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonCategory, PhenomenonType } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames, formatDate } from '@/lib/utils'

interface RelatedReportsProps {
  reportId: string
  category: PhenomenonCategory
  phenomenonTypeId?: string | null
  tags?: string[]
  location?: {
    country?: string | null
    state_province?: string | null
  }
  limit?: number
}

interface RelatedReport extends Report {
  phenomenon_type?: PhenomenonType
  relation_type: 'same_type' | 'same_category' | 'shared_tags' | 'same_location' | 'cross_disciplinary'
  relevance_score: number
}

export default function RelatedReports({
  reportId,
  category,
  phenomenonTypeId,
  tags = [],
  location,
  limit = 6
}: RelatedReportsProps) {
  const [relatedReports, setRelatedReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'all' | 'same_category' | 'cross_disciplinary'>('all')

  useEffect(() => {
    loadRelatedReports()
  }, [reportId, category, phenomenonTypeId])

  async function loadRelatedReports() {
    setLoading(true)
    try {
      const allRelated: RelatedReport[] = []

      // 1. Same phenomenon type (highest relevance)
      if (phenomenonTypeId) {
        const { data: sameType } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .eq('phenomenon_type_id', phenomenonTypeId)
          .eq('status', 'approved')
          .neq('id', reportId)
          .order('created_at', { ascending: false })
          .limit(5)

        if (sameType) {
          sameType.forEach(r => {
            allRelated.push({
              ...r,
              relation_type: 'same_type',
              relevance_score: 1.0
            })
          })
        }
      }

      // 2. Same category but different type
      const { data: sameCategory } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('category', category)
        .eq('status', 'approved')
        .neq('id', reportId)
        .neq('phenomenon_type_id', phenomenonTypeId || '')
        .order('upvotes', { ascending: false })
        .limit(5)

      if (sameCategory) {
        sameCategory.forEach(r => {
          if (!allRelated.find(ar => ar.id === r.id)) {
            allRelated.push({
              ...r,
              relation_type: 'same_category',
              relevance_score: 0.8
            })
          }
        })
      }

      // 3. Same location (geographic clustering)
      if (location?.country) {
        const { data: sameLocation } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .eq('country', location.country)
          .eq('status', 'approved')
          .neq('id', reportId)
          .neq('category', category)
          .order('event_date', { ascending: false })
          .limit(3)

        if (sameLocation) {
          sameLocation.forEach(r => {
            if (!allRelated.find(ar => ar.id === r.id)) {
              allRelated.push({
                ...r,
                relation_type: 'same_location',
                relevance_score: 0.6
              })
            }
          })
        }
      }

      // 4. Cross-disciplinary - reports from related categories
      // Based on category relationships (e.g., UFOs often relate to consciousness)
      const relatedCategories = getRelatedCategories(category)
      if (relatedCategories.length > 0) {
        const { data: crossDisciplinary } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .in('category', relatedCategories)
          .eq('status', 'approved')
          .neq('id', reportId)
          .order('upvotes', { ascending: false })
          .limit(5)

        if (crossDisciplinary) {
          crossDisciplinary.forEach(r => {
            if (!allRelated.find(ar => ar.id === r.id)) {
              allRelated.push({
                ...r,
                relation_type: 'cross_disciplinary',
                relevance_score: 0.5
              })
            }
          })
        }
      }

      // Sort by relevance and limit
      allRelated.sort((a, b) => b.relevance_score - a.relevance_score)
      setRelatedReports(allRelated.slice(0, limit * 2)) // Get more for filtering
    } catch (error) {
      console.error('Error loading related reports:', error)
    } finally {
      setLoading(false)
    }
  }

  // Define relationships between categories for cross-disciplinary analysis
  function getRelatedCategories(cat: PhenomenonCategory): PhenomenonCategory[] {
    const relationships: Record<PhenomenonCategory, PhenomenonCategory[]> = {
      ufos_aliens: ['consciousness_practices', 'psychic_phenomena', 'psychological_experiences'],
      cryptids: ['perception_sensory', 'biological_factors', 'religion_mythology'],
      ghosts_hauntings: ['psychic_phenomena', 'perception_sensory', 'psychological_experiences'],
      psychic_phenomena: ['consciousness_practices', 'ghosts_hauntings', 'ufos_aliens'],
      consciousness_practices: ['psychic_phenomena', 'psychological_experiences', 'esoteric_practices'],
      psychological_experiences: ['consciousness_practices', 'perception_sensory', 'biological_factors'],
      biological_factors: ['psychological_experiences', 'perception_sensory', 'consciousness_practices'],
      perception_sensory: ['psychological_experiences', 'ghosts_hauntings', 'biological_factors'],
      religion_mythology: ['esoteric_practices', 'ghosts_hauntings', 'psychic_phenomena'],
      esoteric_practices: ['consciousness_practices', 'religion_mythology', 'psychic_phenomena'],
      combination: ['ufos_aliens', 'psychic_phenomena', 'consciousness_practices']
    }
    return relationships[cat] || []
  }

  const filteredReports = relatedReports.filter(r => {
    if (activeTab === 'all') return true
    if (activeTab === 'same_category') return r.relation_type === 'same_type' || r.relation_type === 'same_category'
    if (activeTab === 'cross_disciplinary') return r.relation_type === 'cross_disciplinary' || r.relation_type === 'same_location'
    return true
  }).slice(0, limit)

  if (loading) {
    return (
      <div className="glass-card p-5">
        <h3 className="font-medium text-white mb-4 flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Related Reports
        </h3>
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-16 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (relatedReports.length === 0) {
    return null
  }

  const crossDisciplinaryCount = relatedReports.filter(r =>
    r.relation_type === 'cross_disciplinary' || r.relation_type === 'same_location'
  ).length

  return (
    <div className="glass-card p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-medium text-white flex items-center gap-2">
          <Layers className="w-4 h-4" />
          Related Reports
        </h3>
        {crossDisciplinaryCount > 0 && (
          <span className="text-xs bg-violet-500/20 text-violet-400 px-2 py-1 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            {crossDisciplinaryCount} cross-disciplinary
          </span>
        )}
      </div>

      {/* Tab filters */}
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('all')}
          className={classNames(
            'px-3 py-1 rounded-full text-xs transition-colors',
            activeTab === 'all'
              ? 'bg-primary-500/20 text-primary-400'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          )}
        >
          All ({relatedReports.length})
        </button>
        <button
          onClick={() => setActiveTab('same_category')}
          className={classNames(
            'px-3 py-1 rounded-full text-xs transition-colors',
            activeTab === 'same_category'
              ? 'bg-primary-500/20 text-primary-400'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          )}
        >
          Same Category
        </button>
        <button
          onClick={() => setActiveTab('cross_disciplinary')}
          className={classNames(
            'px-3 py-1 rounded-full text-xs transition-colors',
            activeTab === 'cross_disciplinary'
              ? 'bg-violet-500/20 text-violet-400'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          )}
        >
          Cross-Disciplinary
        </button>
      </div>

      {/* Related reports list */}
      <div className="space-y-3">
        {filteredReports.map((report) => {
          const config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
          return (
            <Link
              key={report.id}
              href={`/report/${report.slug}`}
              className="block p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors group"
            >
              <div className="flex items-start gap-3">
                <span className="text-lg">{config.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium line-clamp-1 group-hover:text-primary-400">
                    {report.title}
                  </p>
                  <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                    {report.phenomenon_type && (
                      <span>{report.phenomenon_type.name}</span>
                    )}
                    {report.event_date && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {formatDate(report.event_date, 'MMM yyyy')}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Relation indicator */}
                  <div className="mt-1">
                    <RelationBadge type={report.relation_type} category={report.category} />
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-gray-500 group-hover:text-primary-400 flex-shrink-0" />
              </div>
            </Link>
          )
        })}
      </div>

      {/* View more link */}
      <Link
        href={`/explore?category=${category}`}
        className="block mt-4 text-center text-sm text-primary-400 hover:text-primary-300"
      >
        Explore more in this category
      </Link>
    </div>
  )
}

function RelationBadge({ type, category }: { type: RelatedReport['relation_type'], category: PhenomenonCategory }) {
  const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination

  switch (type) {
    case 'same_type':
      return (
        <span className="text-xs text-green-400/70">
          Same phenomenon type
        </span>
      )
    case 'same_category':
      return (
        <span className={classNames('text-xs', config.color.replace('text-', 'text-').replace('500', '400/70'))}>
          {config.label}
        </span>
      )
    case 'same_location':
      return (
        <span className="text-xs text-cyan-400/70 flex items-center gap-1">
          <MapPin className="w-3 h-3" />
          Same region
        </span>
      )
    case 'cross_disciplinary':
      return (
        <span className="text-xs text-violet-400/70 flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Cross-disciplinary connection
        </span>
      )
    default:
      return null
  }
}
