'use client'

import React, { useEffect, useState } from 'react'
import Link from 'next/link'
import { Layers, ArrowRight, Sparkles, ChevronDown, LinkIcon } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Report, PhenomenonCategory, PhenomenonType, ReportLinkType } from '@/lib/database.types'
import { CATEGORY_CONFIG } from '@/lib/constants'
import { classNames, formatDate } from '@/lib/utils'

interface RelatedReportsProps {
  reportId: string
  category: PhenomenonCategory
  phenomenonTypeId?: string | null
  caseGroup?: string | null
  tags?: string[]
  location?: {
    country?: string | null
    state_province?: string | null
  }
  limit?: number
}

interface RelatedReport extends Report {
  phenomenon_type?: PhenomenonType | null
  relation_type: 'linked' | 'same_case' | 'same_type' | 'same_category' | 'shared_tags' | 'same_location' | 'cross_disciplinary'
  relevance_score: number
  link_type?: ReportLinkType
}

// Type for Supabase query results with joined phenomenon_type
type ReportQueryResult = Report & { phenomenon_type?: PhenomenonType | null }

type TabKey = 'all' | 'case' | 'same_category' | 'cross_disciplinary'

export default function RelatedReports({
  reportId,
  category,
  phenomenonTypeId,
  caseGroup,
  tags = [],
  location,
  limit = 6
}: RelatedReportsProps) {
  const [relatedReports, setRelatedReports] = useState<RelatedReport[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TabKey>('all')
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    loadRelatedReports()
  }, [reportId, category, phenomenonTypeId, caseGroup])

  async function loadRelatedReports() {
    setLoading(true)
    try {
      const allRelated: RelatedReport[] = []
      const seenIds = new Set<string>()
      seenIds.add(reportId) // exclude current report

      // ── TIER 1: Explicit links from report_links table ──
      try {
        const { data: linksAsSource } = await supabase
          .from('report_links' as any)
          .select('target_report_id, link_type')
          .eq('source_report_id', reportId) as any

        const { data: linksAsTarget } = await supabase
          .from('report_links' as any)
          .select('source_report_id, link_type')
          .eq('target_report_id', reportId) as any

        const linkedIds: { id: string; linkType: string }[] = []
        if (linksAsSource) {
          linksAsSource.forEach((l: any) => linkedIds.push({ id: l.target_report_id, linkType: l.link_type }))
        }
        if (linksAsTarget) {
          linksAsTarget.forEach((l: any) => linkedIds.push({ id: l.source_report_id, linkType: l.link_type }))
        }

        if (linkedIds.length > 0) {
          const uniqueLinkedIds = linkedIds.filter(l => !seenIds.has(l.id))
          const idList = uniqueLinkedIds.map(l => l.id)

          if (idList.length > 0) {
            const { data: linkedReports } = await supabase
              .from('reports')
              .select('*, phenomenon_type:phenomenon_types(*)')
              .in('id', idList)
              .eq('status', 'approved')

            if (linkedReports) {
              (linkedReports as ReportQueryResult[]).forEach(r => {
                const linkInfo = uniqueLinkedIds.find(l => l.id === r.id)
                seenIds.add(r.id)
                allRelated.push({
                  ...r,
                  relation_type: 'linked',
                  relevance_score: 1.0,
                  link_type: linkInfo?.linkType as ReportLinkType,
                })
              })
            }
          }
        }
      } catch {
        // report_links table may not exist yet — silently skip
      }

      // ── TIER 2: Same case_group ──
      if (caseGroup) {
        const { data: caseReports } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .eq('case_group' as any, caseGroup)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(10)

        if (caseReports) {
          (caseReports as ReportQueryResult[]).forEach(r => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id)
              allRelated.push({
                ...r,
                relation_type: 'same_case',
                relevance_score: 0.95,
              })
            }
          })
        }
      }

      // ── TIER 3: Dynamic discovery (existing logic) ──

      // 3a. Same phenomenon type
      if (phenomenonTypeId) {
        const { data: sameType } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .eq('phenomenon_type_id', phenomenonTypeId)
          .eq('status', 'approved')
          .order('created_at', { ascending: false })
          .limit(5)

        if (sameType) {
          (sameType as ReportQueryResult[]).forEach(r => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id)
              allRelated.push({
                ...r,
                relation_type: 'same_type',
                relevance_score: 0.8,
              })
            }
          })
        }
      }

      // 3b. Same category but different type
      const { data: sameCategory } = await supabase
        .from('reports')
        .select('*, phenomenon_type:phenomenon_types(*)')
        .eq('category', category)
        .eq('status', 'approved')
        .neq('phenomenon_type_id', phenomenonTypeId || '')
        .order('upvotes', { ascending: false })
        .limit(5)

      if (sameCategory) {
        (sameCategory as ReportQueryResult[]).forEach(r => {
          if (!seenIds.has(r.id)) {
            seenIds.add(r.id)
            allRelated.push({
              ...r,
              relation_type: 'same_category',
              relevance_score: 0.7,
            })
          }
        })
      }

      // 3c. Same location (geographic clustering)
      if (location?.country) {
        const { data: sameLocation } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .eq('country', location.country)
          .eq('status', 'approved')
          .neq('category', category)
          .order('event_date', { ascending: false })
          .limit(3)

        if (sameLocation) {
          (sameLocation as ReportQueryResult[]).forEach(r => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id)
              allRelated.push({
                ...r,
                relation_type: 'same_location',
                relevance_score: 0.5,
              })
            }
          })
        }
      }

      // 3d. Cross-disciplinary
      const relatedCategories = getRelatedCategories(category)
      if (relatedCategories.length > 0) {
        const { data: crossDisciplinary } = await supabase
          .from('reports')
          .select('*, phenomenon_type:phenomenon_types(*)')
          .in('category', relatedCategories)
          .eq('status', 'approved')
          .order('upvotes', { ascending: false })
          .limit(5)

        if (crossDisciplinary) {
          (crossDisciplinary as ReportQueryResult[]).forEach(r => {
            if (!seenIds.has(r.id)) {
              seenIds.add(r.id)
              allRelated.push({
                ...r,
                relation_type: 'cross_disciplinary',
                relevance_score: 0.4,
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

  const caseCount = relatedReports.filter(r =>
    r.relation_type === 'linked' || r.relation_type === 'same_case'
  ).length
  const sameCategoryCount = relatedReports.filter(r =>
    r.relation_type === 'same_type' || r.relation_type === 'same_category'
  ).length
  const crossDisciplinaryCount = relatedReports.filter(r =>
    r.relation_type === 'cross_disciplinary' || r.relation_type === 'same_location'
  ).length

  const filteredReports = relatedReports.filter(r => {
    if (activeTab === 'all') return true
    if (activeTab === 'case') return r.relation_type === 'linked' || r.relation_type === 'same_case'
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

  // Build tabs dynamically — only show tabs that have results
  const tabs: { key: TabKey; label: string; count?: number; icon?: React.ReactNode }[] = [
    { key: 'all', label: 'All' },
  ]
  if (caseCount > 0) {
    tabs.push({ key: 'case', label: 'Case', count: caseCount, icon: <LinkIcon className="w-3 h-3 inline mr-1 -mt-0.5" /> })
  }
  if (sameCategoryCount > 0) {
    tabs.push({ key: 'same_category', label: 'Similar', count: sameCategoryCount })
  }
  if (crossDisciplinaryCount > 0) {
    tabs.push({ key: 'cross_disciplinary', label: 'Cross-Field', count: crossDisciplinaryCount, icon: <Sparkles className="w-3 h-3 inline mr-1 -mt-0.5" /> })
  }

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
      {tabs.length > 1 && (
        <div className="flex gap-1.5 mb-3 overflow-x-auto no-scrollbar">
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setExpanded(false) }}
              className={classNames(
                'px-2.5 py-1 rounded-md text-xs whitespace-nowrap transition-all',
                activeTab === tab.key
                  ? tab.key === 'case'
                    ? 'bg-red-500/20 text-red-400 font-medium'
                    : tab.key === 'cross_disciplinary'
                      ? 'bg-violet-500/20 text-violet-400 font-medium'
                      : 'bg-primary-500/20 text-primary-400 font-medium'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-gray-300'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && <span className="ml-1 opacity-60">{tab.count}</span>}
            </button>
          ))}
        </div>
      )}

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
                  {report.link_type && (
                    <span className="text-[11px] text-gray-500 truncate">
                      {linkTypeLabels[report.link_type] || report.link_type}
                    </span>
                  )}
                  {!report.link_type && report.phenomenon_type && (
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

const linkTypeLabels: Record<string, string> = {
  witness_account: 'Witness account',
  related_case: 'Related case',
  follow_up: 'Follow-up',
  source_material: 'Source material',
  debunk: 'Debunk',
}

// Compact colored dot indicator
function RelationDot({ type }: { type: RelatedReport['relation_type'] }) {
  const colors: Record<string, string> = {
    linked: 'bg-red-400',
    same_case: 'bg-orange-400',
    same_type: 'bg-green-400',
    same_category: 'bg-blue-400',
    same_location: 'bg-cyan-400',
    cross_disciplinary: 'bg-violet-400',
    shared_tags: 'bg-amber-400',
  }
  const labels: Record<string, string> = {
    linked: 'Linked report',
    same_case: 'Same case',
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
