'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Layers, MapPin, Calendar, ArrowRight, Sparkles, ChevronDown } from 'lucide-react'
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
  phenomenon_type?: PhenomenonType | null
  relation_type: 'same_type' | 'same_category' | 'shared_tags' | 'same_location' | 'cross_disciplinary'
  relevance_score: number
}

// Type for Supabase query results with joined phenomenon_type
type ReportQueryResult = Report & { phenomenon_type?: PhenomenonType | null }

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
  const [expanded, setExpanded] = useState(false)

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
          (sameType as ReportQueryResult[]).forEach(r => {
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
        (sameCategory as ReportQueryResult[]).forEach(r => {
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
          (sameLocation as ReportQueryResult[]).forEach(r => {
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
          (crossDisciplinary as ReportQueryResult[]).forEach(r => {
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
      setRelatedReports(allRelated.slice(0, limit * 2))
    } catch (error) {
      console.error('Error loading related reports:', error)
    } finally {
      setLoading(false)
    }
  }

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
  })

  // Show first 4 collapsed, rest on expand
  const INITIAL_COUNT = 4
  const visibleReports = expanded ? filteredReports.slice(0, limit) : filteredReports.slice(0, INITIAL_COUNT)
  const hasMore = filteredReports.length > INITIAL_COUNT

  if (loading) {
    return (
      <div className="glass-card p-4 sm:p-5">
        <h3 className="font-medium text-white mb-3 flex items-center gap-2 text-sm">
          <Layers className="w-4 h-4" />
          Related Reports
        </h3>
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="skeleton h-14 rounded-lg" />
          ))}
        </div>
      </div>
    )
  }

  if (relatedReports.length === 0) {
    return null
  }

  const sameCategoryCount = relatedReports.filter(r =>
    r.relation_type === 'same_type' || r.relation_type === 'same_category'
  ).length
  const crossDisciplinaryCount = relatedReports.filter(r =>
    r.relation_type === 'cross_disciplinary' || r.relation_type === 'same_location'
  ).length

  return (
    <div className="glass-card p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium text-white flex items-center gap-2 text-sm">
          <Layers className="w-4 h-4 text-primary-400" />
          Related Reports
          <span className="text-xs text-gray-500 font-normal">({relatedReports.length})</span>
        </h3>
      </div>

      {/* Compact filter tabs — single row, scrollable */}
      <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
        {[
          { key: 'all' as const, label: 'All' },
          { key: 'same_category' as const, label: 'Similar', count: sameCategoryCount },
          { key: 'cross_disciplinary' as const, label: 'Cross-Field', count: crossDisciplinaryCount },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setExpanded(false) }}
            className={classNames(
              'px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all',
              activeTab === tab.key
                ? tab.key === 'cross_disciplinary'
                  ? 'bg-violet-500/20 text-violet-400 font-medium'
                  : 'bg-primary-500/20 text-primary-400 font-medium'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
            )}
          >
            {tab.key === 'cross_disciplinary' && <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" />}
            {tab.label}
            {tab.count !== undefined && <span className="ml-1 opacity-60">{tab.count}</span>}
          </button>
        ))}
      </div>

      {/* Report cards */}
      <div className="space-y-1.5">
        {visibleReports.map((report) => {
          const config = CATEGORY_CONFIG[report.category as keyof typeof CATEGORY_CONFIG] || CATEGORY_CONFIG.combination
          return (
            <Link
              key={report.id}
              href={`/report/${report.slug}`}
              className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg hover:bg-white/[0.06] transition-colors group"
            >
              {/* Category icon */}
              <span className="text-base flex-shrink-0 leading-none">{config.icon}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-white/90 font-medium line-clamp-1 group-hover:text-primary-400 transition-colors">
                  {report.title}
                </p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <RelationDot type={report.relation_type} />
                  {report.phenomenon_type && (
                    <span className="text-[11px] text-gray-500 truncate">
                      {report.phenomenon_type.name}
                    </span>
                  )}
                  {report.event_date && (
                    <>
                      <span className="text-gray-600 text-[10px]">·</span>
                      <span className="text-[11px] text-gray-500 whitespace-nowrap">
                        {formatDate(report.event_date, 'MMM yyyy')}
                      </span>
                    </>
                  )}
                </div>
              </div>

              {/* Arrow */}
              <ArrowRight className="w-3.5 h-3.5 text-gray-600 group-hover:text-primary-400 flex-shrink-0 transition-colors" />
            </Link>
          )
        })}
      </div>

      {/* Show more / less toggle */}
      {hasMore && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full mt-2 py-1.5 text-xs text-gray-400 hover:text-gray-300 transition-colors flex items-center justify-center gap-1"
        >
          <ChevronDown className={classNames('w-3.5 h-3.5 transition-transform', expanded && 'rotate-180')} />
          {expanded ? 'Show less' : `Show ${filteredReports.length - INITIAL_COUNT} more`}
        </button>
      )}

      {/* Explore link */}
      <Link
        href={`/explore?category=${category}`}
        className="block mt-2 pt-2 border-t border-white/5 text-center text-xs text-primary-400/80 hover:text-primary-300 transition-colors"
      >
        Explore more in this category →
      </Link>
    </div>
  )
}

// Compact colored dot indicator instead of verbose text badges
function RelationDot({ type }: { type: RelatedReport['relation_type'] }) {
  const colors: Record<string, string> = {
    same_type: 'bg-green-400',
    same_category: 'bg-blue-400',
    same_location: 'bg-cyan-400',
    cross_disciplinary: 'bg-violet-400',
    shared_tags: 'bg-amber-400',
  }
  const labels: Record<string, string> = {
    same_type: 'Same type',
    same_category: 'Same category',
    same_location: 'Same region',
    cross_disciplinary: 'Cross-field',
    shared_tags: 'Shared tags',
  }

  return (
    <span
      className={classNames('w-1.5 h-1.5 rounded-full flex-shrink-0', colors[type] || 'bg-gray-400')}
      title={labels[type] || type}
    />
  )
}
