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

const DAMD{Record<string, { bg: string; text: string }> = {
  'Low': { bg: 'bg-green-900.60', text: 'text-green-400' },
  'Moderate': { bg: 'bg-yellow-900.60', text: 'text-yellow-400' },
  'High': { bg: 'bg-orange-900.60', text: 'text-orange-400' },
  'Extreme': { bg: 'bg-red-900.60', text: 'text-red-400' },
  'Unknown': { bg: 'bg-gray-800.60', text: 'text-gray-400' },
  'Varies': { bg: 'bg-purple-900.60', text: 'text-purple-400' },
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
rounded transition-colors',
                      viewMode === 'grid' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <Grid3X3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => setViewMode('list')}
                    className={classNames(
                      'p-2 rounded transition-colors',
                      viewMode === 'list' ? 'bg-purple-600 text-white' : 'text-gray-400 hover:text-white'
                    )}
                  >
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-500"></div>
            </div>
          ) : filteredPhenomena.length === 0 ? (
            <div className="text-center py-20">
              <p className="text-gray-400 text-lg">No phenomena found matching your search.</p>
            </div>
          ) : selectedCategory === 'all' ? (
            // Grouped view when showing all categories
            <div className="space-y-4">
              {/* Expand/Collapse All controls */}
              <div className="flex items-center justify-end gap-3 mb-2">
                <button
                  onClick={expandAll}
                  className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ChevronDown className="w-4 h-4" />
                  Expand All
                </button>
                <span className="text-gray-700">|</span>
                <button
                  onClick={collapseAll}
                  className="text-sm text-gray-400 hover:text-purple-400 transition-colors flex items-center gap-1"
                >
                  <ChevronUp className="w-4 h-4" />
                  Collapse All
                </button>
              </div>

              {Object.entries(groupedPhenomena).map(([category, items]) => {
                const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG]
                const isCollapsed = collapsedCategories.has(category)
                return (
                  <section key={category} className="border border-gray-800 rounded-xl overflow-hidden">
                    {/* Clickable category header */}
                    <button
                      onClick={() => toggleCategory(category)}
                      className="w-full flex items-center justify-between gap-3 px-5 py-4 bg-gray-900/80 hover:bg-gray-800/80 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{config?.icon}</span>
                        <h2 className="text-xl font-bold text-white">{config?.label}</h2>
                        <span className="text-gray-500 text-sm">({items.length})</span>
                      </div>
                      <ChevronDown
                        className={classNames(
                          'w-5 h-5 text-gray-400 transition-transform duration-200',
                          isCollapsed ? '-rotate-90' : 'rotate-0'
                        )}
                      />
                    </button>

                    {/* Collapsible content */}
                    {!isCollapsed && (
                      <div className="p-4 pt-2">
                        {viewMode === 'grid' ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {items.map(phenomenon => (
                              <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                            ))}
                          </div>
                        ) : (
                          <div className="space-y-2">
                            {items.map(phenomenon => (
                              <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </section>
                )
              })}
            </div>
          ) : (
            // Flat view when category is selected
            viewMode === 'grid' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filteredPhenomena.map(phenomenon => (
                  <PhenomenonCard key={phenomenon.id} phenomenon={phenomenon} />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredPhenomena.map(phenomenon => (
                  <PhenomenonListItem key={phenomenon.id} phenomenon={phenomenon} />
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </>
  )
}

function PhenomenonCard({ phenomenon }: { phenomenon: Phenomenon }) {
  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]
  const [imgError, setImgError] = useState(false)
  const gradient = CATEGORY_GRADIENTS[phenomenon.category] || 'from-gray-800 to-gray-900'
  const qf = phenomenon.ai_quick_facts
  const hasImage = phenomenon.primary_image_url && !imgError

  // Normalize danger level for color lookup
  const dangerKey = qf?.danger_level?.split(' ')?.[0] || ''
  const dangerStyle = DANGER_COLORS[dangerKey] || null

  return (
    <Link href={`/phenomena/${phenomenon.slug}`}>
      <div className="group bg-gray-900 border border-gray-800 rounded-xl overflow-hidden hover:border-purple-500/50 transition-all duration-300 hover:shadow-lg hover:shadow-purple-500/10 hover:scale-[1.02]">
        {/* Image area */}
        <div className={classNames(
          'aspect-video relative overflow-hidden',
          !hasImage ? `bg-gradient-to-br ${gradient}` : ''
        )}>
          {hasImage ? (
            <img
              src={phenomenon.primary_image_url!}
              alt={phenomenon.name}
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              referrerPolicy="no-referrer"
              loading="lazy"
              onError={() => setImgError(true)}
            />
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center gap-2">
              <span className="text-5xl opacity-40 group-hover:opacity-60 group-hover:scale-110 transition-all duration-300">
                {phenomenon.icon || config?.icon}
              </span>
              <span className="text-xs text-gray-500 uppercase tracking-widest font-medium">
                {config?.label}
              </span>
            </div>
          )}

          {/* Quick fact pills overlaid on image */}
          {qf && (
            <div className="absolute bottom-2 left-2 flex flex-wrap gap-1.5">
              {dangerStyle && qf.danger_level && (
                <span className={classNames(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold backdrop-blur-sm',
                  dangerStyle.bg, dangerStyle.text
                )}>
                  <AlertTriangle className="w-2.5 h-2.5" />
                  {qf.danger_level.split(' ')[0]}
                </span>
              )}
              {qf.classification && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-gray-900/70 text-gray-300 backdrop-blur-sm">
                  <Tag className="w-2.5 h-2.5" />
                  {qf.classification.length > 20 ? qf.classification.substring(0, 18) + '...' : qf.classification}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="text-lg font-semibold text-white group-hover:text-purple-400 transition-colors leading-tight">
              {phenomenon.name}
            </h3>
            <ChevronRight className="w-5 h-5 text-gray-500 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-0.5" />
          </div>

          {phenomenon.ai_summary && (
            <p className="text-sm text-gray-400 line-clamp-2 mb-3 leading-relaxed">
              {phenomenon.ai_summary}
            </p>
          )}

          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <span className={classNames(
                'px-2 py-1 rounded-full',
                config?.bgColor || 'bg-gray-800',
                config?.color || 'text-gray-400'
              )}>
                {config?.label}
              </span>
              {qf?.origin && (
                <span className="hidden sm:inline-flex items-center gap-1 text-gray-500">
                  <MapPin className="w-3 h-3" />
                  {qf.origin.length > 15 ? qf.origin.substring(0, 13) + '...' : qf.origin}
                </span>
              )}
            </div>
            <span className="text-gray-500">
              {phenomenon.report_count} report{phenomenon.report_count !== 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>
    </Link>
  )
}

function PhenomenonListItem({ phenomenon }: { phenomenon: Phenomenon }) {
  const config = CATEGORY_CONFIG[phenomenon.category as keyof typeof CATEGORY_CONFIG]

  return (
    <Link href={`/phenomena/${phenomenon.slug}`}>
      <div className="group flex items-center gap-3 sm:gap-4 p-3 sm:p-4 bg-gray-900 border border-gray-800 rounded-lg hover:border-purple-500/50 transition-all">
        {/* Icon */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center bg-gray-800 rounded-lg shrink-0">
          <span className="text-xl sm:text-2xl">{phenomenon.icon || config?.icon}</span>
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-medium group-hover:text-purple-400 transition-colors text-sm sm:text-base">
            {phenomenon.name}
          </h3>
          {phenomenon.ai_summary && (
            <p className="text-xs sm:text-sm text-gray-400 truncate">
              {phenomenon.ai_summary}
            </p>
          )}
        </div>

        {/* Stats */}
        <div className="flex items-center gap-2 sm:gap-4 text-xs sm:text-sm text-gray-500 shrink-0">
          <span className="hidden sm:inline">{phenomenon.report_count} reports</span>
          <span className="sm:hidden">{phenomenon.report_count}</span>
          <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 group-hover:text-purple-400 transition-colors" />
        </div>
      </div>
    </Link>
  )
}
